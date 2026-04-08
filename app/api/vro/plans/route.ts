// API Route for Veeam Recovery Orchestrator Plans
// This route proxies requests to the VRO API to avoid CORS issues

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
const logger = createLogger('VRO/Plans');


export const dynamic = 'force-dynamic';

const VRO_API_URL = process.env.VRO_API_URL;

export async function GET(request: NextRequest) {
  try {
    if (!VRO_API_URL) {
      return NextResponse.json(
        { error: 'Server configuration error: Missing VRO_API_URL' },
        { status: 500 }
      );
    }

    // Get authorization header from the request
    const authHeader = request.headers.get('authorization');
    logger.debug('Request received, auth header:', authHeader ? 'Present (Bearer ...)' : 'Missing');
    
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authorization header required' },
        { status: 401 }
      );
    }

    // Extract query parameters
    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();
    const endpoint = queryString ? `/api/v7.21/Plans?${queryString}` : '/api/v7.21/Plans';
    const fullUrl = `${VRO_API_URL}${endpoint}`;

    logger.debug('Fetching from VRO:', fullUrl);

    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    logger.debug('VRO response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      logger.debug('VRO error:', errorText);
      return NextResponse.json(
        { error: `Failed to fetch recovery plans: ${response.status} - ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    logger.info('Success - plans fetched:', data.data?.length || 0, 'plans');
    return NextResponse.json(data);

  } catch (error) {
    logger.error('Error fetching recovery plans:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch recovery plans' },
      { status: 500 }
    );
  }
}
