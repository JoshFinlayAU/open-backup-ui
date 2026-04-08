import { NextResponse } from 'next/server';
import { pbsClient } from '@/lib/api/proxmox-client';
import { PBSDatastore } from '@/lib/types/proxmox';
import { createLogger } from '@/lib/logger';
const logger = createLogger('PBS/Datastores');


export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const res = await pbsClient.getDatastores();
        const datastores: PBSDatastore[] = res?.data ?? [];

        // Enrich each datastore with status (space) and groups count in parallel
        const [statusResults, groupsResults] = await Promise.all([
            Promise.allSettled(datastores.map((ds: PBSDatastore) => pbsClient.getDatastoreStatus(ds.store))),
            Promise.allSettled(datastores.map((ds: PBSDatastore) => pbsClient.getGroups(ds.store)))
        ]);

        const enriched = datastores.map((ds, i) => {
            let enrichedDs: PBSDatastore & { groupCount?: number } = { ...ds };

            const statusR = statusResults[i];
            if (statusR.status === 'fulfilled' && statusR.value?.data) {
                const s = statusR.value.data;
                enrichedDs = { ...enrichedDs, total: s.total, used: s.used, avail: s.avail, 'gc-status': s['gc-status'] };
            }

            const groupsR = groupsResults[i];
            if (groupsR.status === 'fulfilled') {
                const groups = groupsR.value?.data ?? [];
                enrichedDs = { ...enrichedDs, groupCount: Array.isArray(groups) ? groups.length : 0 };
            }

            return enrichedDs;
        });

        return NextResponse.json({ data: enriched });
    } catch (error) {
        logger.error('Datastores error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch datastores' },
            { status: 500 }
        );
    }
}
