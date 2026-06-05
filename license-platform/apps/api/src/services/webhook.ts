import crypto from 'crypto';
import prisma from '../lib/prisma.js';

// ── Types ─────────────────────────────────────────────────────────────────

export type WebhookEvent =
  | 'license.issued'
  | 'license.revoked'
  | 'license.restored'
  | 'license.expired'
  | 'license.expiring_soon'
  | 'license.verified'
  | 'license.verify_failed'
  | 'license.domain_changed';

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, unknown>;
}

// ── Signature ─────────────────────────────────────────────────────────────

/**
 * Sign payload with HMAC-SHA256 using the webhook's secret.
 * Header sent: X-License-Signature: sha256=<hex>
 * Products verify this to confirm the request is authentic.
 */
export function signPayload(body: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

export function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = signPayload(body, secret);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// ── Delivery ──────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_DELAYS = [0, 60_000, 300_000]; // 0s, 1min, 5min

export async function deliverWebhook(params: {
  url: string;
  secret: string;
  payload: WebhookPayload;
  webhookId: string;
}): Promise<{ success: boolean; status?: number; error?: string }> {
  const { url, secret, payload, webhookId } = params;
  const body = JSON.stringify(payload);
  const signature = signPayload(body, secret);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-License-Event': payload.event,
          'X-License-Signature': signature,
          'X-License-Delivery': webhookId,
          'X-License-Timestamp': payload.timestamp,
          'User-Agent': 'LicensePlatform-Webhook/1.0',
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const success = res.status >= 200 && res.status < 300;

      // Log delivery attempt
      await prisma.webhookDelivery.create({
        data: {
          webhookId,
          event: payload.event,
          url,
          statusCode: res.status,
          attempt: attempt + 1,
          success,
          payload: body,
          responseBody: await res.text().catch(() => ''),
        },
      }).catch(() => {}); // non-blocking

      if (success) {
        console.log(`[webhook] OK  ${payload.event} -> ${url} (${res.status})`);
        return { success: true, status: res.status };
      }

      console.warn(`[webhook] WARN ${payload.event} -> ${url} (${res.status}) attempt ${attempt + 1}/${MAX_RETRIES}`);

    } catch (err: any) {
      const msg = err.name === 'AbortError' ? 'TIMEOUT' : err.message;
      console.error(`[webhook] ERR  ${payload.event} -> ${url} error: ${msg} attempt ${attempt + 1}/${MAX_RETRIES}`);

      await prisma.webhookDelivery.create({
        data: {
          webhookId,
          event: payload.event,
          url,
          statusCode: 0,
          attempt: attempt + 1,
          success: false,
          payload: body,
          responseBody: msg,
        },
      }).catch(() => {});
    }
  }

  return { success: false, error: `Failed after ${MAX_RETRIES} attempts` };
}

// ── Fire event to all registered webhooks ────────────────────────────────

export async function fireWebhookEvent(
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  // Find all active webhooks subscribed to this event
  const webhooks = await prisma.webhook.findMany({
    where: {
      active: true,
      OR: [
        { events: { has: event } },
        { events: { has: '*' } }, // wildcard subscription
      ],
    },
  });

  if (webhooks.length === 0) return;

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  // Fire all webhooks concurrently — don't block the main request
  Promise.all(
    webhooks.map((wh: { id: string; url: string; secret: string }) =>
      deliverWebhook({
        url: wh.url,
        secret: wh.secret,
        payload,
        webhookId: `${wh.id}-${Date.now()}`,
      })
    )
  ).catch((err: unknown) => console.error('[webhook] fireWebhookEvent error:', err));
}

// ── Convenience helpers (call these from routes) ──────────────────────────

export const webhookEvents = {
  licenseIssued: (license: any) =>
    fireWebhookEvent('license.issued', {
      key: license.key,
      product: license.product?.slug,
      customer_email: license.customerEmail,
      customer_name: license.customerName,
      domains: license.domains,
      expires_at: license.expiresAt,
    }),

  licenseRevoked: (license: any, reason?: string) =>
    fireWebhookEvent('license.revoked', {
      key: license.key,
      product: license.product?.slug,
      customer_email: license.customerEmail,
      reason: reason ?? license.revokedReason,
      revoked_at: new Date().toISOString(),
    }),

  licenseRestored: (license: any) =>
    fireWebhookEvent('license.restored', {
      key: license.key,
      product: license.product?.slug,
      customer_email: license.customerEmail,
    }),

  licenseExpiringSoon: (license: any, daysRemaining: number) =>
    fireWebhookEvent('license.expiring_soon', {
      key: license.key,
      product: license.product?.slug,
      customer_email: license.customerEmail,
      expires_at: license.expiresAt,
      days_remaining: daysRemaining,
    }),

  licenseVerified: (key: string, domain: string, product: string) =>
    fireWebhookEvent('license.verified', { key, domain, product }),

  licenseVerifyFailed: (key: string, domain: string, reason: string) =>
    fireWebhookEvent('license.verify_failed', { key, domain, reason }),

  domainChanged: (key: string, newDomain: string) =>
    fireWebhookEvent('license.domain_changed', { key, new_domain: newDomain }),
};
