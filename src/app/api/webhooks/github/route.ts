import { NextRequest, NextResponse } from 'next/server';
import { processPushWebhook } from '@/lib/webhook';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const result = await processPushWebhook(rawBody, req.headers);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: result.message.includes('signature') ? 401 : 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      deliveryId: result.deliveryId,
      newRevisionNumber: result.newRevisionNumber,
      promotedSkills: result.promotedSkills
    });
  } catch (error: any) {
    console.error('Webhook execution failure:', error);
    return NextResponse.json(
      { error: error.message || 'Webhook internal processing error.' },
      { status: 500 }
    );
  }
}

// Support GET for testing connectivity
export async function GET() {
  return NextResponse.json({
    status: 'active',
    endpoint: '/api/webhooks/github',
    description: 'ProofLoop GitHub Webhook Receiver for repository push events and automatic reassessments.',
    signatureMethod: 'HMAC-SHA256 (X-Hub-Signature-256)',
    supportedEvents: ['push']
  });
}
