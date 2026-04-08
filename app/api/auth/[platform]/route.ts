import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { setChunkedCookie, deleteChunkedCookie } from "@/lib/utils/cookie-manager"
import { configStore, VBRSource } from "@/lib/server/config-store"
import { tokenManager } from "@/lib/server/token-manager"
import { proxmoxFetch } from "@/lib/api/proxmox-fetch"
import { createLogger } from "@/lib/logger"

const logger = createLogger('Auth')

// Platform-specific auth configurations
const platformConfigs = {
    vbr: {
        authPath: "/api/oauth2/token",
        grantType: "password",
        tokenCookie: "veeam_vbr_token"
    },
    vb365: {
        authPath: "/v7/Token",
        grantType: "password",
        tokenCookie: "veeam_vb365_token"
    },
    vro: {
        authPath: "/api/oauth2/token",
        grantType: "password",
        tokenCookie: "veeam_vro_token"
    },
    "veeam-one": {
        authPath: "/api/token",
        grantType: "password",
        tokenCookie: "veeam_one_token"
    },
    one: {
        authPath: "/api/token",
        grantType: "password",
        tokenCookie: "veeam_one_token"
    },
    kasten: {
        authPath: "/api/v1/auth",
        grantType: "password",
        tokenCookie: "kasten_token"
    },
    proxmox: {
        authPath: "/api2/json/access/ticket",
        grantType: "password",
        tokenCookie: "proxmox_ticket"
    },
    pbs: {
        authPath: "/api2/json/access/ticket",
        grantType: "password",
        tokenCookie: "pbs_ticket"
    }
}

// Helper to determine if secure cookies should be used
const isSecure = (proto: string) => process.env.NODE_ENV === 'production' && proto === 'https:';

