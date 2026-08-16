import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import Redis from 'ioredis';
import type { JwtPayload } from '@uniportal/types';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';
import { PrismaService } from '../../../database/prisma.service';

const USER_STATUS_CACHE_TTL = 60; // 60s — balances security and performance
const userStatusKey = (id: string) => `user:status:${id}`;

// Deep-audit fix (Aug 2026): unlike isActive/mfaEnabled above, a student's
// Student.id linked to their User.id essentially never changes once set at
// matriculation — so this can safely use a much longer TTL without the
// same staleness/security concern userStatusKey's 60s balances against.
const STUDENT_ID_CACHE_TTL = 3600; // 1 hour
const studentIdKey = (userId: string) => `user:studentId:${userId}`;

interface CachedUserStatus { isActive: boolean; mfaEnabled: boolean; }

/**
 * JwtStrategy — RS256 Passport strategy.
 *
 * H2 FIX: User active/mfaEnabled status is Redis-cached for 60 seconds.
 * Without caching, every authenticated request hits PostgreSQL, which at
 * 20,000 concurrent users equals ~20,000 DB queries/second from auth alone.
 * Cache is invalidated immediately on account deactivation via
 * UsersService.setActive() → redis.del(userStatusKey(id)).
 *
 * H3 FIX: Validates iss + aud claims (set in TokenService).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config:  ConfigService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    const pubKeyB64 = config.get<string>('JWT_PUBLIC_KEY_B64', '');
    const publicKey = Buffer.from(pubKeyB64, 'base64').toString('utf8');
    super({
      jwtFromRequest:   ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms:       ['RS256'],
      secretOrKey:      publicKey,
      issuer:           'uniportal-erp',  // H3
      audience:         'uniportal-api',  // H3
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // 1. Check Redis cache first
    const cached = await this.redis.get(userStatusKey(payload.sub));
    let status: CachedUserStatus;

    if (cached) {
      status = JSON.parse(cached) as CachedUserStatus;
    } else {
      // 2. Cache miss — query DB and cache result
      const user = await this.prisma.user.findUnique({
        where:  { id: payload.sub },
        select: { isActive: true, deletedAt: true, mfaEnabled: true },
      });

      if (!user || !user.isActive || user.deletedAt !== null) {
        throw new UnauthorizedException({
          code: 'AUTH_ACCOUNT_LOCKED', message: 'Account inactive or deleted',
        });
      }

      status = { isActive: user.isActive, mfaEnabled: user.mfaEnabled };
      // Cache for 60 seconds — invalidated by UsersService.setActive()
      await this.redis.setex(
        userStatusKey(payload.sub), USER_STATUS_CACHE_TTL, JSON.stringify(status),
      );
    }

    if (!status.isActive) {
      // Remove stale cache entry if account was deactivated
      await this.redis.del(userStatusKey(payload.sub));
      throw new UnauthorizedException({
        code: 'AUTH_ACCOUNT_LOCKED', message: 'Account has been deactivated',
      });
    }

    if (status.mfaEnabled && !payload.mfaVerified) {
      throw new UnauthorizedException({
        code: 'AUTH_MFA_REQUIRED', message: 'MFA verification required',
      });
    }

    // Deep-audit fix (Aug 2026): resolve Student.id once per (cached) hour
    // for STUDENT-role callers, so controllers can self-scope correctly —
    // see the studentId field's docblock on JwtPayload for the bug this
    // closes. Attached to the returned user object, not the signed token,
    // so no re-login is required for this fix to take effect and no
    // existing token-issuing code needed to change.
    let studentId: string | undefined;
    if (payload.role === 'STUDENT') {
      const cachedStudentId = await this.redis.get(studentIdKey(payload.sub));
      if (cachedStudentId) {
        studentId = cachedStudentId;
      } else {
        const student = await this.prisma.student.findUnique({
          where:  { userId: payload.sub },
          select: { id: true },
        });
        if (student) {
          studentId = student.id;
          await this.redis.setex(studentIdKey(payload.sub), STUDENT_ID_CACHE_TTL, student.id);
        }
        // No matching Student row (e.g. a STUDENT-role user pre-matriculation,
        // if that's ever possible) — leave studentId undefined rather than
        // caching a miss; callers that need it will get a clear error.
      }
    }

    return { ...payload, studentId };
  }
}
