import {
  CanActivate, ExecutionContext, Injectable,
  SetMetadata, UnprocessableEntityException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { CalendarService } from '../../modules/calendar/calendar.service';
import { IS_PUBLIC_KEY } from '../decorators';

export const REQUIRES_ACTIVE_CALENDAR = 'requiresActiveCalendar';

/**
 * @RequiresActiveCalendar() decorator — marks endpoints that must fail
 * with 422 BUSINESS_RULE_CALENDAR_INACTIVE when the academic calendar
 * is SUSPENDED, DRAFT, or COMPLETED.
 *
 * Usage:
 *   @RequiresActiveCalendar()
 *   @Post('register-courses')
 *   async registerCourses() {}
 *
 * ASUU strike mode: Registrar/VC suspends the calendar. This guard
 * immediately blocks all decorated endpoints on the next request.
 * No deployment, no code change needed — state machine drives behaviour.
 *
 * Modules that respect this guard (P3+):
 *   - Course registration
 *   - Result submission and approval
 *   - Timetable slot creation
 *   - Course offering creation (curriculum module already validates inline)
 */
export const RequiresActiveCalendar = () =>
  SetMetadata(REQUIRES_ACTIVE_CALENDAR, true);

@Injectable()
export class CalendarGuard implements CanActivate {
  constructor(
    private readonly reflector:       Reflector,
    private readonly calendarService: CalendarService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Skip @Public() routes
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    if (isPublic) return true;

    // Only run the check on decorated handlers
    const requiresActive = this.reflector.getAllAndOverride<boolean>(
      REQUIRES_ACTIVE_CALENDAR,
      [context.getHandler(), context.getClass()],
    );
    if (!requiresActive) return true;

    const calendar = await this.calendarService.getActive() as { status: string } | null;

    if (!calendar || calendar.status !== 'ACTIVE') {
      throw new UnprocessableEntityException({
        code:    'BUSINESS_RULE_CALENDAR_INACTIVE',
        message: calendar?.status === 'SUSPENDED'
          ? 'Academic operations are currently suspended (ASUU strike mode). Please check the institution notice board for updates.'
          : 'No active academic calendar. Please contact the Registrar\'s office.',
      });
    }

    return true;
  }
}
