import { NextResponse } from 'next/server';
import { listWebhookDeliveries } from '@/lib/db';

export async function GET() {
  try {
    const logs = listWebhookDeliveries(30);
    return NextResponse.json({ success: true, deliveries: logs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to list webhook logs' }, { status: 500 });
  }
}
