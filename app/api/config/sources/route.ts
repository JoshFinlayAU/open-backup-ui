import { NextResponse } from 'next/server';
import { configStore, VBRSource } from '@/lib/server/config-store';
import { createLogger } from '@/lib/logger';
const logger = createLogger('Config/Sources');


export const dynamic = 'force-dynamic';

export async function GET() {
    const stored = configStore.getAll();
    const sources: VBRSource[] = [...stored];

    // Check VBR Env Var
    const vbrUrl = process.env.VEEAM_API_URL || process.env.VBR_API_URL;
    if (vbrUrl && !sources.some(s => s.platform === 'vbr')) {
        try {
            const url = new URL(vbrUrl);
            sources.push({
                id: 'env-vbr',
                platform: 'vbr',
                host: url.hostname,
                port: parseInt(url.port) || 9419,
                protocol: url.protocol.replace(':', ''),
                username: process.env.VEEAM_USERNAME || 'Administrator',
            } as VBRSource);
        } catch (e) {
            logger.error('Invalid VBR Env URL:', e);
        }
    }

    // Check VB365 (VBM) Env Var
    const vbmUrl = process.env.VBM_API_URL;
    if (vbmUrl && !sources.some(s => s.platform === 'vb365')) {
        try {
            const url = new URL(vbmUrl);
            sources.push({
                id: 'env-vb365',
                platform: 'vb365',
                host: url.hostname,
                port: parseInt(url.port) || 4443,
                protocol: url.protocol.replace(':', ''),
                username: 'Environment Variable',
            } as VBRSource);
        } catch (e) {
            logger.error('Invalid VBM Env URL:', e);
        }
    }

    // Check Veeam ONE Env Var
    const oneUrl = process.env.VEEAM_ONE_API_URL;
    if (oneUrl && !sources.some(s => s.platform === 'one')) {
        try {
            const url = new URL(oneUrl);
            sources.push({
                id: 'env-one',
                platform: 'one',
                host: url.hostname,
                port: parseInt(url.port) || 1239,
                protocol: url.protocol.replace(':', ''),
                username: process.env.VEEAM_ONE_USERNAME || 'Administrator',
                hasCredentials: !!process.env.VEEAM_ONE_PASSWORD
            } as VBRSource);
        } catch (e) {
            logger.error('Invalid Veeam ONE Env URL:', e);
        }
    }

    // Check Proxmox VE Env Var
    const proxmoxUrl = process.env.PROXMOX_API_URL;
    if (proxmoxUrl && !sources.some(s => s.platform === 'proxmox')) {
        try {
            const url = new URL(proxmoxUrl);
            sources.push({
                id: 'env-proxmox',
                platform: 'proxmox',
                host: url.hostname,
                port: parseInt(url.port) || 8006,
                protocol: url.protocol.replace(':', ''),
                username: process.env.PROXMOX_USERNAME || 'root@pam',
                hasCredentials: !!process.env.PROXMOX_PASSWORD
            } as VBRSource);
        } catch (e) {
            logger.error('Invalid Proxmox Env URL:', e);
        }
    }

    // Check Proxmox Backup Server Env Var
    const pbsUrl = process.env.PBS_API_URL;
    if (pbsUrl && !sources.some(s => s.platform === 'pbs')) {
        try {
            const url = new URL(pbsUrl);
            sources.push({
                id: 'env-pbs',
                platform: 'pbs',
                host: url.hostname,
                port: parseInt(url.port) || 8007,
                protocol: url.protocol.replace(':', ''),
                username: process.env.PBS_USERNAME || 'root@pam',
                hasCredentials: !!process.env.PBS_PASSWORD
            } as VBRSource);
        } catch (e) {
            logger.error('Invalid PBS Env URL:', e);
        }
    }

    // Map to client format
    // Map to client format
    const clientSources = sources.map(s => {
        const url = `${s.protocol}://${s.host}:${s.port}`;
        let name = url;

        // Use custom logic for friendlier names if just one
        if (s.id.startsWith('env-')) {
            name = s.platform === 'vbr' ? 'Veeam Backup & Replication (Env)' :
                s.platform === 'vb365' ? 'Veeam Backup for Microsoft 365 (Env)' :
                s.platform === 'one' ? 'Veeam ONE (Env)' :
                s.platform === 'proxmox' ? 'Proxmox VE (Env)' :
                s.platform === 'pbs' ? 'Proxmox Backup Server (Env)' : name;
        }

        return {
            id: s.id,
            type: s.platform,
            name: name,
            url: url,
            isAuthenticated: false, // Client will verify auth status via session API
            hasCredentials: s.hasCredentials || (s.id.startsWith('env-') && (!!process.env[`VEEAM_PASSWORD`] || !!process.env[`VBR_PASSWORD`] || !!process.env[`VBM_PASSWORD`]))
        };
    });

    return NextResponse.json(clientSources);
}
