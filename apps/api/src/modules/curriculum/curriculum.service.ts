import {
  BadRequestException, ConflictException, ForbiddenException,
  Injectable, Logger, UnprocessableEntityException,
} from '@nestjs/common';
import { AuditAction, CourseOfferingLifecycle } from '@prisma/client';
import type { RoleName } from '@uniportal/types';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import type {
  AddPrerequisiteDto, AddProgrammeCourseDto, CreateCourseDto,
  CreateCourseOfferingDto, CreateDepartmentDto, CreateFacultyDto, TransitionCourseOfferingDto,
  CreateProgrammeDto, UpdateCourseDto, UpdateDepartmentDto,
  UpdateFacultyDto, UpdateProgrammeDto,
} from './dto/curriculum.dto';

/**
 * CurriculumService — manages the full academic curriculum hierarchy.
 *
 * Faculty → Department → Programme → Course → CourseOffering
 *
 * Key invariants enforced:
 *  1. Prerequisite DAG: adding a prerequisite that creates a cycle is rejected
 *     (DFS cycle detection on the in-memory prerequisite graph)
 *  2. CCMAS compliance: GET /curriculum/ccmas-compliance validates ≥70% CORE
 *     per programme as required by NUC regulations
 *  3. Credit unit freeze: course credit units cannot be changed once students
 *     have registered for offerings of that course
 *  4. Unique constraints: faculty code, dept code, programme code, course code
 */
@Injectable()
export class CurriculumService {
  private readonly logger = new Logger(CurriculumService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit:  AuditService,
  ) {}

  private async assertOwnedWrite(
    entity: 'department' | 'programme' | 'course',
    id: string,
    actorId: string,
    roles: RoleName[] = [],
  ): Promise<void> {
    if (roles.includes('SUPER_ADMIN') || roles.includes('REGISTRAR')) return;

    const requiresDean = roles.includes('DEAN');
    const requiresHod = roles.includes('HOD');
    if (!requiresDean && !requiresHod) {
      throw new ForbiddenException('You are not authorized to modify this academic structure.');
    }

    type DepartmentOwnership = {
      hod: { userId: string } | null;
      faculty: { dean: { userId: string } | null };
    };
    let department: DepartmentOwnership | null = null;

    if (entity === 'department') {
      department = await this.prisma.department.findUnique({
        where: { id },
        select: { hod: { select: { userId: true } }, faculty: { select: { dean: { select: { userId: true } } } } },
      });
    } else if (entity === 'programme') {
      const programme = await this.prisma.programme.findUnique({
        where: { id },
        select: { department: { select: { hod: { select: { userId: true } }, faculty: { select: { dean: { select: { userId: true } } } } } } },
      });
      department = programme?.department ?? null;
    } else {
      const course = await this.prisma.course.findUnique({
        where: { id },
        select: { department: { select: { hod: { select: { userId: true } }, faculty: { select: { dean: { select: { userId: true } } } } } } },
      });
      department = course?.department ?? null;
    }

    if (!department) throw new BadRequestException('Academic structure record was not found.');
    const deanOwns = requiresDean && department.faculty.dean?.userId === actorId;
    const hodOwns = requiresHod && department.hod?.userId === actorId;
    if (!deanOwns && !hodOwns) {
      throw new ForbiddenException('You may only modify academic structures within your assigned faculty or department.');
    }
  }

  // ═══════════════ FACULTY ══════════════════════════════════════════════════

  async createFaculty(dto: CreateFacultyDto, actorId: string) {
    const faculty = await this.prisma.faculty.create({
      data: { name: dto.name, code: dto.code.toUpperCase() },
    });
    await this.audit.log({ action: AuditAction.CREATE, targetTable: 'faculties', targetId: faculty.id, newValues: { name: dto.name, code: faculty.code } }, actorId);
    return faculty;
  }

  async updateFaculty(id: string, dto: UpdateFacultyDto, actorId: string) {
    const faculty = await this.prisma.faculty.findUniqueOrThrow({ where: { id } });
    const updated = await this.prisma.faculty.update({ where: { id }, data: dto });
    await this.audit.log({ action: AuditAction.UPDATE, targetTable: 'faculties', targetId: id, oldValues: { name: faculty.name, isActive: faculty.isActive }, newValues: dto as Record<string, unknown> }, actorId);
    return updated;
  }

