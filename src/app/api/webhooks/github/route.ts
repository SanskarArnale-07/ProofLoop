import { NextRequest, NextResponse } from 'next/server';
import { processPushWebhook, WebhookOutcome } from '@/lib/webhook';

const STATUS_CODES: Record<WebhookOutcome, number> = {
  processed: 200,
  ignored: 200,
  duplicate: 200,
  invalid_signature: 401,
  bad_payload: 400,
  error: 500
};

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const result = await processPushWebhook(rawBody, req.headers);
    const httpStatus = STATUS_CODES[result.status] ?? 500;

    if (!result.success) {
      return NextResponse.json(
        { error: result.message, status: result.status, deliveryId: result.deliveryId },
        { status: httpStatus }
      );
    }

    return NextResponse.json({
      success: true,
      status: result.status,
      message: result.message,
      deliveryId: result.deliveryId,
      newRevisionNumber: result.newRevisionNumber,
      promotedSkills: result.promotedSkills
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Webhook internal processing error.';
    console.error('Webhook execution failure:', message);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'active',
    endpoint: '/api/webhooks/github',
    description: 'ProofLoop GitHub Webhook Receiver for repository push events and automatic reassessments.',
    signatureMethod: 'HMAC-SHA256 (X-Hub-Signature-256)',
    supportedEvents: ['push', 'ping'],
    handledBranch: 'default branch of the assessed repository'
  });
}
