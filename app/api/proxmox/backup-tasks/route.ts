import { NextResponse } from 'next/server';
import { proxmoxClient } from '@/lib/api/proxmox-client';
import { ProxmoxNode, ProxmoxTask } from '@/lib/types/proxmox';
import { createLogger } from '@/lib/logger';
const logger = createLogger('Proxmox/BackupTasks');

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // Get all online nodes, then fan out backup task queries in parallel
        const nodesRes = await proxmoxClient.getNodes();
        const nodes: ProxmoxNode[] = nodesRes?.data ?? [];
        const onlineNodes = nodes.filter((n: ProxmoxNode) => n.status === 'online');

        // Fetch up to 50 backup tasks per node (vzdump type). With multiple nodes this may
        // overshoot the final top-50 limit, but ensures we don't miss recent tasks from any node.
        const taskResults = await Promise.allSettled(
            onlineNodes.map((n: ProxmoxNode) => proxmoxClient.getNodeBackupTasks(n.node, 50))
        );

        const allTasks: ProxmoxTask[] = [];
        for (const result of taskResults) {
            if (result.status === 'fulfilled') {
                const tasks: ProxmoxTask[] = result.value?.data ?? [];
                allTasks.push(...tasks);
            }
        }

        // Sort by starttime descending (most recent first), take top 50
        allTasks.sort((a, b) => (b.starttime ?? 0) - (a.starttime ?? 0));
        const top50 = allTasks.slice(0, 50);

        return NextResponse.json({ data: top50 });
    } catch (error) {
        logger.error('BackupTasks error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch backup tasks' },
            { status: 500 }
        );
    }
}