  async findAllFaculties() {
    const faculties = await this.prisma.faculty.findMany({
      include: { departments: { select: { id: true } } },
      orderBy: { name: 'asc' },
    });
    return faculties.map((f) => ({ ...f, departmentCount: f.departments.length }));
  }

  async findFacultyById(id: string) {
    return this.prisma.faculty.findUniqueOrThrow({
      where:   { id },
      include: { departments: { include: { programmes: { select: { id: true } } } } },
    });
  }

  // ═══════════════ DEPARTMENT ═══════════════════════════════════════════════

  async createDepartment(dto: CreateDepartmentDto, actorId: string) {
    await this.prisma.faculty.findUniqueOrThrow({ where: { id: dto.facultyId } });
    const dept = await this.prisma.department.create({
      data: { name: dto.name, code: dto.code.toUpperCase(), facultyId: dto.facultyId },
    });
    await this.audit.log({ action: AuditAction.CREATE, targetTable: 'departments', targetId: dept.id, newValues: { name: dto.name, facultyId: dto.facultyId } }, actorId);
    return dept;
  }

  async updateDepartment(id: string, dto: UpdateDepartmentDto, actorId: string, roles: RoleName[] = []) {
    await this.assertOwnedWrite('department', id, actorId, roles);
    const updated = await this.prisma.department.update({ where: { id }, data: dto });
    await this.audit.log({ action: AuditAction.UPDATE, targetTable: 'departments', targetId: id, newValues: dto as Record<string, unknown> }, actorId);
    return updated;
  }

  async findAllDepartments(facultyId?: string) {
    const depts = await this.prisma.department.findMany({
      where:   facultyId ? { facultyId } : undefined,
      include: {
        faculty:    { select: { name: true, code: true } },
        programmes: { select: { id: true } },
        courses:    { select: { id: true } },
      },
      orderBy: [{ faculty: { name: 'asc' } }, { name: 'asc' }],
    });
    return depts.map((d) => ({
      ...d,
      facultyName:    d.faculty.name,
      programmeCount: d.programmes.length,
      courseCount:    d.courses.length,
    }));
  }

  // ═══════════════ PROGRAMME ════════════════════════════════════════════════

  async createProgramme(dto: CreateProgrammeDto, actorId: string) {
    await this.prisma.department.findUniqueOrThrow({ where: { id: dto.departmentId } });

    if ((dto.minCreditUnits ?? 120) >= (dto.maxCreditUnits ?? 180)) {
      throw new BadRequestException('minCreditUnits must be less than maxCreditUnits');
    }

    const programme = await this.prisma.programme.create({
      data: {
        name:          dto.name,
        code:          dto.code.toUpperCase(),
        departmentId:  dto.departmentId,
        degreeType:    dto.degreeType as never,
        durationYears: dto.durationYears,
        minCreditUnits: dto.minCreditUnits ?? 120,
        maxCreditUnits: dto.maxCreditUnits ?? 180,
      },
    });
    await this.audit.log({ action: AuditAction.CREATE, targetTable: 'programmes', targetId: programme.id, newValues: { code: programme.code, name: programme.name } }, actorId);
    return programme;
  }

  async updateProgramme(id: string, dto: UpdateProgrammeDto, actorId: string, roles: RoleName[] = []) {
    await this.assertOwnedWrite('programme', id, actorId, roles);
    if (dto.minCreditUnits !== undefined && dto.maxCreditUnits !== undefined &&
        dto.minCreditUnits >= dto.maxCreditUnits) {
      throw new BadRequestException('minCreditUnits must be less than maxCreditUnits');
    }
    const updated = await this.prisma.programme.update({ where: { id }, data: dto });
    await this.audit.log({ action: AuditAction.UPDATE, targetTable: 'programmes', targetId: id, newValues: dto as Record<string, unknown> }, actorId);
    return updated;
  }

  async findAllProgrammes(departmentId?: string) {
    return this.prisma.programme.findMany({
      where:   departmentId ? { departmentId } : undefined,
      include: {
        department: { include: { faculty: { select: { name: true } } } },
        programmeCourses: { select: { courseId: true } },
      },
      orderBy: [{ department: { faculty: { name: 'asc' } } }, { name: 'asc' }],
    });
  }

