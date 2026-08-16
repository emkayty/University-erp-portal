import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

interface ResponseEnvelope {
  success: boolean;
  data?: unknown;
  error?: unknown;
}

function isEnvelope(value: unknown): value is ResponseEnvelope {
  return typeof value === 'object' && value !== null && 'success' in value;
}

/**
 * Normalises JSON responses at the HTTP boundary.
 *
 * Most controllers already return `{ success, data }`, while legacy and
 * feature modules return the service value directly. The web client consumes
 * one envelope contract, so this interceptor repairs the boundary centrally
 * without forcing a risky mechanical rewrite across every controller.
 * Explicit responses (`@Res()`), redirects, binary downloads, 204 responses,
 * and already-enveloped payloads are left untouched.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const response = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((value: unknown) => {
        if (response.statusCode === 204 || response.headersSent) return value;
        if (value === undefined || value === null) return { success: true, data: value };
        if (isEnvelope(value) || Buffer.isBuffer(value) || typeof value === 'string') return value;
        return { success: true, data: value };
      }),
    );
  }
}
