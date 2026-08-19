import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { computeGradeForSystem } from '@uniportal/utils';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AcademicOfferingAuthorizationService, AcademicActorRole } from '../../common/authorization/academic-offering-authorization.service';
import { AuthorizationService } from '../../common/authorization/authorization.service';
import type { ComponentDto, CreateSchemeDto, MarkDto, CsvUploadDto } from './dto';

@Injectable()
export class AssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly offeringAuthorization: AcademicOfferingAuthorizationService,
    private readonly authorization: AuthorizationService,
  ) {}

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
    const scheme = await this.prisma.assessmentScheme.findFirst({ where: { courseOfferingId, status: 'ACTIVE' }, orderBy: { version: 'desc' }, include: { components: { orderBy: { sequence: 'asc' } } } });
    if (!scheme) throw new BadRequestException('No active assessment scheme');
    const registrations = await this.prisma.courseRegistration.findMany({ where: { courseOfferingId, status: { in: ['REGISTERED','COMPLETED'] } }, include: { student: { select: { id:true, matricNo:true, firstName:true, lastName:true } } }, orderBy: { student: { matricNo: 'asc' } } });
    const marks = await this.prisma.assessmentMark.findMany({ where: { courseOfferingId }, select: { studentId:true, componentId:true, score:true, status:true, version:true, examTimetableId:true, enteredById:true } });
    const byStudent = new Map<string, any[]>(); for (const m of marks) { if (!byStudent.has(m.studentId)) byStudent.set(m.studentId,[]); byStudent.get(m.studentId)!.push(m); }
    const rows = registrations.map(r => { const ms = byStudent.get(r.student.id) ?? []; let final=0; for (const c of scheme.components) { const m=ms.find(x=>x.componentId===c.id); if(m) final += (Number(m.score)/Number(c.maxScore))*Number(c.weight); } const required = scheme.components.filter(c => c.isRequired); const complete=required.every(c=>ms.some(m=>m.componentId===c.id)); const finalized = complete && required.every(c=>ms.some(m=>m.componentId===c.id && m.status === 'FINALIZED')); return { student:r.student, marks:ms, finalScore:Math.round(final*100)/100, complete, finalized }; });
    return { scheme, rows, summary: { total: rows.length, complete: rows.filter(r=>r.complete).length, incomplete: rows.filter(r=>!r.complete).length, finalized: rows.filter(r=>r.finalized).length, unfinalized: rows.filter(r=>!r.finalized).length } };
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
    const lines=dto.csv.split(/\r?\n/).map(x=>x.trim()).filter(Boolean); if(lines.length<2) throw new BadRequestException('CSV must contain a header and at least one data row');
    const headers=lines[0]!.split(',').map(x=>x.trim().replace(/^"|"$/g,'')); const idx=(name:string)=>headers.findIndex(h=>h.toLowerCase()===name.toLowerCase()); const studentIdx=idx('Student ID'); if(studentIdx<0) throw new BadRequestException('CSV must contain Student ID');
    const scheme=await this.prisma.assessmentScheme.findFirst({where:{courseOfferingId:dto.courseOfferingId,status:'ACTIVE'},orderBy:{version:'desc'},include:{components:true}}); if(!scheme) throw new BadRequestException('No active assessment scheme');
    const errors:any[]=[]; let valid=0; for(let i=1;i<lines.length;i++){ const cols=lines[i]!.split(',').map(x=>x.trim().replace(/^"|"$/g,'')); const studentId=cols[studentIdx]; if(!studentId){errors.push({row:i+1,error:'Missing Student ID'});continue;} for(const c of scheme.components){ const ci=idx(c.code); if(ci<0) continue; const raw=cols[ci]; if(raw==='') { if(c.isRequired) errors.push({row:i+1,studentId,error:`Missing ${c.code}`}); continue; } const score=Number(raw); if(!Number.isFinite(score)||score<0||score>Number(c.maxScore)){errors.push({row:i+1,studentId,error:`${c.code} must be between 0 and ${c.maxScore}`}); continue;} valid++; } }
    const batch=await this.prisma.gradeUploadBatch.create({data:{courseOfferingId:dto.courseOfferingId,semesterId:dto.semesterId,uploadedById:actorId,fileName:dto.fileName??'grade-upload.csv',templateVersion:'v1',mode:'VALIDATE_ONLY',status:errors.length?'REJECTED':'VALIDATED',totalRows:lines.length-1,validRows:valid,errorRows:errors.length,errorReport:errors}});
    return { batchId:batch.id,status:batch.status,totalRows:batch.totalRows,validRows:valid,errorRows:errors.length,errors };
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
