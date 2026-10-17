import { NextResponse } from 'next/server';
import { listWebhookDeliveries } from '@/lib/db';

export async function GET() {
  try {
    const logs = await listWebhookDeliveries(30);
    return NextResponse.json({ success: true, deliveries: logs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list webhook logs';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
