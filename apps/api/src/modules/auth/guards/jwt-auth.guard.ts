import {
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

import { IS_PUBLIC_KEY } from '../../../common/decorators';

/**
 * JwtAuthGuard — global guard applied to every route in the application.
 *
 * Bypass: @Public() decorator marks routes that don't require authentication
 * (login, forgot-password, health checks, degree verification).
 *
 * On success: populates req.user with the decoded JwtPayload.
 * On failure: returns 401 with standardized ApiError envelope.
 *
 * Applied globally in AppModule:
 *   providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }]
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // Allow @Public() decorated routes without a token
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    return super.canActivate(context);
  }

  handleRequest<TUser = unknown>(
    err: Error | null,
    user: TUser,
    info: { message?: string } | null,
  ): TUser {
    if (err || !user) {
      const reason = info?.message ?? err?.message ?? 'No token provided';
      const code =
        reason.includes('expired') ? 'AUTH_TOKEN_EXPIRED' :
        reason.includes('invalid') ? 'AUTH_INVALID_CREDENTIALS' :
        'AUTH_TOKEN_EXPIRED';

      throw new UnauthorizedException({ code, message: 'Authentication required' });
    }
    return user;
  }
}
