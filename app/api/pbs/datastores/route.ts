import { NextResponse } from 'next/server';
import { pbsClient } from '@/lib/api/proxmox-client';
import { createLogger } from '@/lib/logger';
const logger = createLogger('PBS/Datastores');


export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const data = await pbsClient.getDatastores();
        return NextResponse.json(data);
    } catch (error) {
        logger.error('Datastores error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch datastores' },
            { status: 500 }
        );
    }
}
