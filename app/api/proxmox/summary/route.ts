import { NextResponse } from 'next/server';
import { proxmoxClient } from '@/lib/api/proxmox-client';
import { ProxmoxNode, ProxmoxVM, ProxmoxSummary } from '@/lib/types/proxmox';
import { createLogger } from '@/lib/logger';
const logger = createLogger('Proxmox/Summary');


export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const [nodesRes, vmsRes] = await Promise.all([
            proxmoxClient.getNodes(),
            proxmoxClient.getClusterResources('vm')
        ]);

        const nodes: ProxmoxNode[] = nodesRes?.data ?? [];
        const vms: ProxmoxVM[] = vmsRes?.data ?? [];

        const qemuVMs = vms.filter((v: ProxmoxVM) => v.type === 'qemu');
        const lxcContainers = vms.filter((v: ProxmoxVM) => v.type === 'lxc');

        const onlineNodes = nodes.filter((n: ProxmoxNode) => n.status === 'online');
        const totalCPUs = onlineNodes.reduce((sum: number, n: ProxmoxNode) => sum + (n.maxcpu ?? 0), 0);
        const totalMem = onlineNodes.reduce((sum: number, n: ProxmoxNode) => sum + (n.maxmem ?? 0), 0);
        const usedMem = onlineNodes.reduce((sum: number, n: ProxmoxNode) => sum + (n.mem ?? 0), 0);
        const totalCpuUsage = onlineNodes.reduce((sum: number, n: ProxmoxNode) => sum + ((n.cpu ?? 0) * (n.maxcpu ?? 1)), 0);

        const summary: ProxmoxSummary = {
            nodeCount: nodes.length,
            onlineNodes: onlineNodes.length,
            vmCount: qemuVMs.length,
            runningVMs: qemuVMs.filter((v: ProxmoxVM) => v.status === 'running').length,
            containerCount: lxcContainers.length,
            runningContainers: lxcContainers.filter((v: ProxmoxVM) => v.status === 'running').length,
            totalCPUs,
            cpuUsage: totalCPUs > 0 ? totalCpuUsage / totalCPUs : 0,
            totalMemory: totalMem,
            usedMemory: usedMem
        };

        return NextResponse.json(summary);
    } catch (error) {
        logger.error('Summary error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch summary' },
            { status: 500 }
        );
    }
}
