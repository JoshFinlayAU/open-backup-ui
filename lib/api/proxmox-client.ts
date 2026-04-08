// Proxmox VE and PBS API Client (server-side only)
// Proxmox uses ticket-based authentication, not OAuth2.

import { cookies } from 'next/headers';
import { configStore } from '@/lib/server/config-store';

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
        return { baseUrl: url, ticket, csrfToken: csrf };
    }

    // Fallback: re-authenticate via stored credentials
    const sourceId = cookieStore.get('proxmox_source_id')?.value;
    if (!sourceId) return null;

    const source = configStore.getById(sourceId);
    if (!source || !source.password) return null;

    const baseUrl = `${source.protocol}://${source.host}:${source.port}`;
    const formData = new URLSearchParams();
    formData.append('username', source.username);
    formData.append('password', source.password);

    try {
        const res = await fetch(`${baseUrl}/api2/json/access/ticket`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString()
        });
        if (!res.ok) return null;
        const data = await res.json();
        const newTicket = data?.data?.ticket;
        const newCsrf = data?.data?.CSRFPreventionToken;
        if (!newTicket) return null;
        return { baseUrl, ticket: newTicket, csrfToken: newCsrf };
    } catch {
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
        return { baseUrl: url, ticket, csrfToken: csrf };
    }

    const sourceId = cookieStore.get('pbs_source_id')?.value;
    if (!sourceId) return null;

    const source = configStore.getById(sourceId);
    if (!source || !source.password) return null;

    const baseUrl = `${source.protocol}://${source.host}:${source.port}`;
    const formData = new URLSearchParams();
    formData.append('username', source.username);
    formData.append('password', source.password);

    try {
        const res = await fetch(`${baseUrl}/api2/json/access/ticket`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString()
        });
        if (!res.ok) return null;
        const data = await res.json();
        const newTicket = data?.data?.ticket;
        const newCsrf = data?.data?.CSRFPreventionToken;
        if (!newTicket) return null;
        return { baseUrl, ticket: newTicket, csrfToken: newCsrf };
    } catch {
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
        const creds = await getProxmoxCredentials();
        if (!creds) throw new Error('Not authenticated to Proxmox VE');

        const res = await fetch(`${creds.baseUrl}/api2/json/nodes`, {
            headers: proxmoxHeaders(creds)
        });
        if (!res.ok) throw new Error(`Proxmox API error: ${res.status}`);
        return res.json();
    },

    async getVMs(node: string) {
        const creds = await getProxmoxCredentials();
        if (!creds) throw new Error('Not authenticated to Proxmox VE');

        const res = await fetch(`${creds.baseUrl}/api2/json/nodes/${node}/qemu`, {
            headers: proxmoxHeaders(creds)
        });
        if (!res.ok) throw new Error(`Proxmox API error: ${res.status}`);
        return res.json();
    },

    async getContainers(node: string) {
        const creds = await getProxmoxCredentials();
        if (!creds) throw new Error('Not authenticated to Proxmox VE');

        const res = await fetch(`${creds.baseUrl}/api2/json/nodes/${node}/lxc`, {
            headers: proxmoxHeaders(creds)
        });
        if (!res.ok) throw new Error(`Proxmox API error: ${res.status}`);
        return res.json();
    },

    async getClusterResources(type?: 'vm' | 'storage' | 'node' | 'sdn') {
        const creds = await getProxmoxCredentials();
        if (!creds) throw new Error('Not authenticated to Proxmox VE');

        const params = type ? `?type=${type}` : '';
        const res = await fetch(`${creds.baseUrl}/api2/json/cluster/resources${params}`, {
            headers: proxmoxHeaders(creds)
        });
        if (!res.ok) throw new Error(`Proxmox API error: ${res.status}`);
        return res.json();
    },

    async getClusterStatus() {
        const creds = await getProxmoxCredentials();
        if (!creds) throw new Error('Not authenticated to Proxmox VE');

        const res = await fetch(`${creds.baseUrl}/api2/json/cluster/status`, {
            headers: proxmoxHeaders(creds)
        });
        if (!res.ok) throw new Error(`Proxmox API error: ${res.status}`);
        return res.json();
    },

    async getNodeTasks(node: string, limit = 50) {
        const creds = await getProxmoxCredentials();
        if (!creds) throw new Error('Not authenticated to Proxmox VE');

        const res = await fetch(`${creds.baseUrl}/api2/json/nodes/${node}/tasks?limit=${limit}`, {
            headers: proxmoxHeaders(creds)
        });
        if (!res.ok) throw new Error(`Proxmox API error: ${res.status}`);
        return res.json();
    }
};

// ===== Proxmox Backup Server API =====

export const pbsClient = {
    async getDatastores() {
        const creds = await getPBSCredentials();
        if (!creds) throw new Error('Not authenticated to Proxmox Backup Server');

        const res = await fetch(`${creds.baseUrl}/api2/json/admin/datastore`, {
            headers: pbsHeaders(creds)
        });
        if (!res.ok) throw new Error(`PBS API error: ${res.status}`);
        return res.json();
    },

    async getDatastoreStatus(datastore: string) {
        const creds = await getPBSCredentials();
        if (!creds) throw new Error('Not authenticated to Proxmox Backup Server');

        const res = await fetch(`${creds.baseUrl}/api2/json/admin/datastore/${datastore}/status`, {
            headers: pbsHeaders(creds)
        });
        if (!res.ok) throw new Error(`PBS API error: ${res.status}`);
        return res.json();
    },

    async getGroups(datastore: string) {
        const creds = await getPBSCredentials();
        if (!creds) throw new Error('Not authenticated to Proxmox Backup Server');

        const res = await fetch(`${creds.baseUrl}/api2/json/admin/datastore/${datastore}/groups`, {
            headers: pbsHeaders(creds)
        });
        if (!res.ok) throw new Error(`PBS API error: ${res.status}`);
        return res.json();
    },

    async getSnapshots(datastore: string, backupType: string, backupId: string) {
        const creds = await getPBSCredentials();
        if (!creds) throw new Error('Not authenticated to Proxmox Backup Server');

        const params = new URLSearchParams({ 'backup-type': backupType, 'backup-id': backupId });
        const res = await fetch(`${creds.baseUrl}/api2/json/admin/datastore/${datastore}/snapshots?${params}`, {
            headers: pbsHeaders(creds)
        });
        if (!res.ok) throw new Error(`PBS API error: ${res.status}`);
        return res.json();
    },

    async getNodeTasks(node = 'localhost', limit = 50) {
        const creds = await getPBSCredentials();
        if (!creds) throw new Error('Not authenticated to Proxmox Backup Server');

        const res = await fetch(`${creds.baseUrl}/api2/json/nodes/${node}/tasks?limit=${limit}`, {
            headers: pbsHeaders(creds)
        });
        if (!res.ok) throw new Error(`PBS API error: ${res.status}`);
        return res.json();
    },

    async getNodeStatus(node = 'localhost') {
        const creds = await getPBSCredentials();
        if (!creds) throw new Error('Not authenticated to Proxmox Backup Server');

        const res = await fetch(`${creds.baseUrl}/api2/json/nodes/${node}/status`, {
            headers: pbsHeaders(creds)
        });
        if (!res.ok) throw new Error(`PBS API error: ${res.status}`);
        return res.json();
    }
};
