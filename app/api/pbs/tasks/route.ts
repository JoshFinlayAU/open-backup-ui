import { NextResponse } from 'next/server';
import { pbsClient } from '@/lib/api/proxmox-client';
import { createLogger } from '@/lib/logger';
const logger = createLogger('PBS/Tasks');


export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const data = await pbsClient.getNodeTasks('localhost', 100);
        return NextResponse.json(data);
    } catch (error) {
        logger.error('Tasks error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch tasks' },
            { status: 500 }
        );
    }
}
