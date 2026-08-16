import { createHash, randomBytes } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
import { v4 as uuid } from 'uuid';
import type { JwtPayload, RoleName as RoleNameType, StaffScopeAttribute } from '@uniportal/types';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';

const REFRESH_KEY = (hash: string) => `refresh:${hash}`;
const SESSION_SET  = (uid: string)  => `user_sessions:${uid}`;

export interface TokenPair { accessToken: string; refreshToken: string; }
export interface RefreshTokenMeta {
  userId: string; sessionId: string;
  deviceInfo?: { userAgent?: string; ip?: string };
}

@Injectable()
export class TokenService {
  private readonly logger     = new Logger(TokenService.name);
  private readonly accessTtl:  number;
  private readonly refreshTtl: number;
  private readonly privateKey: Buffer;
  private readonly publicKey:  string;
  private readonly issuer      = 'uniportal-erp';   // H3: iss claim
  private readonly audience    = 'uniportal-api';   // H3: aud claim

  constructor(
    private readonly jwt:    JwtService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.accessTtl  = config.get<number>('JWT_ACCESS_TOKEN_TTL',  900);
    this.refreshTtl = config.get<number>('JWT_REFRESH_TOKEN_TTL', 604800);
    this.privateKey = Buffer.from(config.get<string>('JWT_PRIVATE_KEY_B64', ''), 'base64');
    this.publicKey  = Buffer.from(config.get<string>('JWT_PUBLIC_KEY_B64',  ''), 'base64').toString('utf8');
  }

  generateAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp' | 'jti'>): string {
    return this.jwt.sign(
      { ...payload, jti: uuid() },
      {
        algorithm:  'RS256',
        privateKey: this.privateKey,
        expiresIn:  this.accessTtl,
        issuer:     this.issuer,   // H3
        audience:   this.audience, // H3
      },
    );
  }

  verifyAccessToken(token: string): JwtPayload {
    return this.jwt.verify<JwtPayload>(token, {
      algorithms: ['RS256'],
      publicKey:  this.publicKey,
      issuer:     this.issuer,   // H3
      audience:   this.audience, // H3
    });
  }

  async issueRefreshToken(userId: string, meta: Omit<RefreshTokenMeta, 'userId'>): Promise<string> {
    const raw   = randomBytes(64).toString('hex');
    const hash  = this.hash(raw);
    const value = JSON.stringify({ userId, ...meta });
    await this.redis.setex(REFRESH_KEY(hash), this.refreshTtl, value);
    await this.redis.sadd(SESSION_SET(userId), hash);
    await this.redis.expire(SESSION_SET(userId), this.refreshTtl + 86400);
    return raw;
  }

  async rotateRefreshToken(
    rawToken: string,
    _deviceInfo: { userAgent?: string; ip?: string },
  ): Promise<{ userId: string; meta: RefreshTokenMeta } | null> {
    const hash = this.hash(rawToken);
    // GET + DEL must be one Redis-side operation. Otherwise two concurrent
    // refresh requests can both observe the same token before either deletes it.
    const script = `
      local value = redis.call('GET', KEYS[1])
      if not value then return false end
      local meta = cjson.decode(value)
      redis.call('DEL', KEYS[1])
      redis.call('SREM', 'user_sessions:' .. meta.userId, ARGV[1])
      return value
    `;
    const scriptSha = createHash('sha1').update(script).digest('hex');
    let value: unknown;
    try {
      value = await this.redis.evalsha(scriptSha, 1, REFRESH_KEY(hash), hash);
    } catch (error) {
      // Redis may not have the script cached after a restart. Load it once,
      // then the normal path remains EVALSHA and the operation stays atomic.
      if (!(error instanceof Error) || !error.message.includes('NOSCRIPT')) throw error;
      const evalScript = (this.redis as unknown as { eval: (...args: unknown[]) => Promise<unknown> }).eval;
      value = await evalScript.call(this.redis, script, 1, REFRESH_KEY(hash), hash);
    }
    const consumed = value as string | null | false;
    if (!consumed) {
      this.logger.warn(`Refresh token not found or already consumed: ${hash.slice(0, 16)}`);
      return null;
    }
    const meta = JSON.parse(consumed) as RefreshTokenMeta;
    return { userId: meta.userId, meta };
  }

  async revokeRefreshToken(raw: string): Promise<void> {
    const hash  = this.hash(raw);
    const data  = await this.redis.get(REFRESH_KEY(hash));
    if (data) {
      const { userId } = JSON.parse(data) as RefreshTokenMeta;
      await this.redis.del(REFRESH_KEY(hash));
      await this.redis.srem(SESSION_SET(userId), hash);
    }
  }

  async revokeAllUserSessions(userId: string): Promise<number> {
    const hashes = await this.redis.smembers(SESSION_SET(userId));
    if (!hashes.length) return 0;
    const p = this.redis.pipeline();
    hashes.forEach((h) => p.del(REFRESH_KEY(h)));
    p.del(SESSION_SET(userId));
    await p.exec();
    return hashes.length;
  }

  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  getCookieOptions(isProd: boolean) {
    return {
      httpOnly: true, secure: isProd, sameSite: 'strict' as const,
      maxAge: this.refreshTtl * 1000, path: '/api/v1/auth',
    };
  }
}
