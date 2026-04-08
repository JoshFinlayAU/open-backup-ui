// Proxmox VE and PBS API Client (server-side only)
// Proxmox uses ticket-based authentication, not OAuth2.

import { cookies } from 'next/headers';
import { configStore } from '@/lib/server/config-store';
import { proxmoxFetch } from '@/lib/api/proxmox-fetch';
import { createLogger } from '@/lib/logger';

const pveLogger = createLogger('ProxmoxClient');
const pbsLogger = createLogger('PBSClient');

interface ProxmoxCredentials {
    baseUrl: string;
    ticket: string;
    csrfToken?: string;
}

/**
 * Retrieve Proxmox VE credentials from cookies / config store.
 * Returns null if no valid session exists.
 */
async function getProxmoxCredentials(): Promise<ProxmoxCredentials | null> {
    const cookieStore = await cookies();

    // First attempt: ticket from cookie (short-lived)
    const ticket = cookieStore.get('proxmox_ticket')?.value;
    const csrf = cookieStore.get('proxmox_csrf')?.value;
    const url = cookieStore.get('proxmox_url')?.value;

    if (ticket && url) {
        pveLogger.debug(`Using ticket from session cookie (url=${url}, hasCsrf=${!!csrf})`);
        return { baseUrl: url, ticket, csrfToken: csrf };
    }

    // Fallback: re-authenticate via stored credentials
    pveLogger.debug('No ticket cookie found, attempting re-auth via config store');
    const sourceId = cookieStore.get('proxmox_source_id')?.value;
    if (!sourceId) {
        pveLogger.warn('No proxmox_source_id cookie — cannot re-authenticate');
        return null;
    }

    const source = configStore.getById(sourceId);
    if (!source || !source.password) {
        pveLogger.error(`Source ${sourceId} not found in config store or missing password`);
        return null;
    }

    const baseUrl = `${source.protocol}://${source.host}:${source.port}`;
    pveLogger.info(`Re-authenticating to Proxmox VE at ${baseUrl} as ${source.username}`);
    const body = `username=${source.username}&password=${encodeURIComponent(source.password)}`;

    try {
        const res = await proxmoxFetch(`${baseUrl}/api2/json/access/ticket`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body
        });
        if (!res.ok) {
            pveLogger.error(`Re-auth failed: HTTP ${res.status}`);
            return null;
        }
        const data = await res.json();
        const newTicket = data?.data?.ticket;
        const newCsrf = data?.data?.CSRFPreventionToken;
        if (!newTicket) {
            pveLogger.error('Re-auth response contained no ticket');
            return null;
        }
        pveLogger.info(`Re-auth successful for ${source.username} at ${baseUrl}`);
        return { baseUrl, ticket: newTicket, csrfToken: newCsrf };
    } catch (err) {
        pveLogger.error('Re-auth threw an exception', err);
        return null;
    }
}

/**
 * Retrieve Proxmox Backup Server credentials from cookies / config store.
 */
async function getPBSCredentials(): Promise<ProxmoxCredentials | null> {
    const cookieStore = await cookies();

    const ticket = cookieStore.get('pbs_ticket')?.value;
    const csrf = cookieStore.get('pbs_csrf')?.value;
    const url = cookieStore.get('pbs_url')?.value;

    if (ticket && url) {
        pbsLogger.debug(`Using ticket from session cookie (url=${url}, hasCsrf=${!!csrf})`);
        return { baseUrl: url, ticket, csrfToken: csrf };
    }

    pbsLogger.debug('No ticket cookie found, attempting re-auth via config store');
    const sourceId = cookieStore.get('pbs_source_id')?.value;
    if (!sourceId) {
        pbsLogger.warn('No pbs_source_id cookie — cannot re-authenticate');
        return null;
    }

    const source = configStore.getById(sourceId);
    if (!source || !source.password) {
        pbsLogger.error(`Source ${sourceId} not found in config store or missing password`);
        return null;
    }

    const baseUrl = `${source.protocol}://${source.host}:${source.port}`;
    pbsLogger.info(`Re-authenticating to PBS at ${baseUrl} as ${source.username}`);
    const body = `username=${source.username}&password=${encodeURIComponent(source.password)}`;

    try {
        const res = await proxmoxFetch(`${baseUrl}/api2/json/access/ticket`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body
        });
        if (!res.ok) {
            pbsLogger.error(`Re-auth failed: HTTP ${res.status}`);
            return null;
        }
        const data = await res.json();
        const newTicket = data?.data?.ticket;
        const newCsrf = data?.data?.CSRFPreventionToken;
        if (!newTicket) {
            pbsLogger.error('Re-auth response contained no ticket');
            return null;
        }
        pbsLogger.info(`Re-auth successful for ${source.username} at ${baseUrl}`);
        return { baseUrl, ticket: newTicket, csrfToken: newCsrf };
    } catch (err) {
        pbsLogger.error('Re-auth threw an exception', err);
        return null;
    }
}

