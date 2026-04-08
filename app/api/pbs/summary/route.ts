import { NextResponse } from 'next/server';
import { pbsClient } from '@/lib/api/proxmox-client';
import { PBSDatastore, PBSTask, PBSSummary } from '@/lib/types/proxmox';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const [datastoresRes, tasksRes] = await Promise.all([
            pbsClient.getDatastores(),
            pbsClient.getNodeTasks('localhost', 100)
        ]);

        const datastores: PBSDatastore[] = datastoresRes?.data ?? [];
        const tasks: PBSTask[] = tasksRes?.data ?? [];

        const recentTasks = tasks.slice(0, 20);
        const successfulTasks = tasks.filter((t: PBSTask) => t.exitstatus === 'OK').length;
        const failedTasks = tasks.filter((t: PBSTask) => t.exitstatus && t.exitstatus !== 'OK').length;

        const totalSpace = datastores.reduce((sum: number, d: PBSDatastore) => sum + (d.total ?? 0), 0);
        const usedSpace = datastores.reduce((sum: number, d: PBSDatastore) => sum + (d.used ?? 0), 0);
        const availSpace = datastores.reduce((sum: number, d: PBSDatastore) => sum + (d.avail ?? 0), 0);

        const summary: PBSSummary = {
            datastoreCount: datastores.length,
            totalSpace,
            usedSpace,
            availSpace,
            recentTasks,
            successfulTasks,
            failedTasks
        };

        return NextResponse.json(summary);
    } catch (error) {
        console.error('[PBS] Summary error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch PBS summary' },
            { status: 500 }
        );
    }
}
