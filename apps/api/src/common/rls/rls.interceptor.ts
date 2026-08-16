import {
  CallHandler, ExecutionContext, Injectable, NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from } from 'rxjs';

import { PrismaService } from '../../database/prisma.service';
import { IS_PUBLIC_KEY, SKIP_REQUEST_RLS_TRANSACTION_KEY } from '../decorators';
import { RlsContextService } from './rls-context.service';

/**
 * RlsInterceptor — audit remediation R2.
 *
 * Applied globally (see app.module.ts). For every request that reached a
 * handler with an authenticated `req.user` (JwtAuthGuard runs before
 * interceptors, so `req.user` is already populated; public routes have no
 * user and are passed through untouched), this opens ONE
 * `PrismaService.withRls()` transaction for the lifetime of the request and
 * stores it in RlsContextService's AsyncLocalStorage.
 *
 * IMPORTANT CAVEAT (documented rather than hidden): wrapping the entire
 * request in a single transaction is the correct way to make `SET LOCAL`
 * session variables actually scope to that request, but it also means
 * every request now holds one DB connection from the pool for its full
 * duration, including any time spent on non-DB work (external API calls,
 * BullMQ enqueue, etc.) inside the handler. For most CRUD endpoints this is
 * fine; for handlers that do slow external I/O alongside DB writes, that
 * tradeoff should be reviewed per-route before wide rollout — flagged here
 * rather than glossed over.
 */
@Injectable()
export class RlsInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly rlsContext: RlsContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    const skipRequestTransaction = this.reflector.getAllAndOverride<boolean>(SKIP_REQUEST_RLS_TRANSACTION_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    if (isPublic || skipRequestTransaction) return next.handle();

    const req = context.switchToHttp().getRequest();
    const user = req.user as { sub?: string; role?: string; staffScope?: { deptId?: string } } | undefined;

    // No authenticated user (shouldn't normally happen post-JwtAuthGuard on
    // a non-public route, but fail safe rather than throw here — the guard
    // is the actual authentication boundary, not this interceptor).
    if (!user?.sub) return next.handle();

    const userId = user.sub;
    const role = user.role ?? 'UNKNOWN';
    const deptId = user.staffScope?.deptId ?? '';

    // Assumes one response per request (true for every REST handler in this
    // API — none return multi-value streams/SSE). If that ever changes,
    // this needs to buffer all emissions inside the transaction instead of
    // resolving on the first one.
    return from(
      this.prisma.withRls(userId, role, deptId, async (tx) =>
        this.rlsContext.run(tx, () => new Promise((resolve, reject) => {
          next.handle().subscribe({
            next: resolve,
            error: reject,
          });
        })),
      ),
    );
  }
}
