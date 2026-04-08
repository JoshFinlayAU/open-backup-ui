import { NextResponse } from 'next/server';
import { proxmoxClient } from '@/lib/api/proxmox-client';
import { createLogger } from '@/lib/logger';
const logger = createLogger('Proxmox/BackupJobs');

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const data = await proxmoxClient.getBackupJobs();
        return NextResponse.json(data);
    } catch (error) {
        logger.error('BackupJobs error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch backup jobs' },
            { status: 500 }
        );
    }
}
