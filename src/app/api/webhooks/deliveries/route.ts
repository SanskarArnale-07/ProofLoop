import { NextRequest, NextResponse } from 'next/server';
import { listWebhookDeliveries } from '@/lib/db';
import { validatePositiveInteger } from '@/lib/validation';
import { createErrorResponse } from '@/lib/errors';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limitStr = searchParams.get('limit');
    let limit = 30;

    if (limitStr) {
      const limitVal = validatePositiveInteger(limitStr, 'limit', 1, 100);
      if (!limitVal.valid || limitVal.value === undefined) {
        return NextResponse.json({ error: limitVal.error || 'Invalid limit parameter.' }, { status: 400 });
      }
      limit = limitVal.value;
    }

    const logs = listWebhookDeliveries(limit);
    return NextResponse.json({ success: true, deliveries: logs });
  } catch (error: unknown) {
    return createErrorResponse(error, 'Failed to list webhook logs');
  }
}
