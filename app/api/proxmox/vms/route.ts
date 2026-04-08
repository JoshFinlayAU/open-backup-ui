import { NextResponse } from 'next/server';
import { proxmoxClient } from '@/lib/api/proxmox-client';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // Get all VMs and containers across all nodes via cluster resources
        const data = await proxmoxClient.getClusterResources('vm');
        return NextResponse.json(data);
    } catch (error) {
        console.error('[Proxmox] VMs error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch VMs' },
            { status: 500 }
        );
    }
}
