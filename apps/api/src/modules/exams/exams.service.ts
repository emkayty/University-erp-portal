import {
  BadRequestException, ConflictException, Injectable, Logger,
} from '@nestjs/common';
import { AuditAction, SemesterStatus } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { AcademicOfferingAuthorizationService, AcademicActorRole } from '../../common/authorization/academic-offering-authorization.service';
import { PrismaService } from '../../database/prisma.service';
import type {
  BulkAttendanceDto, CreateExamTimetableDto, CreateSemesterDto, RecordAttendanceDto, RecordExamMarkDto, UpdateExamTimetableDto,
} from './dto/exams.dto';

@Injectable()
export class ExamsService {
  private readonly logger = new Logger(ExamsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit:  AuditService,
    private readonly offeringAuthorization: AcademicOfferingAuthorizationService,
  ) {}

  // ── Semester lifecycle ─────────────────────────────────────────────────────
  async createSemester(dto: CreateSemesterDto, actorId: string) {
    if (!/^\d{4}\/\d{4}$/.test(dto.academicYear))
      throw new BadRequestException('Academic year must be YYYY/YYYY');

    const dates = [
      dto.enrollmentStartDate, dto.enrollmentEndDate,
      dto.classStartDate,      dto.classEndDate,
      dto.examStartDate,       dto.examEndDate,
      dto.resultDeadline,
    ].map((d) => new Date(d));

    if (dates[0]! >= dates[1]!) throw new BadRequestException('Enrollment: start must be before end');
    if (dates[2]! >= dates[3]!) throw new BadRequestException('Classes: start must be before end');
    if (dates[4]! >= dates[5]!) throw new BadRequestException('Exams: start must be before end');
    if (dates[5]! >= dates[6]!) throw new BadRequestException('Result deadline must be after exam end');
    // M3 FIX: Inter-phase ordering — enrollment must end before classes start; classes before exams
    if (dates[1]! > dates[2]!) throw new BadRequestException('Enrollment must end before classes start');
    if (dates[3]! > dates[4]!) throw new BadRequestException('Classes must end before exams start');

    const semester = await this.prisma.semester.create({
      data: {
        academicYear: dto.academicYear, semesterNumber: dto.semesterNumber, name: dto.name,
        enrollmentStartDate: dates[0]!, enrollmentEndDate: dates[1]!,
        classStartDate: dates[2]!,      classEndDate: dates[3]!,
        examStartDate:  dates[4]!,      examEndDate: dates[5]!,
        resultDeadline: dates[6]!,
        isCurrent: false, status: SemesterStatus.PLANNING,
      },
    });

    await this.audit.log({
      action: AuditAction.CREATE, targetTable: 'semesters', targetId: semester.id,
      newValues: { academicYear: dto.academicYear, semesterNumber: dto.semesterNumber },
    }, actorId);

    return semester;
  }

  async findAllSemesters(academicYear?: string) {
    return this.prisma.semester.findMany({
      where:   academicYear ? { academicYear } : undefined,
      orderBy: [{ academicYear: 'desc' }, { semesterNumber: 'asc' }],
    });
  }

  async getCurrentSemester() {
    return this.prisma.semester.findFirst({ where: { isCurrent: true } });
  }

  async setCurrentSemester(id: string, actorId: string) {
    // H1 FIX: Wrapped in $transaction to prevent TOCTOU race condition.
    // Without atomicity, two concurrent calls can produce two isCurrent=true semesters.
    // The uq_single_current_semester partial unique index (migration 0006) provides
    // a DB-level guarantee even if the transaction isolation fails under extreme load.
    //
    // M1 FIX (medium): Only allow REGISTRATION or ACTIVE semesters to become current —
    // a PLANNING semester cannot be activated for student enrollment.
    const target = await this.prisma.semester.findUniqueOrThrow({ where: { id } });
    if (!['REGISTRATION','ACTIVE'].includes(target.status)) {
      throw new BadRequestException(
        `Semester must be in REGISTRATION or ACTIVE status to be made current (current status: ${target.status})`,
      );
    }

    const semester = await this.prisma.$transaction(async (tx) => {
      await tx.semester.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
      return tx.semester.update({ where: { id }, data: { isCurrent: true } });
    });

    await this.audit.log({
      action: AuditAction.UPDATE, targetTable: 'semesters', targetId: id, newValues: { isCurrent: true },
    }, actorId);
    return semester;
  }

