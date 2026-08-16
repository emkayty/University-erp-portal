import {
  BadRequestException, Body, Controller, Get, Headers, HttpCode, HttpStatus,
  Param, ParseUUIDPipe, Post, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import type { JwtPayload } from '@uniportal/types';

import { CurrentUser, Public, Roles, SkipRequestRlsTransaction } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { resolveSelfOrTargetStudentId } from '../../common/resolve-self-or-target';
import { InitiatePaymentDto, TsaManualPaymentDto } from './dto/fees.dto';
import { PaymentsService } from './payments.service';

/** Express request with rawBody captured by main.ts body-parser verify hook. */
interface RawBodyRequest extends Request { rawBody?: Buffer }

@ApiTags('Payments')
@Controller({ path: 'payments', version: '1' })
@UseGuards(RolesGuard)
export class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  // ── Initiate ─────────────────────────────────────────────────────────────
  @Post('initiate')
  @SkipRequestRlsTransaction()
  @Roles('STUDENT')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[STUDENT] Initiate a payment for an outstanding fee. Supply X-Idempotency-Key header to make safe for retries.' })
  async initiate(
    @Body() dto: InitiatePaymentDto,
    @CurrentUser() u: JwtPayload,
    @Headers('x-idempotency-key') idempKey?: string,
  ) {
    if (!idempKey || idempKey.trim().length < 16) {
      throw new BadRequestException('X-Idempotency-Key is required and must be at least 16 characters');
    }
    // `sub` is User.id, while PaymentsService ownership checks require Student.id.
    // Resolve through the shared ownership helper to fail clearly for an account
    // that has not completed matriculation instead of falsely rejecting its fee.
    const studentId = resolveSelfOrTargetStudentId(u, u.studentId ?? u.sub);
    return { success: true, data: await this.svc.initiatePayment(dto, studentId, idempKey.trim()) };
  }

  @Get('history/:studentId')
  @Roles('STUDENT','BURSAR','REGISTRAR','SUPER_ADMIN')
  @ApiBearerAuth('access-token')
  async history(@Param('studentId', ParseUUIDPipe) studentId: string, @CurrentUser() u: JwtPayload) {
    const targetId = resolveSelfOrTargetStudentId(u, studentId);
    return { success: true, data: await this.svc.getPaymentHistory(targetId) };
  }

  // ── TSA Manual (M18 partial) ─────────────────────────────────────────────
  @Post('tsa-manual')
  @Roles('BURSAR','SUPER_ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[BURSAR] Record a manually-confirmed TSA/GIFMIS payment' })
  async tsaManual(@Body() dto: TsaManualPaymentDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.recordTsaPayment(dto, u.sub) };
  }

  // ── Webhooks — @Public, HMAC-verified (NOT JWT) ──────────────────────────
  // main.ts configures bodyParser:false + manual json({verify}) so
  // req.rawBody contains the exact bytes needed for HMAC computation.
  @Post('webhooks/paystack')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint() // Not part of the public API surface — provider-only
  async paystackWebhook(@Req() req: RawBodyRequest, @Headers('x-paystack-signature') sig?: string) {
    if (!req.rawBody) throw new BadRequestException('Webhook raw body was not captured');
    return this.svc.handlePaystackWebhook(req.rawBody, sig);
  }

  @Post('webhooks/remita')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async remitaWebhook(@Req() req: RawBodyRequest, @Headers('x-remita-signature') sig?: string) {
    if (!req.rawBody) throw new BadRequestException('Webhook raw body was not captured');
    return this.svc.handleRemitaWebhook(req.rawBody, sig);
  }
}
