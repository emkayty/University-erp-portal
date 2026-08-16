import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

/**
 * Logs every HTTP request in structured JSON format.
 *
 * Log format:
 * {
 *   "timestamp": "2026-06-01T12:00:00.000Z",
 *   "level": "info",
 *   "message": "POST /api/v1/auth/login → 200 (145ms)",
 *   "requestId": "uuid",
 *   "userId": "uuid | anonymous",
 *   "method": "POST",
 *   "path": "/api/v1/auth/login",
 *   "statusCode": 200,
 *   "durationMs": 145,
 *   "ip": "127.0.0.1",
 *   "userAgent": "Mozilla/5.0..."
 * }
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx      = context.switchToHttp();
    const request  = ctx.getRequest<Request & { user?: { id?: string } }>();
    const response = ctx.getResponse<Response>();

    const startMs   = Date.now();
    const suppliedRequestId = request.headers['x-request-id'];
    const requestId = typeof suppliedRequestId === 'string' &&
      /^[A-Za-z0-9._:-]{8,128}$/.test(suppliedRequestId)
      ? suppliedRequestId
      : crypto.randomUUID();

    // Attach requestId to request for downstream use
    request.headers['x-request-id'] = requestId;
    response.setHeader('X-Request-ID', requestId);

    const { method, path, ip } = request;
    const userAgent = (request.headers['user-agent'] as string | undefined) ?? '';

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - startMs;
          const statusCode = response.statusCode;
          const userId     = request.user?.id ?? 'anonymous';

          const logData = {
            requestId,
            userId,
            method,
            path,
            statusCode,
            durationMs,
            ip,
            userAgent: userAgent.slice(0, 120),
          };

          if (statusCode >= 400) {
            this.logger.warn(
              `${method} ${path} → ${statusCode} (${durationMs}ms)`,
              logData,
            );
          } else {
            this.logger.log(
              `${method} ${path} → ${statusCode} (${durationMs}ms)`,
              logData,
            );
          }
        },
        error: (err: unknown) => {
          const durationMs = Date.now() - startMs;
          this.logger.error(
            `${method} ${path} → ERROR (${durationMs}ms): ${err instanceof Error ? err.message : String(err)}`,
            { requestId, method, path, durationMs, ip },
          );
        },
      }),
    );
  }
}