  async advanceSemesterStatus(id: string, actorId: string) {
    const sem = await this.prisma.semester.findUniqueOrThrow({ where: { id } });
    const flow = [
      SemesterStatus.PLANNING, SemesterStatus.REGISTRATION, SemesterStatus.ACTIVE,
      SemesterStatus.EXAMS, SemesterStatus.RESULT_ENTRY, SemesterStatus.COMPLETED,
    ];
    const idx = flow.indexOf(sem.status);
    if (idx === flow.length - 1) throw new BadRequestException('Semester is already COMPLETED');
    const next = flow[idx + 1]!;
    const updated = await this.prisma.semester.update({ where: { id }, data: { status: next } });
    await this.audit.log({
      action: AuditAction.UPDATE, targetTable: 'semesters', targetId: id,
      oldValues: { status: sem.status }, newValues: { status: next },
    }, actorId);
    return updated;
  }

  // ── Exam Timetable ─────────────────────────────────────────────────────────
  async createTimetableEntry(dto: CreateExamTimetableDto, actorId: string, actorRole: AcademicActorRole = 'REGISTRAR') {
    await this.offeringAuthorization.assertOfferingAccess(dto.courseOfferingId, actorId, actorRole);
    const examDate = new Date(dto.examDate);
    const semester = await this.prisma.semester.findUniqueOrThrow({ where: { id: dto.semesterId }, select: { examStartDate: true, examEndDate: true } });
    if (examDate < semester.examStartDate || examDate > semester.examEndDate) throw new BadRequestException({ code: 'EXAM_OUTSIDE_WINDOW', message: 'Exam date must fall inside the official semester examination window' });
    const offering = await this.prisma.courseOffering.findUniqueOrThrow({ where: { id: dto.courseOfferingId }, select: { semesterId: true } });
    if (offering.semesterId !== dto.semesterId) throw new BadRequestException({ code: 'SEMESTER_MISMATCH', message: 'Course offering and examination semester do not match' });

    const venue = await this.prisma.examVenue.findUniqueOrThrow({ where: { id: dto.venueId } });
    if (!venue.active) throw new BadRequestException('The selected examination venue is inactive');
    const newStart = this.toMinutes(dto.startTime);
    const newEnd = newStart + dto.durationMinutes;
    if (newStart < 0 || newStart >= 1440 || newEnd > 1440) throw new BadRequestException('Exam time is outside the valid 24-hour day');

    const existing = await this.prisma.examTimetable.findMany({ where: { semesterId: dto.semesterId, venueId: dto.venueId, examDate } });
    for (const entry of existing) {
      const a=this.toMinutes(entry.startTime), b=a+entry.durationMinutes;
      if (newStart < b && newEnd > a) throw new ConflictException({ code:'VENUE_EXAM_CLASH', message:`Venue "${venue.name}" has an examination clash at ${dto.startTime}` });
    }

    const registered = await this.prisma.courseRegistration.findMany({ where:{courseOfferingId:dto.courseOfferingId,status:{in:['REGISTERED','COMPLETED']}},select:{studentId:true} });
    if (registered.length > venue.capacity) throw new ConflictException({ code:'VENUE_CAPACITY_EXCEEDED', message:`Venue capacity (${venue.capacity}) is below the ${registered.length} registered candidates.` });

    const otherExams = await this.prisma.examTimetable.findMany({ where:{semesterId:dto.semesterId,examDate},select:{courseOfferingId:true,startTime:true,durationMinutes:true} });
    const conflicts=new Set<string>();
    for(const ex of otherExams){
      const a=newStart,b=newEnd,c=this.toMinutes(ex.startTime),d=c+ex.durationMinutes;
      if(a<d&&b>c){
        const other=await this.prisma.courseRegistration.findMany({where:{courseOfferingId:ex.courseOfferingId,status:{in:['REGISTERED','COMPLETED']}},select:{studentId:true}});
        const set=new Set(other.map(x=>x.studentId)); for(const r of registered) if(set.has(r.studentId)) conflicts.add(r.studentId);
      }
    }
    if(conflicts.size) throw new ConflictException({code:'STUDENT_EXAM_CLASH',message:`${conflicts.size} registered student(s) would have overlapping examinations`});

    const entry=await this.prisma.examTimetable.create({data:{
      courseOfferingId:dto.courseOfferingId,semesterId:dto.semesterId,venueId:dto.venueId,
      venue:dto.venue??venue.name,examDate,startTime:dto.startTime,durationMinutes:dto.durationMinutes,
      invigilatorNotes:dto.invigilatorNotes??null,
    }});
    await this.audit.log({action:AuditAction.CREATE,targetTable:'exam_timetables',targetId:entry.id,newValues:{venueId:dto.venueId,venue:venue.name,examDate:dto.examDate,startTime:dto.startTime}},actorId);
    return entry;
  }

