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

        // Fetch per-datastore status (disk usage) in parallel; ignore failures
        const statusResults = await Promise.allSettled(
            datastores.map((ds: PBSDatastore) => pbsClient.getDatastoreStatus(ds.store))
        );
        const enrichedDatastores: PBSDatastore[] = datastores.map((ds, i) => {
            const r = statusResults[i];
            if (r.status === 'fulfilled' && r.value?.data) {
                const s = r.value.data;
                return { ...ds, total: s.total, used: s.used, avail: s.avail };
            }
            return ds;
        });

        const recentTasks = tasks.slice(0, 20);

        function isSuccessTask(t: PBSTask) { return t.status === 'OK'; }
        function isFailedTask(t: PBSTask) {
            return !!t.status && t.status !== 'OK' && !t.status.startsWith('WARNINGS');
        }

        const successfulTasks = tasks.filter(isSuccessTask).length;
        const failedTasks = tasks.filter(isFailedTask).length;

        const totalSpace = enrichedDatastores.reduce((sum: number, d: PBSDatastore) => sum + (d.total ?? 0), 0);
        const usedSpace = enrichedDatastores.reduce((sum: number, d: PBSDatastore) => sum + (d.used ?? 0), 0);
        const availSpace = enrichedDatastores.reduce((sum: number, d: PBSDatastore) => sum + (d.avail ?? 0), 0);

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
