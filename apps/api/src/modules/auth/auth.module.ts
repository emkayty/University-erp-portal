import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuditService } from '../../common/audit/audit.service';
import { RedisModule } from '../../common/redis/redis.module';
import { isWorkerProcess } from '../../common/runtime/process-role';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionCleanupService } from './jobs/session-cleanup.service';
import { MfaService } from './services/mfa.service';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({ signOptions: { algorithm: 'RS256' } }),
    RedisModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService, TokenService, MfaService,
    PasswordService, JwtStrategy, AuditService,
    ...(isWorkerProcess() ? [SessionCleanupService] : []),
  ],
  exports: [AuthService, TokenService, PasswordService, AuditService],
})
export class AuthModule {}