  async findProgrammeById(id: string) {
    return this.prisma.programme.findUniqueOrThrow({
      where:   { id },
      include: {
        department: { include: { faculty: true } },
        programmeCourses: {
          include: { course: { include: { department: true } } },
          orderBy: [{ level: 'asc' }, { semester: 'asc' }],
        },
      },
    });
  }

  // ═══════════════ COURSE ═══════════════════════════════════════════════════

  async createCourse(dto: CreateCourseDto, actorId: string, roles: RoleName[] = []) {
    const department = await this.prisma.department.findUniqueOrThrow({ where: { id: dto.departmentId } });
    if (!roles.includes('SUPER_ADMIN') && !roles.includes('REGISTRAR')) {
      await this.assertOwnedWrite('department', department.id, actorId, roles);
    }
    const course = await this.prisma.course.create({
      data: {
        code:          dto.code.toUpperCase(),
        title:         dto.title,
        creditUnits:   dto.creditUnits,
        departmentId:  dto.departmentId,
        ccmasCategory: dto.ccmasCategory as never,
        description:   dto.description ?? null,
      },
    });
    await this.audit.log({ action: AuditAction.CREATE, targetTable: 'courses', targetId: course.id, newValues: { code: course.code, title: course.title } }, actorId);
    return course;
  }

  async updateCourse(id: string, dto: UpdateCourseDto, actorId: string, roles: RoleName[] = []) {
    await this.assertOwnedWrite('course', id, actorId, roles);
    const course = await this.prisma.course.findUniqueOrThrow({ where: { id } });

    // UpdateCourseDto deliberately excludes creditUnits. Defend this domain
    // invariant at runtime as well, because service calls can bypass DTO parsing.
    const requestedCreditUnits = (dto as UpdateCourseDto & { creditUnits?: number }).creditUnits;
    if (requestedCreditUnits !== undefined && requestedCreditUnits !== course.creditUnits) {
      throw new BadRequestException('Credit units cannot be changed after a course has been offered. Contact the Registrar\'s office for assistance.');
    }

    const updated = await this.prisma.course.update({ where: { id }, data: dto });
    await this.audit.log({ action: AuditAction.UPDATE, targetTable: 'courses', targetId: id, newValues: dto as Record<string, unknown> }, actorId);
    return updated;
  }

  async findAllCourses(departmentId?: string) {
    return this.prisma.course.findMany({
      where:   departmentId ? { departmentId } : undefined,
      include: {
        department:    { select: { name: true, code: true } },
        prerequisites: { include: { prerequisite: { select: { code: true, title: true } } } },
      },
      orderBy: { code: 'asc' },
    });
  }

  async findCourseById(id: string) {
    return this.prisma.course.findUniqueOrThrow({
      where:   { id },
      include: {
        department:    true,
        prerequisites: { include: { prerequisite: true } },
        requiredBy:    { include: { course: { select: { code: true, title: true } } } },
      },
    });
  }

  // ── Prerequisites with DAG cycle detection ────────────────────────────────
  async addPrerequisite(courseId: string, dto: AddPrerequisiteDto, actorId: string, roles: RoleName[] = []) {
    await this.assertOwnedWrite('course', courseId, actorId, roles);
    if (courseId === dto.prerequisiteId) {
      throw new BadRequestException('A course cannot be its own prerequisite');
    }

    await this.prisma.course.findUniqueOrThrow({ where: { id: courseId } });
    await this.prisma.course.findUniqueOrThrow({ where: { id: dto.prerequisiteId } });

    // Load full prerequisite graph for cycle detection
    const allPrereqs = await this.prisma.coursePrerequisite.findMany({
      select: { courseId: true, prerequisiteId: true },
    });

    // Build adjacency list: courseId → [prerequisiteIds]
    const graph = new Map<string, string[]>();
    for (const { courseId: cId, prerequisiteId: pId } of allPrereqs) {
      if (!graph.has(cId)) graph.set(cId, []);
      graph.get(cId)!.push(pId);
    }
    // Tentatively add the new edge
    if (!graph.has(courseId)) graph.set(courseId, []);
    graph.get(courseId)!.push(dto.prerequisiteId);

    // DFS: does prerequisiteId eventually depend on courseId? (i.e. does adding this edge create a cycle?)
    if (this.dfsHasCycle(graph, dto.prerequisiteId, courseId, new Set())) {
      throw new UnprocessableEntityException({
        code:    'BUSINESS_RULE_INVALID_STATE',
        message: 'Adding this prerequisite would create a circular dependency in the course prerequisite graph.',
      });
    }

    const prereq = await this.prisma.coursePrerequisite.create({
      data: { courseId, prerequisiteId: dto.prerequisiteId, minGrade: dto.minGrade ?? 'E' },
    });
    await this.audit.log({ action: AuditAction.CREATE, targetTable: 'course_prerequisites', targetId: prereq.id, newValues: { courseId, prerequisiteId: dto.prerequisiteId } }, actorId);
    return prereq;
  }

