import { NextResponse } from 'next/server';
import { proxmoxClient } from '@/lib/api/proxmox-client';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const data = await proxmoxClient.getNodes();
        return NextResponse.json(data);
    } catch (error) {
        console.error('[Proxmox] Nodes error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch nodes' },
            { status: 500 }
        );
    }
}