  async updateTimetableEntry(id: string, dto: UpdateExamTimetableDto, actorId: string, actorRole: AcademicActorRole = 'REGISTRAR') {
    const current = await this.prisma.examTimetable.findUniqueOrThrow({ where: { id } });
    await this.offeringAuthorization.assertOfferingAccess(current.courseOfferingId, actorId, actorRole);
    const examDate = dto.examDate ? new Date(dto.examDate) : current.examDate;
    const venueId = dto.venueId ?? current.venueId;
    if (!venueId) throw new BadRequestException('A managed venue is required when rescheduling an examination.');
    const startTime = dto.startTime ?? current.startTime;
    const durationMinutes = dto.durationMinutes ?? current.durationMinutes;
    const semester = await this.prisma.semester.findUniqueOrThrow({ where: { id: current.semesterId }, select: { examStartDate: true, examEndDate: true } });
    if (examDate < semester.examStartDate || examDate > semester.examEndDate) throw new BadRequestException({ code: 'EXAM_OUTSIDE_WINDOW', message: 'Exam date must fall inside the official semester examination window' });
    const venue = await this.prisma.examVenue.findUniqueOrThrow({ where: { id: venueId } });
    if (!venue.active) throw new BadRequestException('The selected examination venue is inactive');
    const newStart = this.toMinutes(startTime);
    const newEnd = newStart + durationMinutes;
    if (newStart < 0 || newStart >= 1440 || newEnd > 1440) throw new BadRequestException('Exam time is outside the valid 24-hour day');
    const existing = await this.prisma.examTimetable.findMany({ where: { semesterId: current.semesterId, venueId, examDate, NOT: { id } }, select: { id: true, startTime: true, durationMinutes: true } });
    if (existing.some((entry) => { const start = this.toMinutes(entry.startTime); return newStart < start + entry.durationMinutes && newEnd > start; })) throw new ConflictException({ code: 'VENUE_EXAM_CLASH', message: `Venue "${venue.name}" has an examination clash at ${startTime}` });
    const registered = await this.prisma.courseRegistration.findMany({ where: { courseOfferingId: current.courseOfferingId, status: { in: ['REGISTERED', 'COMPLETED'] } }, select: { studentId: true } });
    if (registered.length > venue.capacity) throw new ConflictException({ code: 'VENUE_CAPACITY_EXCEEDED', message: `Venue capacity (${venue.capacity}) is below the ${registered.length} registered candidates.` });
    const otherExams = await this.prisma.examTimetable.findMany({ where: { semesterId: current.semesterId, examDate, NOT: { id } }, select: { courseOfferingId: true, startTime: true, durationMinutes: true } });
    const registeredIds = new Set(registered.map((row) => row.studentId));
    for (const other of otherExams) {
      const otherStart = this.toMinutes(other.startTime);
      if (newStart < otherStart + other.durationMinutes && newEnd > otherStart) {
        const otherRegistrations = await this.prisma.courseRegistration.findMany({ where: { courseOfferingId: other.courseOfferingId, status: { in: ['REGISTERED', 'COMPLETED'] } }, select: { studentId: true } });
        if (otherRegistrations.some((row) => registeredIds.has(row.studentId))) throw new ConflictException({ code: 'STUDENT_EXAM_CLASH', message: 'Registered students would have overlapping examinations' });
      }
    }
    const updated = await this.prisma.examTimetable.update({ where: { id }, data: { venueId, venue: dto.venueId ? venue.name : current.venue, examDate, startTime, durationMinutes, ...(dto.invigilatorNotes !== undefined ? { invigilatorNotes: dto.invigilatorNotes } : {}) } });
    await this.audit.log({ action: AuditAction.UPDATE, targetTable: 'exam_timetables', targetId: id, oldValues: { examDate: current.examDate, startTime: current.startTime, venueId: current.venueId }, newValues: { examDate, startTime, venueId } }, actorId);
    return updated;
  }

