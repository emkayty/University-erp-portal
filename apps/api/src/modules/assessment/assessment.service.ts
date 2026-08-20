import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { computeGradeForSystem } from '@uniportal/utils';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AcademicOfferingAuthorizationService, AcademicActorRole } from '../../common/authorization/academic-offering-authorization.service';
import { AuthorizationService } from '../../common/authorization/authorization.service';
import { GradeUploadMode } from './dto';
import type { ComponentDto, CreateSchemeDto, MarkDto, CsvUploadDto } from './dto';


function parseCsvRecords(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index]!;
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(field.trim());
      field = '';
    } else if (character === '\n') {
      row.push(field.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else if (character !== '\r') {
      field += character;
    }
  }
  row.push(field.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

@Injectable()
export class AssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly offeringAuthorization: AcademicOfferingAuthorizationService,
    private readonly authorization: AuthorizationService,
  ) {}

  async findAccessibleOfferings(actorId: string, actorRole: AcademicActorRole = 'STAFF') {
    const where: Prisma.CourseOfferingWhereInput = { isActive: true };
    if (actorRole === 'STAFF') where.lecturer = { userId: actorId };
    else if (actorRole === 'HOD') where.course = { department: { hod: { userId: actorId } } };
    else if (actorRole === 'DEAN') where.course = { department: { faculty: { dean: { userId: actorId } } } };
    else if (!['REGISTRAR', 'SUPER_ADMIN', 'VC'].includes(actorRole)) return [];
    return this.prisma.courseOffering.findMany({
      where,
      select: {
        id: true,
        sectionCode: true,
        semesterId: true,
        course: { select: { code: true, title: true } },
        semesterModel: { select: { name: true, academicYear: true, semesterNumber: true } },
        lecturer: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ semesterModel: { academicYear: 'desc' } }, { course: { code: 'asc' } }, { sectionCode: 'asc' }],
    });
  }

  async createScheme(dto: CreateSchemeDto, actorId: string, actorRole: AcademicActorRole = 'STAFF') {
    await this.offeringAuthorization.assertOfferingAccess(dto.courseOfferingId, actorId, actorRole);
    const offering = await this.prisma.courseOffering.findUnique({ where: { id: dto.courseOfferingId }, select: { id: true, semesterId: true } });
    if (!offering?.semesterId) throw new BadRequestException('Course offering must be linked to a semester');
    const version = dto.version ?? 1;
    const scheme = await this.prisma.assessmentScheme.create({ data: { courseOfferingId: dto.courseOfferingId, name: dto.name, version, createdById: actorId } });
    await this.audit.log({ action: AuditAction.CREATE, targetTable: 'assessment_schemes', targetId: scheme.id, newValues: { courseOfferingId: dto.courseOfferingId, version } }, actorId);
    return scheme;
  }

  async setComponents(schemeId: string, components: ComponentDto[], actorId: string, actorRole: AcademicActorRole = 'STAFF') {
    const schemeScope = await this.prisma.assessmentScheme.findUnique({ where: { id: schemeId }, select: { courseOfferingId: true } });
    if (!schemeScope) throw new BadRequestException('Assessment scheme was not found');
    await this.offeringAuthorization.assertOfferingAccess(schemeScope.courseOfferingId, actorId, actorRole);
    const total = components.reduce((n, c) => n + c.weight, 0);
    if (Math.abs(total - 100) > 0.001) throw new BadRequestException(`Assessment component weights must total 100%; received ${total}`);
    if (components.some(c => c.maxScore <= 0)) throw new BadRequestException('Every assessment component must have a positive maximum score');
    return this.prisma.$transaction(async tx => {
      const scheme = await tx.assessmentScheme.findUniqueOrThrow({ where: { id: schemeId } });
      if (scheme.status !== 'DRAFT') throw new ConflictException('Only draft assessment schemes can be configured');
      await tx.assessmentComponent.deleteMany({ where: { schemeId } });
      const rows = await Promise.all(components.map((c, i) => tx.assessmentComponent.create({ data: { schemeId, name: c.name, code: c.code, category: c.category, maxScore: c.maxScore, weight: c.weight, sequence: c.sequence ?? i + 1, isRequired: c.isRequired ?? true } })));
      await tx.auditLog.create({ data: { action: AuditAction.UPDATE, targetTable: 'assessment_schemes', targetId: schemeId, newValues: { componentCount: rows.length, totalWeight: total }, actorId } });
      return { schemeId, totalWeight: total, components: rows };
    });
  }

  async finalizeScheme(courseOfferingId: string, actorId: string, actorRole: AcademicActorRole = 'STAFF') {
    await this.offeringAuthorization.assertOfferingAccess(courseOfferingId, actorId, actorRole);
    const scheme = await this.prisma.assessmentScheme.findFirst({ where: { courseOfferingId, status: 'DRAFT' }, orderBy: { version: 'desc' }, include: { components: true } });
    if (!scheme) throw new BadRequestException('No draft assessment scheme exists');
    await this.authorization.assertIndependentApproval(scheme.createdById, actorId, 'assessment scheme');
    const total = scheme.components.reduce((n,c)=>n+Number(c.weight),0);
    if (Math.abs(total-100)>0.001 || !scheme.components.length) throw new BadRequestException('Assessment scheme must contain components totalling exactly 100%');
    return this.prisma.assessmentScheme.update({ where: { id: scheme.id }, data: { status: 'ACTIVE', approvedById: actorId, approvedAt: new Date(), effectiveFrom: new Date() }, include: { components: true } });
  }

  async saveMark(dto: MarkDto, actorId: string, actorRole: AcademicActorRole = 'STAFF') {
    await this.offeringAuthorization.assertOfferingAccess(dto.courseOfferingId, actorId, actorRole);
    const component = await this.prisma.assessmentComponent.findUniqueOrThrow({ where: { id: dto.componentId }, include: { scheme: true } });
    if (component.scheme.courseOfferingId !== dto.courseOfferingId) throw new BadRequestException('Assessment component does not belong to this course offering');
    if (component.scheme.status !== 'ACTIVE') throw new ConflictException('Assessment scheme is not active');
    if (dto.score > Number(component.maxScore)) throw new BadRequestException(`Score cannot exceed ${component.maxScore}`);
    const registration = await this.prisma.courseRegistration.findFirst({ where: { studentId: dto.studentId, courseOfferingId: dto.courseOfferingId, status: { in: ['REGISTERED','COMPLETED'] } }, select: { id: true } });
    if (!registration) throw new BadRequestException('Student is not registered for this course offering');
    const existing = await this.prisma.assessmentMark.findUnique({ where: { uq_assessment_mark_student_component: { studentId: dto.studentId, componentId: dto.componentId } }, select: { status: true } });
    if (existing?.status === 'FINALIZED') throw new ConflictException('Finalized assessment marks require a controlled amendment workflow.');
    return this.prisma.assessmentMark.upsert({ where: { uq_assessment_mark_student_component: { studentId: dto.studentId, componentId: dto.componentId } }, create: { studentId: dto.studentId, courseOfferingId: dto.courseOfferingId, componentId: dto.componentId, score: dto.score, enteredById: actorId }, update: { score: dto.score, enteredById: actorId, version: { increment: 1 } } });
  }

  async getGradebook(courseOfferingId: string, actorId?: string, actorRole: AcademicActorRole = 'STAFF') {
    if (actorId) await this.offeringAuthorization.assertOfferingAccess(courseOfferingId, actorId, actorRole);
    const offering = await this.prisma.courseOffering.findUnique({
      where: { id: courseOfferingId },
      select: { id: true, semesterId: true, course: { select: { code: true, title: true } }, semesterModel: { select: { name: true } } },
    });
    if (!offering) throw new BadRequestException('Course offering was not found');
    const scheme = await this.prisma.assessmentScheme.findFirst({
      where: { courseOfferingId, status: 'ACTIVE' },
      orderBy: { version: 'desc' },
      include: { components: { orderBy: { sequence: 'asc' } } },
    });
    if (!scheme) throw new BadRequestException('No active assessment scheme');
    const registrations = await this.prisma.courseRegistration.findMany({
      where: { courseOfferingId, status: { in: ['REGISTERED', 'COMPLETED'] } },
      include: { student: { select: { id: true, matricNo: true, firstName: true, lastName: true } } },
      orderBy: { student: { matricNo: 'asc' } },
    });
    const marks = await this.prisma.assessmentMark.findMany({
      where: { courseOfferingId },
      select: { studentId: true, componentId: true, score: true, status: true, version: true, examTimetableId: true, enteredById: true },
    });
    const byStudent = new Map<string, Map<string, (typeof marks)[number]>>();
    for (const mark of marks) {
      if (!byStudent.has(mark.studentId)) byStudent.set(mark.studentId, new Map());
      byStudent.get(mark.studentId)!.set(mark.componentId, mark);
    }
    const rows = registrations.map((registration) => {
      const markMap = byStudent.get(registration.student.id) ?? new Map();
      const studentMarks = [...markMap.values()];
      let finalScore = 0;
      for (const component of scheme.components) {
        const mark = markMap.get(component.id);
        if (mark) finalScore += (Number(mark.score) / Number(component.maxScore)) * Number(component.weight);
      }
      const required = scheme.components.filter((component) => component.isRequired);
      const complete = required.every((component) => markMap.has(component.id));
      const finalized = complete && required.every((component) => markMap.get(component.id)?.status === 'FINALIZED');
      return { student: registration.student, marks: studentMarks, finalScore: Math.round(finalScore * 100) / 100, complete, finalized };
    });
    return {
      offering,
      scheme,
      rows,
      summary: {
        total: rows.length,
        complete: rows.filter((row) => row.complete).length,
        incomplete: rows.filter((row) => !row.complete).length,
        finalized: rows.filter((row) => row.finalized).length,
        unfinalized: rows.filter((row) => !row.finalized).length,
      },
    };
  }

  async exportGradebook(courseOfferingId: string, actorId?: string, actorRole: AcademicActorRole = 'STAFF') {
    const gb = await this.getGradebook(courseOfferingId, actorId, actorRole); const headers=['Student ID','Matric No','Name',...gb.scheme.components.map(c=>c.code),'Final Score','Grade','Grade Point'];
    const settings=await this.prisma.institutionSettings.findFirst({select:{gradingSystem:true}}); const system=(settings?.gradingSystem??'NIGERIAN_5_POINT') as any;
    const lines=[headers.join(',')]; for(const r of gb.rows){ const vals=gb.scheme.components.map(c=>{const m=r.marks.find(x=>x.componentId===c.id); return m?.score??''}); const gr=r.complete?computeGradeForSystem(r.finalScore,system):{grade:'',gradePoint:''}; lines.push([r.student.id,r.student.matricNo,`${r.student.firstName} ${r.student.lastName}`,...vals,r.finalScore,gr.grade,gr.gradePoint].map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')); }
    return lines.join('\n');
  }

  async generateDraftResults(courseOfferingId: string, actorId: string, actorRole: AcademicActorRole = 'STAFF') {
    const gb=await this.getGradebook(courseOfferingId, actorId, actorRole);
    const selfEnteredBy = gb.rows.flatMap((row) => row.marks as Array<{ enteredById?: string }>).find((mark) => mark.enteredById === actorId)?.enteredById;
    if (selfEnteredBy) {
      await this.authorization.assertIndependentApproval(selfEnteredBy, actorId, 'assessment marks');
    }
    if(gb.summary.incomplete) throw new BadRequestException(`${gb.summary.incomplete} student(s) have incomplete assessment marks`);
    if(gb.summary.unfinalized) throw new ConflictException(`${gb.summary.unfinalized} student(s) have unfinalized assessment marks`);
    const settings=await this.prisma.institutionSettings.findFirst({select:{gradingSystem:true,gradePolicyVersion:true}});
    const system=(settings?.gradingSystem??'NIGERIAN_5_POINT') as any;
    const offering=await this.prisma.courseOffering.findUniqueOrThrow({where:{id:courseOfferingId},include:{course:{select:{creditUnits:true,code:true}},semesterModel:{select:{id:true}}}});
    if(!offering.semesterId) throw new BadRequestException('Course offering is not linked to a semester');
    const studentIds = gb.rows.map(row => row.student.id);
    const absentAttendance = studentIds.length === 0 ? [] : await this.prisma.examAttendance.findMany({
      where: {
        studentId: { in: studentIds },
        examTimetable: { courseOfferingId },
        status: { in: ['ABSENT', 'NO_SHOW'] },
      },
      select: { studentId: true },
    });
    const absentStudentIds = new Set(absentAttendance.map(record => record.studentId));
    return this.prisma.$transaction(async tx=>{
      const out=[] as any[];
      for(const row of gb.rows){
        const absentFromExam = absentStudentIds.has(row.student.id);
        const effectiveFinalScore = absentFromExam ? 0 : row.finalScore;
        const calc=computeGradeForSystem(effectiveFinalScore,system,absentFromExam);
        const existing=await tx.studentResult.findUnique({where:{uq_student_result:{studentId:row.student.id,courseOfferingId,semesterId:offering.semesterId}}});
        if(existing && !['DRAFT','REJECTED'].includes(existing.status)) continue;
        const prior = existing ? existing.attemptNumber : ((await tx.studentResult.findMany({where:{studentId:row.student.id,courseOffering:{courseId:offering.courseId}},select:{attemptNumber:true},orderBy:{attemptNumber:'desc'},take:1}))[0]?.attemptNumber ?? 0) + 1;
        const assessmentEvidence = {
          capturedAt: new Date().toISOString(),
          schemeId: gb.scheme.id,
          schemeVersion: gb.scheme.version,
          components: gb.scheme.components.map((component) => {
            const mark = row.marks.find((candidate) => candidate.componentId === component.id);
            return { id: component.id, code: component.code, category: component.category, maxScore: Number(component.maxScore), weight: Number(component.weight), isRequired: component.isRequired, score: mark ? Number(mark.score) : null, markVersion: mark?.version ?? null, examTimetableId: mark?.examTimetableId ?? null };
          }),
          sourceFinalScore: row.finalScore,
          finalScore: effectiveFinalScore,
          absentFromExam,
        } satisfies Prisma.InputJsonValue;
        const data={studentId:row.student.id,courseOfferingId,semesterId:offering.semesterId,score:effectiveFinalScore,finalScore:effectiveFinalScore,grade:calc.grade,gradePoint:calc.gradePoint,creditUnits:offering.course.creditUnits,gradingSystemSnapshot:system,gradingPolicyVersion:settings?.gradePolicyVersion??1,assessmentEvidence,attemptNumber:prior,absentFromExam,status:'DRAFT' as const,submittedById:actorId,approvedByHodId:null,hodApprovedAt:null,approvedByDeanId:null,deanApprovedAt:null,senatePendingAt:null,senatePublishedAt:null,rejectionReason:null};
        const r=existing?await tx.studentResult.update({where:{id:existing.id},data}):await tx.studentResult.create({data}); out.push(r);
      }
      return {generated:out.length,skipped:gb.rows.length-out.length,gradingSystem:system};
    });
  }

  async getTemplate(courseOfferingId:string, actorId?: string, actorRole: AcademicActorRole = 'STAFF'){
    if (actorId) await this.offeringAuthorization.assertOfferingAccess(courseOfferingId, actorId, actorRole);
    const scheme=await this.prisma.assessmentScheme.findFirst({where:{courseOfferingId,status:'ACTIVE'},orderBy:{version:'desc'},include:{components:true}}); if(!scheme) throw new BadRequestException('No active assessment scheme');
    return ['Student ID','Matric No',...scheme.components.sort((a,b)=>a.sequence-b.sequence).map(c=>c.code)].join(',')+'\n';
  }

  async uploadCsv(dto: CsvUploadDto, actorId: string, actorRole: AcademicActorRole = 'STAFF') {
    await this.offeringAuthorization.assertOfferingAccess(dto.courseOfferingId, actorId, actorRole);
    const mode = dto.mode ?? GradeUploadMode.VALIDATE_ONLY;
    const offering = await this.prisma.courseOffering.findUnique({ where: { id: dto.courseOfferingId }, select: { id: true, semesterId: true } });
    if (!offering) throw new BadRequestException('Course offering was not found');
    if (!offering.semesterId || offering.semesterId !== dto.semesterId) throw new BadRequestException('Semester does not match the course offering');
    const scheme = await this.prisma.assessmentScheme.findFirst({
      where: { courseOfferingId: dto.courseOfferingId, status: 'ACTIVE' },
      orderBy: { version: 'desc' },
      include: { components: { orderBy: { sequence: 'asc' } } },
    });
    if (!scheme) throw new BadRequestException('No active assessment scheme');
    const records = parseCsvRecords(dto.csv);
    if (records.length < 2) throw new BadRequestException('CSV must contain a header and at least one data row');
    const headers = records[0]!.map((header) => header.replace(/^\uFEFF/, '').trim());
    const headerIndexes = new Map(headers.map((header, index) => [header.toLowerCase(), index]));
    const studentIdIndex = headerIndexes.get('student id');
    const matricNoIndex = headerIndexes.get('matric no');
    if (studentIdIndex === undefined && matricNoIndex === undefined) throw new BadRequestException('CSV must contain Student ID or Matric No');
    const componentIndexes = new Map<string, number>();
    const missingComponents: string[] = [];
    for (const component of scheme.components) {
      const index = headerIndexes.get(component.code.toLowerCase());
      if (index === undefined) missingComponents.push(component.code);
      else componentIndexes.set(component.id, index);
    }
    if (missingComponents.length) throw new BadRequestException(`CSV is missing component columns: ${missingComponents.join(', ')}`);
    const registrations = await this.prisma.courseRegistration.findMany({
      where: { courseOfferingId: dto.courseOfferingId, status: { in: ['REGISTERED', 'COMPLETED'] } },
      select: { studentId: true, student: { select: { id: true, matricNo: true } } },
    });
    const byStudentId = new Map(registrations.map((registration) => [registration.student.id, registration.student.id]));
    const byMatricNo = new Map(registrations.map((registration) => [registration.student.matricNo.toLowerCase(), registration.student.id]));
    const errors: Array<{ row: number; studentId?: string; matricNo?: string; error: string }> = [];
    const parsedMarks: Array<{ row: number; studentId: string; componentId: string; score: number }> = [];
    const seenStudents = new Set<string>();
    for (let rowIndex = 1; rowIndex < records.length; rowIndex += 1) {
      const values = records[rowIndex]!;
      const suppliedStudentId = studentIdIndex === undefined ? '' : values[studentIdIndex]?.trim() ?? '';
      const suppliedMatricNo = matricNoIndex === undefined ? '' : values[matricNoIndex]?.trim() ?? '';
      const studentId = suppliedStudentId ? byStudentId.get(suppliedStudentId) : byMatricNo.get(suppliedMatricNo.toLowerCase());
      const matricStudentId = suppliedMatricNo ? byMatricNo.get(suppliedMatricNo.toLowerCase()) : undefined;
      const rowErrors: string[] = [];
      if (!studentId) rowErrors.push('Student is not registered for this course offering');
      if (studentId && suppliedMatricNo && matricStudentId !== studentId) rowErrors.push('Student ID and Matric No do not match');
      if (studentId && seenStudents.has(studentId)) rowErrors.push('Duplicate student row');
      if (studentId) seenStudents.add(studentId);
      for (const component of scheme.components) {
        const raw = values[componentIndexes.get(component.id)!]?.trim() ?? '';
        if (!raw) {
          if (component.isRequired) rowErrors.push(`Missing ${component.code}`);
          continue;
        }
        const score = Number(raw);
        if (!Number.isFinite(score) || score < 0 || score > Number(component.maxScore)) rowErrors.push(`${component.code} must be between 0 and ${component.maxScore}`);
        else if (studentId) parsedMarks.push({ row: rowIndex + 1, studentId, componentId: component.id, score });
      }
      if (rowErrors.length) errors.push({ row: rowIndex + 1, studentId, matricNo: suppliedMatricNo || undefined, error: rowErrors.join('; ') });
    }
    const totalRows = records.length - 1;
    const errorRowNumbers = new Set(errors.map((error) => error.row));
    const validStudentRows = totalRows - errorRowNumbers.size;
    const checksum = createHash('sha256').update(dto.csv, 'utf8').digest('hex');
    const batch = await this.prisma.gradeUploadBatch.create({
      data: {
        courseOfferingId: dto.courseOfferingId,
        semesterId: dto.semesterId,
        uploadedById: actorId,
        fileName: dto.fileName ?? 'grade-upload.csv',
        templateVersion: 'v2',
        mode,
        status: errors.length ? 'REJECTED' : 'VALIDATED',
        totalRows,
        validRows: Math.max(0, validStudentRows),
        errorRows: errors.length,
        checksum,
        errorReport: errors,
      },
    });
    if (errors.length || mode === GradeUploadMode.VALIDATE_ONLY) {
      return { batchId: batch.id, status: batch.status, mode, checksum, totalRows, validRows: Math.max(0, validStudentRows), errorRows: errors.length, appliedMarks: 0, errors };
    }
    const existingMarks = await this.prisma.assessmentMark.findMany({
      where: { courseOfferingId: dto.courseOfferingId, studentId: { in: [...seenStudents] }, componentId: { in: scheme.components.map((component) => component.id) } },
      select: { studentId: true, componentId: true, status: true },
    });
    const finalizedKeys = new Set(existingMarks.filter((mark) => mark.status === 'FINALIZED').map((mark) => `${mark.studentId}:${mark.componentId}`));
    const finalizedErrors = parsedMarks.filter((mark) => finalizedKeys.has(`${mark.studentId}:${mark.componentId}`)).map((mark) => ({ row: mark.row, studentId: mark.studentId, error: 'Finalized marks require a controlled amendment workflow' }));
    if (finalizedErrors.length) {
      await this.prisma.gradeUploadBatch.update({ where: { id: batch.id }, data: { status: 'REJECTED', errorRows: finalizedErrors.length, errorReport: finalizedErrors } });
      return { batchId: batch.id, status: 'REJECTED', mode, checksum, totalRows, validRows: 0, errorRows: finalizedErrors.length, appliedMarks: 0, errors: finalizedErrors };
    }
    await this.prisma.gradeUploadBatch.update({ where: { id: batch.id }, data: { status: 'APPLYING' } });
    try {
      let appliedMarks = 0;
      await this.prisma.$transaction(async (tx) => {
        for (let offset = 0; offset < parsedMarks.length; offset += 50) {
          const chunk = parsedMarks.slice(offset, offset + 50);
          for (const mark of chunk) {
            await tx.assessmentMark.upsert({
              where: { uq_assessment_mark_student_component: { studentId: mark.studentId, componentId: mark.componentId } },
              create: { studentId: mark.studentId, courseOfferingId: dto.courseOfferingId, componentId: mark.componentId, score: mark.score, enteredById: actorId },
              update: { score: mark.score, enteredById: actorId, status: 'DRAFT', finalizedById: null, finalizedAt: null, version: { increment: 1 } },
            });
            appliedMarks += 1;
          }
        }
        await tx.gradeUploadBatch.update({ where: { id: batch.id }, data: { status: 'APPLIED', validRows: validStudentRows, errorRows: 0 } });
        await tx.auditLog.create({ data: { action: AuditAction.UPDATE, targetTable: 'grade_upload_batches', targetId: batch.id, actorId, newValues: { courseOfferingId: dto.courseOfferingId, checksum, appliedMarks, totalRows } } });
      });
      return { batchId: batch.id, status: 'APPLIED', mode, checksum, totalRows, validRows: validStudentRows, errorRows: 0, appliedMarks, errors: [] };
    } catch (error) {
      await this.prisma.gradeUploadBatch.update({ where: { id: batch.id }, data: { status: 'FAILED', errorReport: [{ error: error instanceof Error ? error.message : 'Bulk mark application failed' }] } }).catch(() => undefined);
      throw error;
    }
  }

  async finalizeMarks(courseOfferingId: string, actorId: string, actorRole: AcademicActorRole = 'STAFF') {
    const gradebook = await this.getGradebook(courseOfferingId, actorId, actorRole);
    if (gradebook.summary.incomplete) throw new BadRequestException(`${gradebook.summary.incomplete} student(s) have incomplete assessment marks`);
    const finalizedAt = new Date();
    const result = await this.prisma.assessmentMark.updateMany({
      where: { courseOfferingId, status: 'DRAFT' },
      data: { status: 'FINALIZED', finalizedById: actorId, finalizedAt },
    });
    await this.audit.log({ action: AuditAction.UPDATE, targetTable: 'assessment_marks', targetId: courseOfferingId, newValues: { status: 'FINALIZED', count: result.count } }, actorId);
    return { courseOfferingId, finalized: result.count, finalizedAt };
  }
}
