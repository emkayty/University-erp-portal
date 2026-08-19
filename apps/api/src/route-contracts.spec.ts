import { BadRequestException } from '@nestjs/common';
import { PATH_METADATA, VERSION_METADATA } from '@nestjs/common/constants';
import { PaymentProvider } from '@prisma/client';

import { AlumniController } from './modules/alumni/alumni.controller';
import { AuditViewerController } from './modules/audit-viewer/audit-viewer.controller';
import { ClinicController } from './modules/clinic/clinic.controller';
import { PaymentsController } from './modules/fees/payments.controller';
import { ResearchController } from './modules/research/research.controller';
import { ReportsController } from './modules/reports/reports.controller';
import { SearchController } from './modules/search/search.controller';
import { TransportController } from './modules/transport/transport.controller';
import { AuthController } from './modules/auth/auth.controller';
import { NotificationsController } from './modules/notifications/notifications.controller';
import { PrivacyController } from './modules/privacy/privacy.controller';
import { SecurityController } from './modules/security/security.controller';
import { SettingsController } from './modules/settings/settings.controller';
import { IS_PUBLIC_KEY, SKIP_REQUEST_RLS_TRANSACTION_KEY } from './common/decorators';

/**
 * API route-contract regression suite.
 *
 * The web client composes calls as /api/v1/<path>. These assertions protect
 * against regressions where a controller embeds `api/v1` while the bootstrap
 * also applies the global API prefix and URI version.
 */
describe('API route contracts', () => {
  const versionedControllers: Array<[string, object, string]> = [
    ['alumni', AlumniController, 'alumni'],
    ['clinic', ClinicController, 'clinic'],
    ['reports', ReportsController, 'reports'],
    ['research', ResearchController, 'research'],
    ['audit logs', AuditViewerController, 'audit-logs'],
    ['search', SearchController, 'search'],
    ['transport', TransportController, 'transport'],
    ['notifications', NotificationsController, 'enterprise/notifications'],
    ['privacy', PrivacyController, 'privacy'],
    ['security', SecurityController, 'security'],
  ];

  it.each(versionedControllers)('%s uses a relative v1 controller declaration', (_name, controller, path) => {
    expect(Reflect.getMetadata(PATH_METADATA, controller)).toBe(path);
    expect(Reflect.getMetadata(VERSION_METADATA, controller)).toBe('1');
  });

  it('keeps public institution branding versioned and unauthenticated', () => {
    expect(Reflect.getMetadata(PATH_METADATA, SettingsController.prototype.getPublicBranding)).toBe('public/branding');
    expect(Reflect.getMetadata(VERSION_METADATA, SettingsController.prototype.getPublicBranding)).toBeUndefined();
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, SettingsController.prototype.getPublicBranding)).toBe(true);
  });

  it('exposes module capabilities as an authenticated versioned route', () => {
    expect(Reflect.getMetadata(PATH_METADATA, SettingsController.prototype.getCapabilities)).toBe('capabilities');
    expect(Reflect.getMetadata(VERSION_METADATA, SettingsController.prototype.getCapabilities)).toBeUndefined();
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, SettingsController.prototype.getCapabilities)).toBeUndefined();
  });

  it('exposes the target user id in the administrative MFA recovery route', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AuthController.prototype.disableMfa)).toBe('mfa/:userId');
  });
});

describe('PaymentsController boundary controls', () => {
  const service = {
    initiatePayment: jest.fn(),
    getPaymentHistory: jest.fn(),
    handlePaystackWebhook: jest.fn(),
    handleRemitaWebhook: jest.fn(),
  };
  const controller = new PaymentsController(service as never);

  beforeEach(() => jest.clearAllMocks());

  it('passes the resolved Student.id, not User.id, to payment initiation', async () => {
    service.initiatePayment.mockResolvedValue({ paymentId: 'pay-1' });
    await controller.initiate(
      { studentFeeId: 'd3a84903-e4ea-4d97-ac22-fd73c891e4ec', provider: PaymentProvider.PAYSTACK },
      {
        sub: 'f04c1bf4-875e-459a-891c-1aa0a1f6ce4d', role: 'STUDENT', studentId: 'a99d2376-47b7-4f69-85a5-ced7dfa5c78f',
        iat: 0, exp: 1, jti: 'route-contract-test', staffScope: null, institutionId: 'inst-1', mfaVerified: true,
      },
      'same-request-idempotency-key',
    );

    expect(service.initiatePayment).toHaveBeenCalledWith(
      expect.objectContaining({ provider: PaymentProvider.PAYSTACK }),
      'a99d2376-47b7-4f69-85a5-ced7dfa5c78f',
      'same-request-idempotency-key',
    );
  });

  it('rejects payment initiation without the required idempotency key', async () => {
    await expect(controller.initiate(
      { studentFeeId: 'd3a84903-e4ea-4d97-ac22-fd73c891e4ec', provider: PaymentProvider.PAYSTACK },
      {
        sub: 'f04c1bf4-875e-459a-891c-1aa0a1f6ce4d', role: 'STUDENT', studentId: 'a99d2376-47b7-4f69-85a5-ced7dfa5c78f',
        iat: 0, exp: 1, jti: 'route-contract-test', staffScope: null, institutionId: 'inst-1', mfaVerified: true,
      },
      undefined,
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(service.initiatePayment).not.toHaveBeenCalled();
  });

  it('does not permit payment initialization to retain a request-wide RLS transaction during provider I/O', () => {
    expect(Reflect.getMetadata(SKIP_REQUEST_RLS_TRANSACTION_KEY, PaymentsController.prototype.initiate)).toBe(true);
  });

  it('rejects provider webhooks when the original raw bytes were not captured', async () => {
    await expect(controller.paystackWebhook({ body: { event: 'charge.success' } } as never, 'signature')).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.remitaWebhook({ body: { rrr: '123' } } as never, 'signature')).rejects.toBeInstanceOf(BadRequestException);
  });
});