  async cancelTimetableEntry(id: string, actorId: string, actorRole: AcademicActorRole = 'REGISTRAR') {
    const current = await this.prisma.examTimetable.findUniqueOrThrow({ where: { id }, select: { id: true, courseOfferingId: true, examDate: true, startTime: true } });
    await this.offeringAuthorization.assertOfferingAccess(current.courseOfferingId, actorId, actorRole);
    const [candidateCount, attendanceCount] = await Promise.all([
      this.prisma.examCandidate.count({ where: { examTimetableId: id } }),
      this.prisma.examAttendance.count({ where: { examTimetableId: id } }),
    ]);
    if (candidateCount > 0 || attendanceCount > 0) throw new ConflictException({ code: 'EXAM_HAS_OPERATIONAL_RECORDS', message: 'An examination with generated candidates or attendance records cannot be cancelled.' });
    const deleted = await this.prisma.examTimetable.delete({ where: { id } });
    await this.audit.log({ action: AuditAction.DELETE, targetTable: 'exam_timetables', targetId: id, oldValues: current }, actorId);
    return deleted;
  }

  async getTimetable(semesterId: string) {
    return this.prisma.examTimetable.findMany({
      where:   { semesterId },
      include: { courseOffering: { include: { course: { select: { code: true, title: true } } } } },
      orderBy: [{ examDate: 'asc' }, { startTime: 'asc' }],
    });
  }

  async generateCandidates(examTimetableId: string, actorId: string, actorRole: AcademicActorRole = 'REGISTRAR') {
    const exam=await this.prisma.examTimetable.findUniqueOrThrow({where:{id:examTimetableId}});
    await this.offeringAuthorization.assertOfferingAccess(exam.courseOfferingId, actorId, actorRole, examTimetableId);
    const regs=await this.prisma.courseRegistration.findMany({where:{courseOfferingId:exam.courseOfferingId,status:{in:['REGISTERED','COMPLETED']}},select:{studentId:true}});
    await this.prisma.examCandidate.deleteMany({where:{examTimetableId}});
    const candidates=await this.prisma.examCandidate.createMany({data:regs.map(r=>({examTimetableId,studentId:r.studentId,eligibility:'ELIGIBLE',reason:'Registered for the course offering.'}))});
    await this.audit.log({action:AuditAction.CREATE,targetTable:'exam_candidates',targetId:examTimetableId,newValues:{count:candidates.count}},actorId);
    return {examTimetableId,count:candidates.count};
  }

  async getCandidates(examTimetableId:string, requestingUser:{sub:string;role:string}){
    const where:any={examTimetableId};
    if (requestingUser.role !== 'STUDENT') {
      const exam = await this.prisma.examTimetable.findUniqueOrThrow({ where: { id: examTimetableId }, select: { courseOfferingId: true } });
      await this.offeringAuthorization.assertOfferingAccess(exam.courseOfferingId, requestingUser.sub, requestingUser.role);
    }
    if(requestingUser.role==='STUDENT'){
      const student=await this.prisma.student.findUniqueOrThrow({where:{userId:requestingUser.sub},select:{id:true}});
      where.studentId=student.id;
    }
    return this.prisma.examCandidate.findMany({
      where,
      orderBy: { studentId: 'asc' },
      include: { student: { select: { matricNo: true, firstName: true, lastName: true } } },
    });
  }

  async recordExamAttendance(examTimetableId:string,studentId:string,status:string,recordedByUserId:string,incidentNote?:string,actorRole: AcademicActorRole = 'STAFF'){
    const exam = await this.prisma.examTimetable.findUniqueOrThrow({ where: { id: examTimetableId }, select: { courseOfferingId: true } });
    await this.offeringAuthorization.assertOfferingAccess(exam.courseOfferingId, recordedByUserId, actorRole, examTimetableId);
    const candidate=await this.prisma.examCandidate.findUnique({where:{uq_exam_candidate:{examTimetableId,studentId}}});
    if(!candidate||candidate.eligibility!=='ELIGIBLE') throw new BadRequestException('Student is not an eligible candidate for this examination');
    await this.prisma.user.findUniqueOrThrow({where:{id:recordedByUserId}});
    return this.prisma.examAttendance.upsert({
      where:{uq_exam_attendance:{examTimetableId,studentId}},
      create:{examTimetableId,studentId,status,recordedById:recordedByUserId,checkedInAt:status==='PRESENT'?new Date():null,incidentNote},
      update:{status,recordedById:recordedByUserId,incidentNote,checkedInAt:status==='PRESENT'?new Date():undefined},
    });
  }