type Platform = keyof typeof platformConfigs

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ platform: string }> }
) {
    try {
        const { platform } = await params

        if (!platformConfigs[platform as Platform]) {
            logger.warn(`Auth attempt for unknown platform: ${platform}`)
            return NextResponse.json(
                { error: "Unknown platform" },
                { status: 400 }
            )
        }

        const config = platformConfigs[platform as Platform]
        const body = await request.json()
        const { url, username, password, sourceId } = body

        if (!sourceId && (!url || !username || !password)) {
            logger.warn(`Auth request for ${platform} missing required fields`)
            return NextResponse.json(
                { error: "Missing required fields: url, username, password" },
                { status: 400 }
            )
        }

        logger.info(`Auth request — platform=${platform} username=${username ?? '(from store)'} url=${url ?? '(from store)'}`)

        // Populate credentials from store if sourceId provided (for all platforms)
        let resolvedUrl = url
        let resolvedUsername = username
        let resolvedPassword = password

        if (sourceId && !resolvedPassword) {
            logger.debug(`Resolving credentials from config store for sourceId=${sourceId}`)
            const source = configStore.getById(sourceId)
            if (source) {
                resolvedUsername = source.username
                resolvedPassword = source.password
                resolvedUrl = `${source.protocol}://${source.host}:${source.port}`
                logger.debug(`Resolved credentials: username=${resolvedUsername}, url=${resolvedUrl}`)
            } else {
                logger.warn(`sourceId ${sourceId} not found in config store`)
            }
        }

        const cookieStore = await cookies()

        // === ZERO: Server-Side Logic for Stored Credentials (VBR/VB365) ===
        if (sourceId && (platform === "vbr" || platform === "vb365")) {
            const token = await tokenManager.authenticate(sourceId)

            if (token) {
                // Success: Set Source ID Cookie
                const cookieName = platform === "vb365" ? 'veeam_vb365_source_id' : 'veeam_source_id'
                const urlCookieName = platform === "vb365" ? 'veeam_vb365_token_url' : 'veeam_vbr_token_url'
                const source = configStore.getById(sourceId)

                if (source) {
                    cookieStore.set(cookieName, sourceId, {
                        secure: isSecure(request.nextUrl.protocol),
                        httpOnly: true,
                        path: '/',
                        maxAge: 60 * 60 * 24 * 7,
                        sameSite: 'lax'
                    });

                    // Set URL cookie for client reference
                    const sourceUrl = `${source.protocol}://${source.host}:${source.port}`
                    cookieStore.set(urlCookieName, sourceUrl, {
                        secure: isSecure(request.nextUrl.protocol),
                        path: '/',
                        maxAge: 60 * 60 * 24 * 7
                    });

                logger.info(`Authenticated via stored credentials: ${sourceId}`)
                return NextResponse.json({ success: true, sourceId });
                }
            }

            // Fallthrough if auth fails (client might try manual login)
            logger.error(`Authentication failed with stored credentials for ${sourceId}`)
            return NextResponse.json(
                { error: "Authentication failed with stored credentials." },
                { status: 401 }
            )
        }

        // === ONE: Server-Side Logic for VBR ===
        if (platform === "vbr") {
            // Parse host from URL
            let host = url.replace(/https?:\/\//, '').replace(/\/$/, '');
            let port = 9419;
            if (host.includes(':')) {
                const parts = host.split(':');
                host = parts[0];
                port = parseInt(parts[1], 10);
            }

            const sourceId = `vbr-${host}-${port}`;
            logger.info(`VBR auth attempt — sourceId=${sourceId} username=${username}`)

            const source: VBRSource = {
                id: sourceId,
                host,
                port,
                username,
                password,
                protocol: 'https',
                platform: 'vbr'
            };

            // Save Credentials
            configStore.save(source);

            // Attempt Login
            const token = await tokenManager.authenticate(sourceId);

            if (!token) {
                configStore.delete(sourceId);
                logger.error(`VBR authentication failed for ${sourceId}`)
                return NextResponse.json(
                    { error: "Authentication failed. Check your data source credentials." },
                    { status: 401 }
                )
            }

            // Success: Set Source ID Cookie
            cookieStore.set('veeam_source_id', sourceId, {
                secure: isSecure(request.nextUrl.protocol),
                httpOnly: true,
                path: '/',
                maxAge: 60 * 60 * 24 * 7,
                sameSite: 'lax'
            });

            // Set URL cookie for client reference
            cookieStore.set('veeam_vbr_token_url', `https://${host}:${port}`, {
                secure: isSecure(request.nextUrl.protocol),
                path: '/',
                maxAge: 60 * 60 * 24 * 7
            });

            // Clean up legacy token cookies
            await deleteChunkedCookie(cookieStore, config.tokenCookie);

            logger.info(`VBR authenticated: ${sourceId}`)
            return NextResponse.json({ success: true, sourceId });
        }

        // === VB365: Server-Side Logic (same pattern as VBR) ===
        if (platform === "vb365") {
            // Parse host from URL
            let host = url.replace(/https?:\/\//, '').replace(/\/$/, '');
            let port = 4443;
            if (host.includes(':')) {
                const parts = host.split(':');
                host = parts[0];
                port = parseInt(parts[1], 10);
            }

            const sourceId = `vb365-${host}-${port}`;
            logger.info(`VB365 auth attempt — sourceId=${sourceId} username=${username}`)

            const source: VBRSource = {
                id: sourceId,
                host,
                port,
                username,
                password,
                protocol: 'https',
                platform: 'vb365'
            };

            // Save Credentials
            configStore.save(source);

            // Attempt Login via Token Manager
            const token = await tokenManager.authenticate(sourceId);

            if (!token) {
                configStore.delete(sourceId);
                logger.error(`VB365 authentication failed for ${sourceId}`)
                return NextResponse.json(
                    { error: "Authentication failed. Check your VB365 credentials." },
                    { status: 401 }
                )
            }

            // Success: Set Source ID Cookie
            cookieStore.set('veeam_vb365_source_id', sourceId, {
                secure: isSecure(request.nextUrl.protocol),
                httpOnly: true,
                path: '/',
                maxAge: 60 * 60 * 24 * 7,
                sameSite: 'lax'
            });

            // Set URL cookie for client reference
            cookieStore.set('veeam_vb365_token_url', `https://${host}:${port}`, {
                secure: isSecure(request.nextUrl.protocol),
                path: '/',
                maxAge: 60 * 60 * 24 * 7
            });

            // Clean up legacy token cookies
            await deleteChunkedCookie(cookieStore, config.tokenCookie);

            logger.info(`VB365 authenticated: ${sourceId}`)
            return NextResponse.json({ success: true, sourceId });
        }

        // === PROXMOX VE: Ticket-based auth ===
        if (platform === "proxmox") {
            let host = url.replace(/https?:\/\//, '').replace(/\/$/, '');
            let port = 8006;
            if (host.includes(':')) {
                const parts = host.split(':');
                host = parts[0];
                port = parseInt(parts[1], 10);
            }

            const sourceId = `proxmox-${host}-${port}`;
            const baseUrl = `https://${host}:${port}`;

            logger.info(`Proxmox VE auth attempt — sourceId=${sourceId} username=${username}`)

            // Build body exactly as curl does: username sent raw (preserving @),
            // password URL-encoded to handle special characters.
            const proxmoxBody = `username=${username}&password=${encodeURIComponent(password)}`;

            const authResponse = await proxmoxFetch(`${baseUrl}/api2/json/access/ticket`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: proxmoxBody
            });

            if (!authResponse.ok) {
                logger.error(`Proxmox VE auth failed for ${username}@${host}: HTTP ${authResponse.status}`)
                return NextResponse.json(
                    { error: "Authentication failed. Check your Proxmox credentials." },
                    { status: 401 }
                );
            }

            const authData = await authResponse.json();
            const ticket = authData?.data?.ticket;
            const csrfToken = authData?.data?.CSRFPreventionToken;

            if (!ticket) {
                logger.error(`Proxmox VE auth response for ${username} contained no ticket`)
                return NextResponse.json(
                    { error: "No ticket received from Proxmox." },
                    { status: 401 }
                );
            }

            logger.debug(`Proxmox VE ticket received for ${sourceId}, hasCsrf=${!!csrfToken}`)

            const source: VBRSource = {
                id: sourceId,
                host,
                port,
                username,
                password,
                protocol: 'https',
                platform: 'proxmox'
            };
            configStore.save(source);

            cookieStore.set('proxmox_source_id', sourceId, {
                secure: isSecure(request.nextUrl.protocol),
                httpOnly: true,
                path: '/',
                maxAge: 60 * 60 * 24 * 7,
                sameSite: 'lax'
            });
            cookieStore.set('proxmox_ticket', ticket, {
                secure: isSecure(request.nextUrl.protocol),
                httpOnly: true,
                path: '/',
                maxAge: 60 * 60 * 2,
                sameSite: 'lax'
            });
            if (csrfToken) {
                cookieStore.set('proxmox_csrf', csrfToken, {
                    secure: isSecure(request.nextUrl.protocol),
                    httpOnly: true,
                    path: '/',
                    maxAge: 60 * 60 * 2,
                    sameSite: 'lax'
                });
            }
            cookieStore.set('proxmox_url', baseUrl, {
                secure: isSecure(request.nextUrl.protocol),
                path: '/',
                maxAge: 60 * 60 * 24 * 7
            });

            logger.info(`Proxmox VE authenticated: ${sourceId}`)
            return NextResponse.json({ success: true, sourceId });
        }

        // === PROXMOX BACKUP SERVER: Ticket-based auth ===
        if (platform === "pbs") {
            let host = url.replace(/https?:\/\//, '').replace(/\/$/, '');
            let port = 8007;
            if (host.includes(':')) {
                const parts = host.split(':');
                host = parts[0];
                port = parseInt(parts[1], 10);
            }

            const sourceId = `pbs-${host}-${port}`;
            const baseUrl = `https://${host}:${port}`;

            logger.info(`PBS auth attempt — sourceId=${sourceId} username=${username}`)

            // Build body exactly as curl does: username sent raw (preserving @),
            // password URL-encoded to handle special characters.
            const pbsBody = `username=${username}&password=${encodeURIComponent(password)}`;

            const authResponse = await proxmoxFetch(`${baseUrl}/api2/json/access/ticket`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: pbsBody
            });

            if (!authResponse.ok) {
                logger.error(`PBS auth failed for ${username}@${host}: HTTP ${authResponse.status}`)
                return NextResponse.json(
                    { error: "Authentication failed. Check your PBS credentials." },
                    { status: 401 }
                );
            }

            const authData = await authResponse.json();
            const ticket = authData?.data?.ticket;
            const csrfToken = authData?.data?.CSRFPreventionToken;

            if (!ticket) {
                logger.error(`PBS auth response for ${username} contained no ticket`)
                return NextResponse.json(
                    { error: "No ticket received from Proxmox Backup Server." },
                    { status: 401 }
                );
            }

            logger.debug(`PBS ticket received for ${sourceId}, hasCsrf=${!!csrfToken}`)

            const source: VBRSource = {
                id: sourceId,
                host,
                port,
                username,
                password,
                protocol: 'https',
                platform: 'pbs'
            };
            configStore.save(source);

            cookieStore.set('pbs_source_id', sourceId, {
                secure: isSecure(request.nextUrl.protocol),
                httpOnly: true,
                path: '/',
                maxAge: 60 * 60 * 24 * 7,
                sameSite: 'lax'
            });
            cookieStore.set('pbs_ticket', ticket, {
                secure: isSecure(request.nextUrl.protocol),
                httpOnly: true,
                path: '/',
                maxAge: 60 * 60 * 2,
                sameSite: 'lax'
            });
            if (csrfToken) {
                cookieStore.set('pbs_csrf', csrfToken, {
                    secure: isSecure(request.nextUrl.protocol),
                    httpOnly: true,
                    path: '/',
                    maxAge: 60 * 60 * 2,
                    sameSite: 'lax'
                });
            }
            cookieStore.set('pbs_url', baseUrl, {
                secure: isSecure(request.nextUrl.protocol),
                path: '/',
                maxAge: 60 * 60 * 24 * 7
            });

            logger.info(`PBS authenticated: ${sourceId}`)
            return NextResponse.json({ success: true, sourceId });
        }

        // === LEGACY: Client-Side Logic for other platforms (VRO, ONE, etc) ===
        // Normalize URL
        const baseUrl = resolvedUrl ? resolvedUrl.replace(/\/+$/, "") : ""

        // Use legacy direct fetch
        let authResponse;
        if (platform === "vb365" || platform === "veeam-one" || platform === "one" || platform === "vro") {
            const formData = new URLSearchParams()
            formData.append("grant_type", config.grantType)
            formData.append("username", resolvedUsername)
            formData.append("password", resolvedPassword)
            authResponse = await fetch(`${baseUrl}${config.authPath}`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: formData.toString()
            })
        } else {
            // Default JSON
            authResponse = await fetch(`${baseUrl}${config.authPath}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: resolvedUsername, password: resolvedPassword })
            })
        }

        if (!authResponse.ok) {
            throw new Error(`Authentication failed for ${platform}`)
        }

        const tokenData = await authResponse.json()
        const token = tokenData.access_token || tokenData.token || tokenData.accessToken

        if (!token) throw new Error("No token received")

        // === Save Source to Config Store (for legacy platforms like veeam-one, vro, kasten) ===
        // Parse host and port from URL for storage
        let parsedHost = resolvedUrl.replace(/https?:\/\//, '').replace(/\/$/, '');
        let parsedPort = 443; // Default HTTPS port
        if (parsedHost.includes(':')) {
            const parts = parsedHost.split(':');
            parsedHost = parts[0];
            parsedPort = parseInt(parts[1], 10);
        }

        // Map platform to correct internal name
        const platformMap: Record<string, 'vbr' | 'vb365' | 'vro' | 'one'> = {
            'veeam-one': 'one',
            'vro': 'vro'
        };
        const storedPlatform = platformMap[platform] || platform as 'vbr' | 'vb365' | 'vro' | 'one';

        const legacySourceId = `${storedPlatform}-${parsedHost}-${parsedPort}`;

        const legacySource: VBRSource = {
            id: legacySourceId,
            host: parsedHost,
            port: parsedPort,
            username: resolvedUsername,
            password: resolvedPassword,
            protocol: 'https',
            platform: storedPlatform
        };

        // Save Credentials for future Auto Connect
        configStore.save(legacySource);

        // Set source ID cookie for session tracking
        const sourceIdCookieName = platform === 'veeam-one' ? 'veeam_one_source_id' : `veeam_${platform}_source_id`;
        cookieStore.set(sourceIdCookieName, legacySourceId, {
            httpOnly: true,
            secure: isSecure(request.nextUrl.protocol),
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7, // 7 days
            path: '/'
        });

        await setChunkedCookie(cookieStore, config.tokenCookie, token, {
            httpOnly: true,
            secure: isSecure(request.nextUrl.protocol),
            sameSite: "lax",
            maxAge: 60 * 60 * 8, // 8 hours
            path: "/"
        })

        cookieStore.set(`${config.tokenCookie}_url`, baseUrl, {
            httpOnly: true,
            secure: isSecure(request.nextUrl.protocol),
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 30, // 30 days
            path: "/"
        })

        logger.info(`Legacy auth succeeded for ${platform} — sourceId=${legacySourceId}`)
        return NextResponse.json({ success: true, sourceId: legacySourceId })

    } catch (error) {
        logger.error('Auth route error', error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Authentication failed" },
            { status: 500 }
        )
    }
}

// Check session validity
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ platform: string }> }
) {
    try {
        const { platform } = await params
        const config = platformConfigs[platform as Platform]
        if (!config) return NextResponse.json({ authenticated: false })

        const cookieStore = await cookies()

        if (platform === 'vbr') {
            const sourceId = cookieStore.get('veeam_source_id')?.value;
            if (sourceId) {
                // Technically we should valid the token here, but existence of sourceId implies "configured"
                return NextResponse.json({ authenticated: true, url: cookieStore.get('veeam_vbr_token_url')?.value })
            }
        }

        if (platform === 'proxmox') {
            const sourceId = cookieStore.get('proxmox_source_id')?.value;
            const ticket = cookieStore.get('proxmox_ticket')?.value;
            if (sourceId || ticket) {
                return NextResponse.json({ authenticated: true, url: cookieStore.get('proxmox_url')?.value })
            }
            return NextResponse.json({ authenticated: false })
        }

        if (platform === 'pbs') {
            const sourceId = cookieStore.get('pbs_source_id')?.value;
            const ticket = cookieStore.get('pbs_ticket')?.value;
            if (sourceId || ticket) {
                return NextResponse.json({ authenticated: true, url: cookieStore.get('pbs_url')?.value })
            }
            return NextResponse.json({ authenticated: false })
        }

        const token = cookieStore.get(config.tokenCookie)?.value
        const url = cookieStore.get(`${config.tokenCookie}_url`)?.value

        if (!token || !url) {
            return NextResponse.json({ authenticated: false })
        }

        return NextResponse.json({ authenticated: true, url })
    } catch (error) {
        logger.error('Session check error', error)
        return NextResponse.json({ authenticated: false })
    }
}

// Logout / clear session
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ platform: string }> }
) {
    try {
        const { platform } = await params
        const config = platformConfigs[platform as Platform]
        const cookieStore = await cookies()

        // Determine the source ID cookie name based on platform
        let sourceIdCookieName: string
        let urlCookieName: string

        switch (platform) {
            case 'vbr':
                sourceIdCookieName = 'veeam_source_id'
                urlCookieName = 'veeam_vbr_token_url'
                break
            case 'vb365':
                sourceIdCookieName = 'veeam_vb365_source_id'
                urlCookieName = 'veeam_vb365_token_url'
                break
            case 'veeam-one':
            case 'one':
                sourceIdCookieName = 'veeam_one_source_id'
                urlCookieName = 'veeam_one_token_url'
                break
            case 'vro':
                sourceIdCookieName = 'veeam_vro_source_id'
                urlCookieName = 'veeam_vro_token_url'
                break
            case 'proxmox':
                sourceIdCookieName = 'proxmox_source_id'
                urlCookieName = 'proxmox_url'
                break
            case 'pbs':
                sourceIdCookieName = 'pbs_source_id'
                urlCookieName = 'pbs_url'
                break
            default:
                sourceIdCookieName = `veeam_${platform}_source_id`
                urlCookieName = `veeam_${platform}_token_url`
        }

        // Remove from server config store
        const sourceId = cookieStore.get(sourceIdCookieName)?.value
        if (sourceId) {
            configStore.delete(sourceId)
        }

        // Also try to find and delete by platform type from configStore
        const allSources = configStore.getAll()
        const platformName = platform === 'veeam-one' ? 'one' : platform
        const matchingSource = allSources.find(s => s.platform === platformName)
        if (matchingSource) {
            configStore.delete(matchingSource.id)
        }

        // Clear cookies
        cookieStore.delete(sourceIdCookieName)
        cookieStore.delete(urlCookieName)

        if (platform === 'proxmox') {
            cookieStore.delete('proxmox_ticket')
            cookieStore.delete('proxmox_csrf')
        } else if (platform === 'pbs') {
            cookieStore.delete('pbs_ticket')
            cookieStore.delete('pbs_csrf')
        } else {
            await deleteChunkedCookie(cookieStore, config.tokenCookie)
            cookieStore.delete(`${config.tokenCookie}_url`)
        }

        logger.info(`Logout successful for platform=${platform}`)
        return NextResponse.json({ success: true })
    } catch (error) {
        logger.error('Logout error', error)
        return NextResponse.json(
            { error: "Logout failed" },
            { status: 500 }
        )
    }
}
