import { NextResponse } from 'next/server';
import { pbsClient } from '@/lib/api/proxmox-client';
import { PBSDatastore, PBSTask, PBSSummary } from '@/lib/types/proxmox';
import { createLogger } from '@/lib/logger';
const logger = createLogger('PBS/Summary');


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

        function isSuccessTask(t: PBSTask) { return t.status === 'OK'; }
        function isFailedTask(t: PBSTask) {
            return !!t.status && t.status !== 'OK' && !t.status.startsWith('WARNINGS');
        }

        const successfulTasks = tasks.filter(isSuccessTask).length;
        const failedTasks = tasks.filter(isFailedTask).length;

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
        logger.error('Summary error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch PBS summary' },
            { status: 500 }
        );
    }
}