  async bulkRecordExamAttendance(examTimetableId: string, records: Array<{ studentId: string; status: string; incidentNote?: string }>, recordedByUserId: string, actorRole: AcademicActorRole = 'STAFF') {
    const exam = await this.prisma.examTimetable.findUniqueOrThrow({ where: { id: examTimetableId }, select: { courseOfferingId: true } });
    await this.offeringAuthorization.assertOfferingAccess(exam.courseOfferingId, recordedByUserId, actorRole, examTimetableId);
    const results: unknown[] = [];
    const errors: string[] = [];
    await this.prisma.user.findUniqueOrThrow({ where: { id: recordedByUserId } });
    const studentIds = [...new Set(records.map((record) => record.studentId))];
    const candidates = await this.prisma.examCandidate.findMany({ where: { examTimetableId, studentId: { in: studentIds } }, select: { studentId: true, eligibility: true } });
    const eligible = new Set(candidates.filter((candidate) => candidate.eligibility === 'ELIGIBLE').map((candidate) => candidate.studentId));
    for (const record of records) {
      if (!eligible.has(record.studentId)) {
        errors.push(`${record.studentId}: Student is not an eligible candidate for this examination`);
        continue;
      }
      try {
        const attendance = await this.prisma.examAttendance.upsert({
          where: { uq_exam_attendance: { examTimetableId, studentId: record.studentId } },
          create: { examTimetableId, studentId: record.studentId, status: record.status, recordedById: recordedByUserId, checkedInAt: record.status === 'PRESENT' ? new Date() : null, incidentNote: record.incidentNote },
          update: { status: record.status, recordedById: recordedByUserId, incidentNote: record.incidentNote, checkedInAt: record.status === 'PRESENT' ? new Date() : undefined },
        });
        results.push(attendance);
      } catch (error) { errors.push(`${record.studentId}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    return { recorded: results.length, failed: errors.length, errors };
  }

  async recordExamMark(examTimetableId: string, dto: RecordExamMarkDto, actorId: string, actorRole: AcademicActorRole = 'STAFF') {
    const exam = await this.prisma.examTimetable.findUniqueOrThrow({ where: { id: examTimetableId }, select: { courseOfferingId: true } });
    await this.offeringAuthorization.assertOfferingAccess(exam.courseOfferingId, actorId, actorRole, examTimetableId);
    const candidate = await this.prisma.examCandidate.findUnique({ where: { uq_exam_candidate: { examTimetableId, studentId: dto.studentId } }, select: { eligibility: true } });
    if (!candidate || candidate.eligibility !== 'ELIGIBLE') throw new BadRequestException('Student is not an eligible candidate for this examination');
    const attendance = await this.prisma.examAttendance.findUnique({ where: { uq_exam_attendance: { examTimetableId, studentId: dto.studentId } }, select: { status: true } });
    if (!attendance || !['PRESENT', 'LATE'].includes(attendance.status)) throw new BadRequestException('Exam marks require a PRESENT or LATE attendance record');
    const component = await this.prisma.assessmentComponent.findUniqueOrThrow({ where: { id: dto.componentId }, include: { scheme: true } });
    if (component.scheme.courseOfferingId !== exam.courseOfferingId) throw new BadRequestException('Exam component does not belong to this course offering');
    if (component.category !== 'EXAM') throw new BadRequestException('Exam marks must target an EXAM assessment component');
    if (component.scheme.status !== 'ACTIVE') throw new ConflictException('Assessment scheme is not active');
    if (dto.score > Number(component.maxScore)) throw new BadRequestException(`Score cannot exceed ${component.maxScore}`);
    const existing = await this.prisma.assessmentMark.findUnique({ where: { uq_assessment_mark_student_component: { studentId: dto.studentId, componentId: dto.componentId } }, select: { status: true } });
    if (existing?.status === 'FINALIZED') throw new ConflictException('Finalized exam marks require a controlled amendment workflow.');
    return this.prisma.assessmentMark.upsert({
      where: { uq_assessment_mark_student_component: { studentId: dto.studentId, componentId: dto.componentId } },
      create: { studentId: dto.studentId, courseOfferingId: exam.courseOfferingId, componentId: dto.componentId, examTimetableId, score: dto.score, enteredById: actorId },
      update: { score: dto.score, enteredById: actorId, examTimetableId, version: { increment: 1 } },
    });
  }

  async getExamReport(examTimetableId:string, actorId?: string, actorRole: AcademicActorRole = 'STAFF'){
    const examScope = await this.prisma.examTimetable.findUniqueOrThrow({ where: { id: examTimetableId }, select: { courseOfferingId: true } });
    if (actorId) await this.offeringAuthorization.assertOfferingAccess(examScope.courseOfferingId, actorId, actorRole, examTimetableId);
    const [exam,candidates,attendance]=await Promise.all([this.prisma.examTimetable.findUniqueOrThrow({where:{id:examTimetableId}}),this.prisma.examCandidate.findMany({where:{examTimetableId}}),this.prisma.examAttendance.findMany({where:{examTimetableId}})]);
    const byStatus = attendance.reduce<Record<string, number>>((counts, record) => {
      counts[record.status] = (counts[record.status] ?? 0) + 1;
      return counts;
    }, {});
    const eligible = candidates.filter((candidate) => candidate.eligibility === 'ELIGIBLE');
    // Attendance is a participation measure, not merely the presence of an
    // attendance row. ABSENT and NO_SHOW are recorded outcomes and must not
    // inflate the percentage or hide eligible candidates who did not attend.
    const present = attendance.filter((record) => ['PRESENT', 'LATE'].includes(record.status)).length;
    const missing = Math.max(eligible.length - present, 0);
    const attendancePct = eligible.length ? Math.round((present / eligible.length) * 100) : 0;
    return {
      exam,
      candidates: { total: candidates.length, eligible: eligible.length },
      attendance: { total: attendance.length, byStatus, present, missing, attendancePct },
    };
  }

  // ── Attendance ─────────────────────────────────────────────────────────────
  async recordAttendance(dto: RecordAttendanceDto, recordedByUserId: string, actorRole: AcademicActorRole = 'STAFF') {
    await this.offeringAuthorization.assertOfferingAccess(dto.courseOfferingId, recordedByUserId, actorRole);
    const [offering, registration] = await Promise.all([
      this.prisma.courseOffering.findUniqueOrThrow({where:{id:dto.courseOfferingId},select:{semesterId:true}}),
      this.prisma.courseRegistration.findUnique({where:{uq_course_registration:{studentId:dto.studentId,courseOfferingId:dto.courseOfferingId}}}),
    ]);
    if(!registration||registration.status==='DROPPED') throw new BadRequestException('Attendance can only be recorded for a valid course registration');
    if(offering.semesterId!==dto.semesterId) throw new BadRequestException('Attendance semester does not match the course offering semester');
    await this.prisma.user.findUniqueOrThrow({where:{id:recordedByUserId}});
    const date=new Date(dto.date);
    if(Number.isNaN(date.getTime())) throw new BadRequestException('Invalid attendance date');
    const semester=await this.prisma.semester.findUniqueOrThrow({where:{id:dto.semesterId}});
    if(date<semester.classStartDate||date>semester.classEndDate) throw new BadRequestException('Attendance date must fall within the semester teaching period');
    return this.prisma.attendanceRecord.upsert({
      where:{uq_attendance_record:{studentId:dto.studentId,courseOfferingId:dto.courseOfferingId,date}},
      create:{studentId:dto.studentId,courseOfferingId:dto.courseOfferingId,semesterId:dto.semesterId,date,present:dto.present,remark:dto.remark??null,recordedById:recordedByUserId},
      update:{present:dto.present,remark:dto.remark??null,recordedById:recordedByUserId},
    });
  }

  async bulkRecordAttendance(dto: BulkAttendanceDto, recordedById: string, actorRole: AcademicActorRole = 'STAFF') {
    const results = [], errors: string[] = [];
    for (const r of dto.records) {
      try { results.push(await this.recordAttendance(r, recordedById, actorRole)); }
      catch (err) { errors.push(`${r.studentId}/${r.date}: ${err instanceof Error ? err.message : String(err)}`); }
    }
    return { recorded: results.length, failed: errors.length, errors };
  }

  async getAttendanceSummary(studentId: string, courseOfferingId: string) {
    const records = await this.prisma.attendanceRecord.findMany({
      where: { studentId, courseOfferingId }, orderBy: { date: 'asc' },
    });
    const total = records.length, present = records.filter((r) => r.present).length;
    return { total, present, absent: total - present, attendancePct: total > 0 ? Math.round((present / total) * 100) : 0, records };
  }

  async getCourseAttendance(courseOfferingId: string, date?: string) {
    return this.prisma.attendanceRecord.findMany({
      where: { courseOfferingId, ...(date ? { date: new Date(date) } : {}) },
      include: { student: { select: { matricNo: true, firstName: true, lastName: true } } },
      orderBy: { date: 'asc' },
    });
  }

  private toMinutes(time: string): number {
    const [h = '0', m = '0'] = time.split(':');
    return parseInt(h) * 60 + parseInt(m);
  }
}
