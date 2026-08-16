import {
  CanActivate, ExecutionContext, ForbiddenException,
  Injectable, SetMetadata,
} from '@nestjs/common';
import { ContextIdFactory, ModuleRef, Reflector } from '@nestjs/core';

import { SettingsService } from '../../modules/settings/settings.service';
import { IS_PUBLIC_KEY } from '../decorators';

export const FEATURE_FLAG_META = 'featureFlag';

/**
 * @FeatureFlag('module_lms') — gates a route behind an institution feature flag.
 *
 * Usage:
 *   @FeatureFlag('module_lms')
 *   @Get('courses')
 *   async getCourses() {}
 *
 * Returns 403 RBAC_FORBIDDEN when the flag is FALSE in InstitutionSettings.
 * Feature flags are cached in Redis (5 min) so the DB is not hit on every request.
 *
 * Flags are toggled at runtime via PATCH /api/v1/settings/feature-flags/:key
 * without any deployment or restart.
 */
export const FeatureFlag = (key: string) => SetMetadata(FEATURE_FLAG_META, key);

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    if (isPublic) return true;

    const flagKey = this.reflector.getAllAndOverride<string>(FEATURE_FLAG_META, [
      context.getHandler(), context.getClass(),
    ]);
    if (!flagKey) return true;

    const request = context.switchToHttp().getRequest();
    const contextId = ContextIdFactory.getByRequest(request);
    // SettingsService inherits request scope from audit attribution. Resolve it
    // only for a flagged request so this global guard stays singleton and its
    // Reflector dependency remains available for public routes and health probes.
    const settings = await this.moduleRef.resolve(SettingsService, contextId, { strict: false });
    const flags   = await settings.getFeatureFlags();
    const enabled = flags[flagKey] === true;

    if (!enabled) {
      throw new ForbiddenException({
        code:    'RBAC_FORBIDDEN',
        message: `This feature ("${flagKey}") is not enabled for your institution. Contact your system administrator.`,
      });
    }

    return true;
  }
}