function proxmoxHeaders(creds: ProxmoxCredentials, mutating = false): Record<string, string> {
    const headers: Record<string, string> = {
        Cookie: `PVEAuthCookie=${creds.ticket}`,
        Accept: 'application/json'
    };
    if (mutating && creds.csrfToken) {
        headers['CSRFPreventionToken'] = creds.csrfToken;
    }
    return headers;
}

function pbsHeaders(creds: ProxmoxCredentials, mutating = false): Record<string, string> {
    const headers: Record<string, string> = {
        Cookie: `PBSAuthCookie=${creds.ticket}`,
        Accept: 'application/json'
    };
    if (mutating && creds.csrfToken) {
        headers['CSRFPreventionToken'] = creds.csrfToken;
    }
    return headers;
}

// ===== Proxmox VE API =====

export const proxmoxClient = {
    async getNodes() {
        pveLogger.debug('getNodes()');
        const creds = await getProxmoxCredentials();
        if (!creds) throw new Error('Not authenticated to Proxmox VE');

        const res = await proxmoxFetch(`${creds.baseUrl}/api2/json/nodes`, {
            headers: proxmoxHeaders(creds)
        });
        if (!res.ok) {
            pveLogger.error(`getNodes() failed: HTTP ${res.status}`);
            throw new Error(`Proxmox API error: ${res.status}`);
        }
        pveLogger.debug('getNodes() succeeded');
        return res.json();
    },

    async getVMs(node: string) {
        pveLogger.debug(`getVMs(node=${node})`);
        const creds = await getProxmoxCredentials();
        if (!creds) throw new Error('Not authenticated to Proxmox VE');

        const res = await proxmoxFetch(`${creds.baseUrl}/api2/json/nodes/${node}/qemu`, {
            headers: proxmoxHeaders(creds)
        });
        if (!res.ok) {
            pveLogger.error(`getVMs(node=${node}) failed: HTTP ${res.status}`);
            throw new Error(`Proxmox API error: ${res.status}`);
        }
        pveLogger.debug(`getVMs(node=${node}) succeeded`);
        return res.json();
    },

    async getContainers(node: string) {
        pveLogger.debug(`getContainers(node=${node})`);
        const creds = await getProxmoxCredentials();
        if (!creds) throw new Error('Not authenticated to Proxmox VE');

        const res = await proxmoxFetch(`${creds.baseUrl}/api2/json/nodes/${node}/lxc`, {
            headers: proxmoxHeaders(creds)
        });
        if (!res.ok) {
            pveLogger.error(`getContainers(node=${node}) failed: HTTP ${res.status}`);
            throw new Error(`Proxmox API error: ${res.status}`);
        }
        pveLogger.debug(`getContainers(node=${node}) succeeded`);
        return res.json();
    },

    async getClusterResources(type?: 'vm' | 'storage' | 'node' | 'sdn') {
        pveLogger.debug(`getClusterResources(type=${type ?? 'all'})`);
        const creds = await getProxmoxCredentials();
        if (!creds) throw new Error('Not authenticated to Proxmox VE');

        const params = type ? `?type=${type}` : '';
        const res = await proxmoxFetch(`${creds.baseUrl}/api2/json/cluster/resources${params}`, {
            headers: proxmoxHeaders(creds)
        });
        if (!res.ok) {
            pveLogger.error(`getClusterResources(type=${type ?? 'all'}) failed: HTTP ${res.status}`);
            throw new Error(`Proxmox API error: ${res.status}`);
        }
        pveLogger.debug(`getClusterResources(type=${type ?? 'all'}) succeeded`);
        return res.json();
    },

    async getClusterStatus() {
        pveLogger.debug('getClusterStatus()');
        const creds = await getProxmoxCredentials();
        if (!creds) throw new Error('Not authenticated to Proxmox VE');

        const res = await proxmoxFetch(`${creds.baseUrl}/api2/json/cluster/status`, {
            headers: proxmoxHeaders(creds)
        });
        if (!res.ok) {
            pveLogger.error(`getClusterStatus() failed: HTTP ${res.status}`);
            throw new Error(`Proxmox API error: ${res.status}`);
        }
        pveLogger.debug('getClusterStatus() succeeded');
        return res.json();
    },

    async getNodeTasks(node: string, limit = 50) {
        pveLogger.debug(`getNodeTasks(node=${node}, limit=${limit})`);
        const creds = await getProxmoxCredentials();
        if (!creds) throw new Error('Not authenticated to Proxmox VE');

        const res = await proxmoxFetch(`${creds.baseUrl}/api2/json/nodes/${node}/tasks?limit=${limit}`, {
            headers: proxmoxHeaders(creds)
        });
        if (!res.ok) {
            pveLogger.error(`getNodeTasks(node=${node}) failed: HTTP ${res.status}`);
            throw new Error(`Proxmox API error: ${res.status}`);
        }
        pveLogger.debug(`getNodeTasks(node=${node}) succeeded`);
        return res.json();
    }
};

