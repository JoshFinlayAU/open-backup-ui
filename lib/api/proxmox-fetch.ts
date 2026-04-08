// Server-side fetch wrapper for Proxmox VE and PBS that bypasses TLS certificate
// verification. Proxmox installations commonly use self-signed certificates, so
// standard fetch will fail with UNABLE_TO_VERIFY_LEAF_SIGNATURE.
// This module is intentionally server-only (node:https is not available in browsers).

import https from 'node:https';
import { createLogger } from '@/lib/logger';

const logger = createLogger('ProxmoxFetch');

const tlsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Drop-in replacement for `fetch` that ignores TLS certificate errors.
 * Only use this for Proxmox VE and PBS API calls.
 *
 * Every outbound request and the corresponding response status are logged at
 * DEBUG level so authentication and API problems can be traced without
 * capturing sensitive data.  Network-level errors are logged at ERROR level.
 */
export function proxmoxFetch(url: string, init?: RequestInit): Promise<Response> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const method = init?.method ?? 'GET';

        const rawHeaders = init?.headers ?? {};
        const normalizedHeaders: Record<string, string> = {};
        if (rawHeaders instanceof Headers) {
            rawHeaders.forEach((value, key) => { normalizedHeaders[key] = value; });
        } else if (Array.isArray(rawHeaders)) {
            for (const [key, value] of rawHeaders) {
                normalizedHeaders[key] = value;
            }
        } else {
            Object.assign(normalizedHeaders, rawHeaders);
        }

        // Sanitise Cookie header for log output: replace ticket value with placeholder
        const sanitisedCookie = normalizedHeaders['Cookie']
            ? normalizedHeaders['Cookie'].replace(/(PVE|PBS)AuthCookie=[^;]+/, '$1AuthCookie=<redacted>')
            : undefined;

        logger.debug(`${method} ${url}`, {
            contentType: normalizedHeaders['Content-Type'],
            hasCookie: !!sanitisedCookie,
            cookie: sanitisedCookie,
            hasCsrf: !!normalizedHeaders['CSRFPreventionToken'],
            hasBody: init?.body != null,
        });

        const options: https.RequestOptions = {
            hostname: parsed.hostname,
            port: parsed.port || 443,
            path: parsed.pathname + parsed.search,
            method,
            headers: normalizedHeaders,
            agent: tlsAgent,
        };

        const req = https.request(options, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks);
                const responseHeaders: Record<string, string> = {};
                for (const [key, val] of Object.entries(res.headers)) {
                    if (val !== undefined) {
                        responseHeaders[key] = Array.isArray(val) ? val.join(', ') : val;
                    }
                }

                const status = res.statusCode ?? 0;

                if (status >= 400) {
                    logger.warn(`${method} ${url} → ${status} ${res.statusMessage ?? ''}`);
                } else {
                    logger.debug(`${method} ${url} → ${status} ${res.statusMessage ?? ''}`);
                }

                resolve(new Response(body, {
                    status,
                    statusText: res.statusMessage ?? '',
                    headers: responseHeaders,
                }));
            });
            res.on('error', (err) => {
                logger.error(`${method} ${url} — response stream error`, err);
                reject(err);
            });
        });

        req.on('error', (err) => {
            logger.error(`${method} ${url} — network error`, err);
            reject(err);
        });

        if (init?.body != null) {
            const bodyStr = init.body as string;
            const bodyBytes = Buffer.byteLength(bodyStr);
            // Set Content-Length so Node.js doesn't use chunked transfer encoding,
            // which Proxmox's HTTP server does not accept for POST bodies.
            if (!normalizedHeaders['Content-Length'] && !normalizedHeaders['content-length']) {
                req.setHeader('Content-Length', bodyBytes);
                logger.debug(`${method} ${url} — Content-Length set to ${bodyBytes}`);
            }
            req.write(bodyStr);
        }
        req.end();
    });
}
