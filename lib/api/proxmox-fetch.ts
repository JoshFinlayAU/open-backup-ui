// Server-side fetch wrapper for Proxmox VE and PBS that bypasses TLS certificate
// verification. Proxmox installations commonly use self-signed certificates, so
// standard fetch will fail with UNABLE_TO_VERIFY_LEAF_SIGNATURE.
// This module is intentionally server-only (node:https is not available in browsers).

import https from 'node:https';

const tlsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Drop-in replacement for `fetch` that ignores TLS certificate errors.
 * Only use this for Proxmox VE and PBS API calls.
 */
export function proxmoxFetch(url: string, init?: RequestInit): Promise<Response> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);

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

        const options: https.RequestOptions = {
            hostname: parsed.hostname,
            port: parsed.port || 443,
            path: parsed.pathname + parsed.search,
            method: init?.method ?? 'GET',
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
                resolve(new Response(body, {
                    status: res.statusCode ?? 0,
                    statusText: res.statusMessage ?? '',
                    headers: responseHeaders,
                }));
            });
            res.on('error', reject);
        });

        req.on('error', reject);

        if (init?.body != null) {
            req.write(init.body as string);
        }
        req.end();
    });
}