// ===== Proxmox Backup Server API =====

export const pbsClient = {
    async getDatastores() {
        pbsLogger.debug('getDatastores()');
        const creds = await getPBSCredentials();
        if (!creds) throw new Error('Not authenticated to Proxmox Backup Server');

        const res = await proxmoxFetch(`${creds.baseUrl}/api2/json/admin/datastore`, {
            headers: pbsHeaders(creds)
        });
        if (!res.ok) {
            pbsLogger.error(`getDatastores() failed: HTTP ${res.status}`);
            throw new Error(`PBS API error: ${res.status}`);
        }
        pbsLogger.debug('getDatastores() succeeded');
        return res.json();
    },

    async getDatastoreStatus(datastore: string) {
        pbsLogger.debug(`getDatastoreStatus(${datastore})`);
        const creds = await getPBSCredentials();
        if (!creds) throw new Error('Not authenticated to Proxmox Backup Server');

        const res = await proxmoxFetch(`${creds.baseUrl}/api2/json/admin/datastore/${datastore}/status`, {
            headers: pbsHeaders(creds)
        });
        if (!res.ok) {
            pbsLogger.error(`getDatastoreStatus(${datastore}) failed: HTTP ${res.status}`);
            throw new Error(`PBS API error: ${res.status}`);
        }
        pbsLogger.debug(`getDatastoreStatus(${datastore}) succeeded`);
        return res.json();
    },

    async getGroups(datastore: string) {
        pbsLogger.debug(`getGroups(${datastore})`);
        const creds = await getPBSCredentials();
        if (!creds) throw new Error('Not authenticated to Proxmox Backup Server');

        const res = await proxmoxFetch(`${creds.baseUrl}/api2/json/admin/datastore/${datastore}/groups`, {
            headers: pbsHeaders(creds)
        });
        if (!res.ok) {
            pbsLogger.error(`getGroups(${datastore}) failed: HTTP ${res.status}`);
            throw new Error(`PBS API error: ${res.status}`);
        }
        pbsLogger.debug(`getGroups(${datastore}) succeeded`);
        return res.json();
    },

    async getSnapshots(datastore: string, backupType: string, backupId: string) {
        pbsLogger.debug(`getSnapshots(datastore=${datastore}, type=${backupType}, id=${backupId})`);
        const creds = await getPBSCredentials();
        if (!creds) throw new Error('Not authenticated to Proxmox Backup Server');

        const params = new URLSearchParams({ 'backup-type': backupType, 'backup-id': backupId });
        const res = await proxmoxFetch(`${creds.baseUrl}/api2/json/admin/datastore/${datastore}/snapshots?${params}`, {
            headers: pbsHeaders(creds)
        });
        if (!res.ok) {
            pbsLogger.error(`getSnapshots(${datastore}) failed: HTTP ${res.status}`);
            throw new Error(`PBS API error: ${res.status}`);
        }
        pbsLogger.debug(`getSnapshots(${datastore}) succeeded`);
        return res.json();
    },

    async getNodeTasks(node = 'localhost', limit = 50) {
        pbsLogger.debug(`getNodeTasks(node=${node}, limit=${limit})`);
        const creds = await getPBSCredentials();
        if (!creds) throw new Error('Not authenticated to Proxmox Backup Server');

        const res = await proxmoxFetch(`${creds.baseUrl}/api2/json/nodes/${node}/tasks?limit=${limit}`, {
            headers: pbsHeaders(creds)
        });
        if (!res.ok) {
            pbsLogger.error(`getNodeTasks(node=${node}) failed: HTTP ${res.status}`);
            throw new Error(`PBS API error: ${res.status}`);
        }
        pbsLogger.debug(`getNodeTasks(node=${node}) succeeded`);
        return res.json();
    },

    async getNodeStatus(node = 'localhost') {
        pbsLogger.debug(`getNodeStatus(node=${node})`);
        const creds = await getPBSCredentials();
        if (!creds) throw new Error('Not authenticated to Proxmox Backup Server');

        const res = await proxmoxFetch(`${creds.baseUrl}/api2/json/nodes/${node}/status`, {
            headers: pbsHeaders(creds)
        });
        if (!res.ok) {
            pbsLogger.error(`getNodeStatus(node=${node}) failed: HTTP ${res.status}`);
            throw new Error(`PBS API error: ${res.status}`);
        }
        pbsLogger.debug(`getNodeStatus(node=${node}) succeeded`);
        return res.json();
    }
};
