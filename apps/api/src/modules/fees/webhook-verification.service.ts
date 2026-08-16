import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * WebhookVerificationService (C6 fix).
 *
 * ── PAYSTACK — precise, per official docs ──────────────────────────────────
 * Signature: HMAC-SHA512 of the RAW request body bytes, using the Paystack
 * secret key, compared against the `x-paystack-signature` header.
 *   hash = HMAC_SHA512(rawBody, PAYSTACK_SECRET_KEY)
 * Requires the RAW body bytes (not re-serialized JSON — JSON.stringify can
 * reorder keys/whitespace and break the comparison). main.ts captures
 * `req.rawBody` via a custom body-parser verify hook for this reason.
 *
 * ── REMITA — documented pattern + explicit uncertainty flag ────────────────
 * Remita's REST API hash formula for RRR-based services (per public Remita
 * Pay Inbound API docs) is:
 *     apiHash = SHA512(merchantId + serviceTypeId + orderId + amount + apiKey)   [RRR generation]
 *     apiHash = SHA512(rrr + apiKey + merchantId)                                [status check]
 *
 * HOWEVER: Remita's webhook ("Payment Notification") push payload and its
 * signature header are NOT uniformly documented across Remita products
 * (Remita Pay vs Remita Aggregator vs e-Collect have different webhook
 * formats), and exact field concatenation ORDER for the webhook signature
 * specifically should be CONFIRMED against the institution's signed Remita
 * merchant integration guide before go-live.
 *
 * Because of this, Remita webhooks here are treated as a PING, not a trusted
 * source of truth: verifyRemita() checks the documented status-check hash
 * IF a signature is present, but PaymentsService.handleRemitaWebhook() always
 * follows up with a server-to-server status query to Remita using the
 * documented status-check hash before crediting any payment. This
 * verify-then-confirm pattern is the safer integration regardless of which
 * exact webhook signature variant the institution's Remita contract uses.
 *
 * TODO (pre-go-live, tracked in docs/CHANGELOG.md S-series): confirm exact
 * Remita webhook field order with the institution's merchant documentation
 * and tighten verifyRemita() accordingly. Until then, the verify-callback
 * step is the binding security control, not the inbound webhook signature.
 */
@Injectable()
export class WebhookVerificationService {
  private readonly logger = new Logger(WebhookVerificationService.name);

  private readonly paystackSecret: string;
  private readonly remitaApiKey:    string;
  private readonly remitaMerchantId: string;

  constructor(config: ConfigService) {
    this.paystackSecret  = config.get<string>('PAYSTACK_SECRET_KEY', '');
    this.remitaApiKey    = config.get<string>('REMITA_API_KEY', '');
    this.remitaMerchantId = config.get<string>('REMITA_MERCHANT_ID', '');
  }

  /**
   * Verifies a Paystack webhook signature against the RAW request body.
   * @param rawBody Buffer — exact bytes received over the wire
   * @param signature value of the `x-paystack-signature` header
   */
  verifyPaystack(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature || !this.paystackSecret) return false;

    const expected = createHmac('sha512', this.paystackSecret)
      .update(rawBody)
      .digest('hex');

    return this.safeCompare(expected, signature);
  }

  /**
   * Computes the documented Remita status-check hash:
   *   SHA512(rrr + apiKey + merchantId)
   * Used by PaymentsService to query Remita's status API server-to-server —
   * this is the BINDING verification step (see class doc above).
   */
  computeRemitaStatusHash(rrr: string): string {
    return createHash('sha512')
      .update(`${rrr}${this.remitaApiKey}${this.remitaMerchantId}`)
      .digest('hex');
  }

  /**
   * Computes the documented Remita RRR-generation hash:
   *   SHA512(merchantId + serviceTypeId + orderId + amount + apiKey)
   * Used by PaymentsService.initiatePayment() when requesting an RRR.
   */
  computeRemitaRrrHash(serviceTypeId: string, orderId: string, amount: string): string {
    return createHash('sha512')
      .update(`${this.remitaMerchantId}${serviceTypeId}${orderId}${amount}${this.remitaApiKey}`)
      .digest('hex');
  }

  /**
   * Best-effort check of an inbound Remita webhook signature, IF the
   * `x-remita-signature` (or contract-specific) header is present. This is
   * advisory only — see class doc. Returns true if no signature scheme is
   * configured (falls through to verify-callback as the real gate).
   */
  verifyRemitaWebhookAdvisory(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature) {
      this.logger.debug('Remita webhook received without signature header — relying on verify-callback');
      return true; // Not a hard failure — verify-callback is binding
    }
    if (!this.remitaApiKey) return true;

    const expected = createHash('sha512')
      .update(rawBody.toString('utf8') + this.remitaApiKey)
      .digest('hex');

    const ok = this.safeCompare(expected, signature);
    if (!ok) this.logger.warn('Remita webhook signature mismatch (advisory check) — proceeding to verify-callback regardless');
    return true; // Never block on this alone — verify-callback decides
  }

  private safeCompare(expected: string, actual: string): boolean {
    const expBuf = Buffer.from(expected, 'utf8');
    const actBuf = Buffer.from(actual,   'utf8');
    if (expBuf.length !== actBuf.length) return false;
    return timingSafeEqual(expBuf, actBuf);
  }
}
