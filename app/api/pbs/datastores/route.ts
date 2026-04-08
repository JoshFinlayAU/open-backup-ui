import { NextResponse } from 'next/server';
import { pbsClient } from '@/lib/api/proxmox-client';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const data = await pbsClient.getDatastores();
        return NextResponse.json(data);
    } catch (error) {
        console.error('[PBS] Datastores error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch datastores' },
            { status: 500 }
        );
    }
}
