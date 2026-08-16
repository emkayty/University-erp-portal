import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

import type { ApiError, ErrorCode, ValidationDetail } from '@uniportal/types';

/**
 * Global exception filter — transforms all errors into the standard
 * ApiError envelope: { success: false, error: { code, message, field?, details? } }
 *
 * Guarantees:
 *  - Never exposes stack traces to the client
 *  - Always includes requestId for support correlation
 *  - Prisma errors are mapped to friendly codes
 *  - class-validator errors are expanded into details[]
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx      = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request  = ctx.getRequest<Request>();

    const requestId = (request.headers['x-request-id'] as string | undefined) ?? crypto.randomUUID();

    let status  = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred. Please contact support.';
    let field: string | undefined;
    let details: ValidationDetail[] | undefined;

    if (exception instanceof HttpException) {
      status  = exception.getStatus();
      const body = exception.getResponse() as
        | string
        | { message: string | string[]; error?: string; statusCode?: number };

      if (typeof body === 'string') {
        message = body;
      } else {
        // class-validator validation errors arrive as array of messages
        if (Array.isArray(body.message)) {
          message = 'Validation failed';
          code    = 'VALIDATION_ERROR';
          details = body.message.map((m) => {
            // NestJS validation format: "field: message"
            const colonIdx = m.indexOf(':');
            if (colonIdx > -1) {
              return {
                field:   m.slice(0, colonIdx).trim(),
                message: m.slice(colonIdx + 1).trim(),
              };
            }
            return { field: 'unknown', message: m };
          });
        } else {
          message = body.message ?? message;
        }
      }

      // Map HTTP status → error code
      code = this.statusToCode(status, code);

    } else if (this.isPrismaError(exception)) {
      const { status: s, code: c, message: m } = this.handlePrismaError(exception as PrismaError);
      status  = s;
      code    = c;
      message = m;
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled error: ${exception.message}`, exception.stack);
    } else {
      this.logger.error('Unhandled non-Error exception', exception);
    }

    const errorBody: ApiError = {
      success: false,
      error: { code, message, ...(field ? { field } : {}), ...(details ? { details } : {}) },
      requestId,
    };

    response.status(status).json(errorBody);
  }

  private statusToCode(status: number, fallback: ErrorCode): ErrorCode {
    const map: Record<number, ErrorCode> = {
      400: 'VALIDATION_ERROR',
      401: 'AUTH_TOKEN_EXPIRED',
      403: 'RBAC_FORBIDDEN',
      404: 'RESOURCE_NOT_FOUND',
      409: 'DUPLICATE_RESOURCE',
      422: 'BUSINESS_RULE_INVALID_STATE',
      429: 'RATE_LIMITED',
    };
    return map[status] ?? fallback;
  }

  // ── Prisma error handling ───────────────────────────────────────────────────
  private isPrismaError(e: unknown): boolean {
    return (
      typeof e === 'object' &&
      e !== null &&
      'code' in e &&
      typeof (e as Record<string, unknown>)['code'] === 'string' &&
      ((e as Record<string, unknown>)['code'] as string).startsWith('P')
    );
  }

  private handlePrismaError(e: PrismaError): {
    status: number;
    code: ErrorCode;
    message: string;
  } {
    this.logger.error(`Prisma error ${e.code}: ${e.message}`);

    switch (e.code) {
      case 'P2002': // Unique constraint violation
        return {
          status:  HttpStatus.CONFLICT,
          code:    'DUPLICATE_RESOURCE',
          message: `A record with this value already exists: ${String(e.meta?.['target'] ?? 'unknown field')}`,
        };
      case 'P2025': // Record not found
        return {
          status:  HttpStatus.NOT_FOUND,
          code:    'RESOURCE_NOT_FOUND',
          message: 'The requested record was not found',
        };
      case 'P2003': // Foreign key constraint
        return {
          status:  HttpStatus.UNPROCESSABLE_ENTITY,
          code:    'VALIDATION_ERROR',
          message: 'Related record not found — check referenced IDs',
        };
      case 'P2034': // Transaction conflict / deadlock
        return {
          status:  HttpStatus.CONFLICT,
          code:    'DUPLICATE_RESOURCE',
          message: 'A conflicting operation is in progress. Please retry.',
        };
      default:
        return {
          status:  HttpStatus.INTERNAL_SERVER_ERROR,
          code:    'INTERNAL_ERROR',
          message: 'A database error occurred. Please contact support.',
        };
    }
  }
}

interface PrismaError {
  code: string;
  message: string;
  meta?: Record<string, unknown>;
}
