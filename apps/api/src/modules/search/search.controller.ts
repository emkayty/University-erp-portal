import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Authenticated, CurrentUser, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { JwtPayload } from '@uniportal/types';
import { SearchService } from './search.service';

@UseGuards(RolesGuard)
@Controller({ path: 'search', version: '1' })
export class SearchController {
  constructor(private readonly search: SearchService) {}

  /**
   * GET /api/v1/search/global?q=...
   * Searches all accessible domains for the calling user's role.
   * Students: courses + library only.
   * Staff/HOD/Registrar: + students (dept-scoped for HOD).
   * HR Manager / Super Admin: + staff.
   */
  @Authenticated()
  @Get('global')
  async globalSearch(@Query('q') q: string, @CurrentUser() user: JwtPayload) {
    const role = user.role;
    const effectiveRoles = user.roles ?? [role];
    const studentSearchRoles = new Set(['REGISTRAR', 'HOD', 'STAFF', 'SUPER_ADMIN', 'VC', 'HR_MANAGER', 'BURSAR']);
    const staffSearchRoles = new Set(['HR_MANAGER', 'REGISTRAR', 'SUPER_ADMIN', 'VC']);
    const includeStudents = effectiveRoles.some((effectiveRole) => studentSearchRoles.has(effectiveRole));
    const includeStaff = effectiveRoles.some((effectiveRole) => staffSearchRoles.has(effectiveRole));
    const departmentId = includeStudents
      ? await this.search.resolveDepartmentScope(user)
      : undefined;

    return this.search.globalSearch(q ?? '', {
      includeStudents,
      includeStaff,
      departmentId,
    });
  }

  /**
   * GET /api/v1/search/students?q=...
   * Full student search — staff, hod, registrar, super_admin.
   */
  @Roles('STAFF','HOD','REGISTRAR','SUPER_ADMIN','VC','HR_MANAGER','BURSAR')
  @Get('students')
  async searchStudents(
    @Query('q') q: string,
    @Query('status') status: string | undefined,
    @Query('departmentId') departmentId: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    const scopedDepartmentId = await this.search.resolveDepartmentScope(user, departmentId);
    return this.search.searchStudents(q ?? '', { status, departmentId: scopedDepartmentId });
  }

  /**
   * GET /api/v1/search/staff?q=...
   * Staff search — hr_manager, registrar, super_admin, vc.
   */
  @Roles('HR_MANAGER','REGISTRAR','SUPER_ADMIN','VC')
  @Get('staff')
  async searchStaff(@Query('q') q: string, @Query('departmentId') departmentId: string | undefined, @CurrentUser() user: JwtPayload) {
    const scopedDepartmentId = await this.search.resolveDepartmentScope(user, departmentId);
    return this.search.searchStaff(q ?? '', { departmentId: scopedDepartmentId });
  }

  /**
   * GET /api/v1/search/courses?q=...
   * Course search — all authenticated users.
   */
  @Authenticated()
  @Get('courses')
  searchCourses(@Query('q') q: string, @Query('departmentId') departmentId?: string) {
    return this.search.searchCourses(q ?? '', { departmentId });
  }

  /**
   * GET /api/v1/search/library?q=...
   * Library catalogue search — all authenticated users.
   */
  @Authenticated()
  @Get('library')
  searchLibrary(@Query('q') q: string) {
    return this.search.searchLibraryItems(q ?? '');
  }
}
