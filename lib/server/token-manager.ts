import { configStore } from './config-store';
import { createLogger } from '@/lib/logger';

const logger = createLogger('TokenManager');

interface TokenCache {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number; // Unix timestamp
}

// Global cache to survive HMR in development
const globalForToken = global as unknown as {
    tokenCache: Map<string, TokenCache>;
    authPromises: Map<string, Promise<string | null>>;
};

const tokenCache = globalForToken.tokenCache || new Map<string, TokenCache>();
const authPromises = globalForToken.authPromises || new Map<string, Promise<string | null>>();

if (process.env.NODE_ENV !== 'production') {
    globalForToken.tokenCache = tokenCache;
    globalForToken.authPromises = authPromises;
}

// Platform-specific auth configurations
const authConfigs = {
    vbr: {
        authPath: '/api/oauth2/token',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
            'x-api-version': '1.3-rev1'
        }
    },
    vb365: {
        authPath: '/v7/Token',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
        }
    }
};

export const tokenManager = {
    /**
     * Retrieves a valid access token for the given source ID.
     * If cached token is missing or expired, it attempts to log in again.
     */
    async getToken(sourceId: string): Promise<string | null> {
        // 1. Check cache
        const cached = tokenCache.get(sourceId);
        const now = Date.now() / 1000;

        if (cached && cached.expiresAt > now + 60) {
            // Token is valid (buffer of 60s)
            logger.debug(`Using cached token for ${sourceId} (expires in ${Math.round(cached.expiresAt - now)}s)`);
            return cached.accessToken;
        }

        // 2. Check overlap (In-flight request)
        if (authPromises.has(sourceId)) {
            logger.debug(`Reusing in-flight auth request for ${sourceId}`);
            return authPromises.get(sourceId)!;
        }

        // 3. Refresh / Re-login
        logger.info(`Token for ${sourceId} missing or expired — authenticating`);

        // Create a new promise and store it
        const promise = this.authenticate(sourceId).finally(() => {
            // Remove from promises map when done (success or fail)
            authPromises.delete(sourceId);
        });

        authPromises.set(sourceId, promise);
        return promise;
    },

    /**
     * Forces a new authentication (useful if 401 is received despite cached token)
     */
    async refreshToken(sourceId: string): Promise<string | null> {
        logger.info(`Forcing token refresh for ${sourceId}`);
        tokenCache.delete(sourceId); // Clear cache

        if (authPromises.has(sourceId)) {
            logger.debug(`Reusing in-flight auth request for ${sourceId}`);
            return authPromises.get(sourceId)!;
        }

        const promise = this.authenticate(sourceId).finally(() => {
            authPromises.delete(sourceId);
        });

        authPromises.set(sourceId, promise);
        return promise;
    },

    /**
     * Internal method to perform login against VBR or VB365 API
     */
    async authenticate(sourceId: string): Promise<string | null> {
        const source = configStore.getById(sourceId);
        if (!source || !source.password) {
            logger.error(`Source ${sourceId} not found or missing credentials`);
            return null;
        }

        const platform = source.platform || 'vbr';
        const config = authConfigs[platform as keyof typeof authConfigs];

        if (!config) {
            logger.error(`Unsupported platform: ${platform} (sourceId=${sourceId})`);
            return null;
        }

        const baseUrl = `${source.protocol}://${source.host}:${source.port}`;
        const loginUrl = `${baseUrl}${config.authPath}`;

        try {
            logger.info(`Logging into ${loginUrl} as ${source.username} (platform=${platform})`);

            // Standard OAuth2 Password Grant
            const body = new URLSearchParams();
            body.append('grant_type', 'password');
            body.append('username', source.username);
            body.append('password', source.password);

            const response = await fetch(loginUrl, {
                method: 'POST',
                headers: config.headers,
                body: body
            });

            if (!response.ok) {
                const text = await response.text();
                logger.error(`Login failed for ${sourceId}: HTTP ${response.status} — ${text}`);
                return null;
            }

            const data = await response.json();
            const accessToken = data.access_token;
            const expiresIn = data.expires_in; // seconds

            if (!accessToken) {
                logger.error(`No access_token in auth response for ${sourceId}`);
                return null;
            }

            tokenCache.set(sourceId, {
                accessToken,
                refreshToken: data.refresh_token,
                expiresAt: (Date.now() / 1000) + (expiresIn || 3600)
            });

            logger.info(`Successfully authenticated ${sourceId} (expires in ${expiresIn ?? 3600}s)`);
            return accessToken;

        } catch (error) {
            logger.error(`Auth error for ${sourceId}`, error);
            return null;
        }
    }
};