  async removePrerequisite(courseId: string, prerequisiteId: string, actorId: string, roles: RoleName[] = []) {
    await this.assertOwnedWrite('course', courseId, actorId, roles);
    const existing = await this.prisma.coursePrerequisite.findUnique({
      where: { uq_course_prereq: { courseId, prerequisiteId } },
    });
    if (!existing) throw new BadRequestException('Prerequisite relationship not found');

    await this.prisma.coursePrerequisite.delete({
      where: { uq_course_prereq: { courseId, prerequisiteId } },
    });
    await this.audit.log({ action: AuditAction.DELETE, targetTable: 'course_prerequisites', targetId: existing.id }, actorId);
  }

  /**
   * DFS cycle detection on the prerequisite graph.
   * Returns true if there is a path from `start` to `target`.
   */
  private dfsHasCycle(
    graph:   Map<string, string[]>,
    start:   string,
    target:  string,
    visited: Set<string>,
  ): boolean {
    if (start === target) return true;
    if (visited.has(start)) return false;
    visited.add(start);
    for (const neighbor of graph.get(start) ?? []) {
      if (this.dfsHasCycle(graph, neighbor, target, visited)) return true;
    }
    return false;
  }

  // ── Programme Course mapping ───────────────────────────────────────────────
  async addProgrammeCourse(programmeId: string, dto: AddProgrammeCourseDto, actorId: string, roles: RoleName[] = []) {
    await this.assertOwnedWrite('programme', programmeId, actorId, roles);
    const programme = await this.prisma.programme.findUniqueOrThrow({ where: { id: programmeId } });
    const course = await this.prisma.course.findUniqueOrThrow({ where: { id: dto.courseId } });

    let curriculumVersion = dto.curriculumVersionId
      ? await this.prisma.curriculumVersion.findFirst({ where: { id: dto.curriculumVersionId, programmeId } })
      : await this.prisma.curriculumVersion.findFirst({ where: { programmeId, status: 'ACTIVE' }, orderBy: { version: 'desc' } });

    if (dto.curriculumVersionId && !curriculumVersion) {
      throw new BadRequestException('Curriculum version does not belong to this programme');
    }
    if (!curriculumVersion) {
      const calendar = await this.prisma.academicCalendar.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'desc' } });
      curriculumVersion = await this.prisma.curriculumVersion.create({
        data: { programmeId: programme.id, academicYear: calendar?.academicYear ?? '0000/0000', version: 1, status: 'ACTIVE' },
      });
    }

    const duplicate = await this.prisma.programmeCourse.findFirst({
      where: { curriculumVersionId: curriculumVersion.id, courseId: dto.courseId, level: dto.level, semester: dto.semester as never },
    });
    if (duplicate) throw new ConflictException('Course already exists in this curriculum version at the specified level/semester');

    const pc = await this.prisma.programmeCourse.create({
      data: {
        programmeId, curriculumVersionId: curriculumVersion.id, courseId: dto.courseId,
        level: dto.level, semester: dto.semester as never,
        isCompulsory: dto.isCompulsory ?? true,
        ccmasCategory: dto.ccmasCategory ?? course.ccmasCategory,
      },
    });
    await this.audit.log({
      action: AuditAction.CREATE, targetTable: 'programme_courses', targetId: pc.courseId,
      newValues: { programmeId, curriculumVersionId: curriculumVersion.id, courseId: dto.courseId, level: dto.level },
    }, actorId);
    return pc;
  }

  async removeProgrammeCourse(programmeId: string, courseId: string, level: number, semester: string, actorId: string, roles: RoleName[] = []) {
    await this.assertOwnedWrite('programme', programmeId, actorId, roles);
    const pc = await this.prisma.programmeCourse.findFirst({
      where: { programmeId, courseId, level, semester: semester as never, curriculumVersion: { status: 'ACTIVE' } },
    });
    if (!pc) throw new BadRequestException('Course not found in the active curriculum at the specified level/semester');
    await this.prisma.programmeCourse.delete({
      where: {
        curriculumVersionId_courseId_level_semester: {
          curriculumVersionId: pc.curriculumVersionId,
          courseId: pc.courseId,
          level: pc.level,
          semester: pc.semester,
        },
      },
    });
    await this.audit.log({ action: AuditAction.DELETE, targetTable: 'programme_courses', targetId: pc.courseId }, actorId);
  }

  // ── Course Offerings ─────────────────────────────────────────────────────
  async createOffering(dto: CreateCourseOfferingDto, actorId: string) {
    await this.prisma.course.findUniqueOrThrow({ where: { id: dto.courseId } });
    const calendar = await this.prisma.academicCalendar.findUniqueOrThrow({ where: { id: dto.academicCalendarId } });
    const semesterNumber = dto.semester === 'FIRST' ? 1 : dto.semester === 'SECOND' ? 2 : 3;
    const semester = await this.prisma.semester.findUnique({
      where: { uq_semester_year_number: { academicYear: calendar.academicYear, semesterNumber } },
    });
    if (!semester) throw new BadRequestException('The selected academic year/semester has not been configured yet');
    if (dto.lecturerId) {
      const lecturer = await this.prisma.staff.findUnique({ where: { id: dto.lecturerId } });
      if (!lecturer || lecturer.employmentStatus !== 'ACTIVE') throw new BadRequestException('Selected lecturer is not an active staff member');
    }
    const sectionCode = (dto.sectionCode ?? 'A').trim().toUpperCase();
    const existing = await this.prisma.courseOffering.findFirst({ where: { courseId: dto.courseId, semesterId: semester.id, sectionCode } });
    if (existing) throw new ConflictException(`Course offering ${sectionCode} already exists for this semester`);
    if (dto.curriculumVersionId) {
      const audience = await this.prisma.curriculumVersion.findUnique({ where: { id: dto.curriculumVersionId }, select: { id: true } });
      if (!audience) throw new BadRequestException('The selected offering curriculum audience does not exist');
    }

    const offering = await this.prisma.courseOffering.create({
      data: {
        courseId: dto.courseId, academicCalendarId: dto.academicCalendarId,
        academicYear: calendar.academicYear, semesterId: semester.id,
        semester: dto.semester as never, lecturerId: dto.lecturerId ?? null,
        curriculumVersionId: dto.curriculumVersionId ?? null,
        sectionCode, maxStudents: dto.maxStudents ?? null, lifecycleStatus: CourseOfferingLifecycle.PLANNED, isActive: true,
      },
    });
    await this.audit.log({
      action: AuditAction.CREATE, targetTable: 'course_offerings', targetId: offering.id,
      newValues: { courseId: dto.courseId, semesterId: semester.id, sectionCode },
    }, actorId);
    return offering;
  }

  async transitionOffering(id: string, dto: TransitionCourseOfferingDto, actorId: string) {
    const offering = await this.prisma.courseOffering.findUniqueOrThrow({
      where: { id },
      select: { id: true, lifecycleStatus: true, isActive: true },
    });
    const allowed: Record<CourseOfferingLifecycle, CourseOfferingLifecycle[]> = {
      [CourseOfferingLifecycle.PLANNED]: [CourseOfferingLifecycle.PUBLISHED, CourseOfferingLifecycle.CANCELLED],
      [CourseOfferingLifecycle.PUBLISHED]: [CourseOfferingLifecycle.REGISTRATION_OPEN, CourseOfferingLifecycle.CANCELLED],
      [CourseOfferingLifecycle.REGISTRATION_OPEN]: [CourseOfferingLifecycle.REGISTRATION_CLOSED, CourseOfferingLifecycle.CANCELLED],
      [CourseOfferingLifecycle.REGISTRATION_CLOSED]: [CourseOfferingLifecycle.TEACHING, CourseOfferingLifecycle.CANCELLED],
      [CourseOfferingLifecycle.TEACHING]: [CourseOfferingLifecycle.ASSESSMENT, CourseOfferingLifecycle.CANCELLED],
      [CourseOfferingLifecycle.ASSESSMENT]: [CourseOfferingLifecycle.EXAMINATION, CourseOfferingLifecycle.GRADING],
      [CourseOfferingLifecycle.EXAMINATION]: [CourseOfferingLifecycle.GRADING],
      [CourseOfferingLifecycle.GRADING]: [CourseOfferingLifecycle.RESULTS_PENDING],
      [CourseOfferingLifecycle.RESULTS_PENDING]: [CourseOfferingLifecycle.RESULTS_PUBLISHED],
      [CourseOfferingLifecycle.RESULTS_PUBLISHED]: [CourseOfferingLifecycle.COMPLETED],
      [CourseOfferingLifecycle.COMPLETED]: [],
      [CourseOfferingLifecycle.CANCELLED]: [],
    };
    const next = dto.status as CourseOfferingLifecycle;
    if (!allowed[offering.lifecycleStatus].includes(next)) {
      throw new UnprocessableEntityException({
        code: 'COURSE_OFFERING_INVALID_TRANSITION',
        message: `Cannot transition course offering from ${offering.lifecycleStatus} to ${next}.`,
      });
    }
    const updated = await this.prisma.courseOffering.update({
      where: { id },
      data: { lifecycleStatus: next, isActive: next !== CourseOfferingLifecycle.CANCELLED },
    });
    await this.audit.log({
      action: AuditAction.UPDATE,
      targetTable: 'course_offerings',
      targetId: id,
      oldValues: { lifecycleStatus: offering.lifecycleStatus, isActive: offering.isActive },
      newValues: { lifecycleStatus: next, isActive: next !== CourseOfferingLifecycle.CANCELLED, reason: dto.reason },
    }, actorId);
    return updated;
  }

  async findOfferings(calendarId?: string, semester?: string) {
    const semesterNumber = semester ? (semester === 'FIRST' ? 1 : semester === 'SECOND' ? 2 : 3) : undefined;
    return this.prisma.courseOffering.findMany({
      where: { ...(calendarId ? { academicCalendarId: calendarId } : {}), ...(semesterNumber ? { semesterModel: { semesterNumber } } : {}) },
      include: {
        course: { include: { department: true } },
        semesterModel: true,
        lecturer: { select: { id: true, employeeNo: true, firstName: true, lastName: true } },
      },
      orderBy: [{ course: { code: 'asc' } }, { sectionCode: 'asc' }],
    });
  }

  // ── NUC CCMAS Compliance ──────────────────────────────────────────────────
  /**
   * Validates that each programme has ≥70% CORE credit units as required by NUC.
   * Queries all programme-course mappings and categorises by ccmasCategory.
   */
  async getCcmasCompliance() {
    const programmes = await this.prisma.programme.findMany({
      where:   { isActive: true },
      include: {
        programmeCourses: {
          where: { curriculumVersion: { status: 'ACTIVE' } },
          select: { ccmasCategory: true, course: { select: { creditUnits: true } } },
        },
      },
    });

    return programmes.map((p) => {
      const courses      = p.programmeCourses;
      const totalUnits   = courses.reduce((s, pc) => s + pc.course.creditUnits, 0);
      const coreUnits    = courses.filter((pc) => pc.ccmasCategory === 'CORE').reduce((s, pc) => s + pc.course.creditUnits, 0);
      const electiveUnits = courses.filter((pc) => pc.ccmasCategory === 'ELECTIVE').reduce((s, pc) => s + pc.course.creditUnits, 0);
      const generalUnits  = courses.filter((pc) => pc.ccmasCategory === 'GENERAL_STUDIES').reduce((s, pc) => s + pc.course.creditUnits, 0);
      const corePct      = totalUnits > 0 ? Math.round((coreUnits / totalUnits) * 100) : 0;

      return {
        programmeId:   p.id,
        programmeName: p.name,
        programmeCode: p.code,
        totalUnits,
        coreUnits,
        electiveUnits,
        generalUnits,
        corePct,
        isCompliant:   corePct >= 70,
      };
    });
  }
}
