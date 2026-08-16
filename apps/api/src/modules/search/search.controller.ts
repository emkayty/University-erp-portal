import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, Roles } from '../../common/decorators';
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
  @Get('global')
  async globalSearch(@Query('q') q: string, @CurrentUser() user: JwtPayload) {
    const role = user.role;
    const deptId = user.staffScope?.deptId;

    const includeStudents = ['REGISTRAR','HOD','STAFF','SUPER_ADMIN','VC','HR_MANAGER','BURSAR'].includes(role);
    const includeStaff    = ['HR_MANAGER','REGISTRAR','SUPER_ADMIN','VC'].includes(role);

    return this.search.globalSearch(q ?? '', {
      includeStudents,
      includeStaff,
      departmentId: role === 'HOD' ? deptId : undefined,
    });
  }

  /**
   * GET /api/v1/search/students?q=...
   * Full student search — staff, hod, registrar, super_admin.
   */
  @Roles('STAFF','HOD','REGISTRAR','SUPER_ADMIN','VC','HR_MANAGER','BURSAR')
  @Get('students')
  searchStudents(
    @Query('q') q: string,
    @Query('status') status?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.search.searchStudents(q ?? '', { status, departmentId });
  }

  /**
   * GET /api/v1/search/staff?q=...
   * Staff search — hr_manager, registrar, super_admin, vc.
   */
  @Roles('HR_MANAGER','REGISTRAR','SUPER_ADMIN','VC')
  @Get('staff')
  searchStaff(@Query('q') q: string, @Query('departmentId') departmentId?: string) {
    return this.search.searchStaff(q ?? '', { departmentId });
  }

  /**
   * GET /api/v1/search/courses?q=...
   * Course search — all authenticated users.
   */
  @Get('courses')
  searchCourses(@Query('q') q: string, @Query('departmentId') departmentId?: string) {
    return this.search.searchCourses(q ?? '', { departmentId });
  }

  /**
   * GET /api/v1/search/library?q=...
   * Library catalogue search — all authenticated users.
   */
  @Get('library')
  searchLibrary(@Query('q') q: string) {
    return this.search.searchLibraryItems(q ?? '');
  }
}
