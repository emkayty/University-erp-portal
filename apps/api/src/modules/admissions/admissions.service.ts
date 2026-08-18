import {
  BadRequestException, ConflictException,
  Injectable, Logger, NotFoundException, ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { AuditAction, ApplicantStatus, AdmissionType, ApplicationStatus, ApplicationPaymentStatus, VerificationStatus, AdmissionDecisionType, AdmissionDecisionReason, ScreeningResult, ApplicationDocumentType, Prisma } from '@prisma/client';

import { buildAdvisoryLockKey, encryptPii } from '@uniportal/utils';

import { AuditService } from '../../common/audit/audit.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { PrismaService } from '../../database/prisma.service';
import { DirectPrismaService } from '../../database/direct-prisma.service';
import { PrivateObjectStorageService } from '../../common/storage/private-object-storage.service';
import { OLevelExamTypeEnum } from './dto/admissions.dto';
import type {
  CreateAdmissionCycleDto, CreateApplicantDto,
  MatriculateApplicantDto, OLevelSubjectResultDto, RecordOLevelResultsDto,
  ScreenApplicantsDto, UpdateApplicantStatusDto, TrackApplicationDto, CreateAdmissionRequirementDto, RegisterApplicationDocumentDto, ApplicantPhotoPresignDto, ApplicantPhotoCompleteDto, OLevelGradeEnum,
} from './dto/admissions.dto';

type EligibilityEvaluationOptions = {
  /** Dry-run callers must not create screening rows or change state. */
  persistScreening?: boolean;
};

type OLevelPolicy = {
  minOLevelCredits?: number | null;
  maxOLevelSittings?: number | null;
  requireEnglish?: boolean | null;
  requireMathematics?: boolean | null;
  subjectRequirements?: Array<{
    subject: string;
    required: boolean;
    alternatives?: unknown;
  }>;
};

// Domain event shapes (documentation of outbox.write() payloads — no
// runtime behavior attached; NotificationsProcessor matches on the string
// event-type name, not these types).
export interface ApplicantRejectedEvent {
  type: 'applicant.rejected';
  applicantId: string;
  email: string;
  reason: string;
}

@Injectable()
export class AdmissionsService {
  private readonly logger = new Logger(AdmissionsService.name);

  constructor(
    private readonly prisma:   PrismaService,
    private readonly direct:   DirectPrismaService,
    private readonly audit:    AuditService,
    private readonly outbox:   OutboxService,
    private readonly storage:  PrivateObjectStorageService,
  ) {}

  // ── Admission Cycles ───────────────────────────────────────────────────────
  async createCycle(dto: CreateAdmissionCycleDto, actorId: string) {
    if (!/^\d{4}\/\d{4}$/.test(dto.academicYear)) {
      throw new BadRequestException('Academic year must be in YYYY/YYYY format');
    }
    const [y1, y2] = dto.academicYear.split('/').map(Number) as [number, number];
    if (y2 !== y1 + 1) throw new BadRequestException('Academic year end must be start + 1');

    const open  = new Date(dto.openDate);
    const close = new Date(dto.closeDate);
    if (close <= open) throw new BadRequestException('Close date must be after open date');

    const cycle = await this.prisma.admissionCycle.create({
      data: {
        academicYear:  dto.academicYear,
        cycleName:     dto.cycleName,
        admissionType: dto.admissionType as AdmissionType,
        openDate:      open,
        closeDate:     close,
        utmeMinScore:  dto.utmeMinScore ?? null,
        maxApplicants: dto.maxApplicants ?? null,
        isActive:      false,
      },
    });
    await this.audit.log({
      action: AuditAction.CREATE, targetTable: 'admission_cycles',
      targetId: cycle.id, newValues: { academicYear: dto.academicYear, admissionType: dto.admissionType },
    }, actorId);
    return cycle;
  }

  async findAllCycles(academicYear?: string) {
    return this.prisma.admissionCycle.findMany({
      where:   academicYear ? { academicYear } : undefined,
      include: { _count: { select: { applicants: true } } },
      orderBy: { openDate: 'desc' },
    });
  }

  async activateCycle(id: string, actorId: string) {
    // Deactivate all cycles of same type first (only one active per type)
    const cycle = await this.prisma.admissionCycle.findUniqueOrThrow({ where: { id } });
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.admissionCycle.updateMany({
        where: { admissionType: cycle.admissionType, isActive: true, id: { not: id } },
        data: { isActive: false },
      });
      return tx.admissionCycle.update({ where: { id }, data: { isActive: true } });
    });
    await this.audit.log({
      action: AuditAction.UPDATE, targetTable: 'admission_cycles', targetId: id,
      newValues: { isActive: true },
    }, actorId);
    return updated;
  }

  async createAdmissionRequirement(dto: CreateAdmissionRequirementDto, actorId: string) {
    const programme = await this.prisma.programme.findUniqueOrThrow({ where: { id: dto.programmeId } });
    const requirement = await this.prisma.admissionRequirement.upsert({
      where: { programmeId_admissionType_academicYear: { programmeId: dto.programmeId, admissionType: dto.admissionType as AdmissionType, academicYear: dto.academicYear } },
      create: { programmeId: programme.id, admissionType: dto.admissionType as AdmissionType, academicYear: dto.academicYear, minUtmeScore: dto.minUtmeScore ?? null, minOLevelCredits: dto.minOLevelCredits ?? 5, maxOLevelSittings: dto.maxOLevelSittings ?? 2, requireEnglish: dto.requireEnglish ?? true, requireMathematics: dto.requireMathematics ?? true, minAge: dto.minAge ?? null, maxAge: dto.maxAge ?? null, requiredDocuments: dto.requiredDocuments ?? undefined, subjectRequirements: { create: (dto.subjectRequirements ?? []).map((r) => ({ subject: r.subject.trim(), required: r.required ?? true, alternatives: r.alternatives ?? undefined })) } },
      update: { minUtmeScore: dto.minUtmeScore ?? null, minOLevelCredits: dto.minOLevelCredits ?? 5, maxOLevelSittings: dto.maxOLevelSittings ?? 2, requireEnglish: dto.requireEnglish ?? true, requireMathematics: dto.requireMathematics ?? true, minAge: dto.minAge ?? null, maxAge: dto.maxAge ?? null, requiredDocuments: dto.requiredDocuments ?? undefined, subjectRequirements: { deleteMany: {}, create: (dto.subjectRequirements ?? []).map((r) => ({ subject: r.subject.trim(), required: r.required ?? true, alternatives: r.alternatives ?? undefined })) } },
      include: { subjectRequirements: true, programme: true },
    });
    await this.audit.log({ action: AuditAction.UPDATE, targetTable: 'admission_requirements', targetId: requirement.id, newValues: { programmeId: dto.programmeId, admissionType: dto.admissionType, academicYear: dto.academicYear } }, actorId);
    return requirement;
  }

  async listAdmissionRequirements(programmeId?: string, academicYear?: string) {
    return this.prisma.admissionRequirement.findMany({ where: { ...(programmeId ? { programmeId } : {}), ...(academicYear ? { academicYear } : {}) }, include: { subjectRequirements: true, programme: { select: { id: true, name: true, code: true } } }, orderBy: [{ academicYear: 'desc' }, { createdAt: 'desc' }] });
  }

  async findPublicCycles() {
    const now = new Date();
    return this.prisma.admissionCycle.findMany({
      where: { isActive: true, openDate: { lte: now }, closeDate: { gte: now } },
      select: { id: true, academicYear: true, cycleName: true, admissionType: true, openDate: true, closeDate: true, utmeMinScore: true },
      orderBy: { openDate: 'desc' },
    });
  }

  async findPublicProgrammes() {
    return this.prisma.programme.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true, degreeType: true, durationYears: true, department: { select: { name: true, faculty: { select: { name: true } } } } },
      orderBy: [{ name: 'asc' }],
    });
  }
  async trackPublicApplication(dto: TrackApplicationDto) {
    const applicant = await this.prisma.applicant.findFirst({
      where: { applicationNo: dto.applicationNo.trim(), deletedAt: null },
      select: { applicationNo: true, email: true, status: true, offerDate: true, offerDeadline: true, acceptanceDate: true, rejectionDate: true, rejectionReason: true, createdAt: true, application: { select: { status: true, completionPercent: true, submittedAt: true } } },
    });
    const valid = applicant ? this.isTrackingTokenValid(applicant.applicationNo, applicant.email, dto.trackingToken.trim()) : false;
    if (!applicant || !valid) throw new NotFoundException('Application not found or tracking credential is invalid.');
    return { applicationNo: applicant.applicationNo, status: applicant.status, applicationStatus: applicant.application?.status ?? null, completionPercent: applicant.application?.completionPercent ?? 0, submittedAt: applicant.application?.submittedAt ?? applicant.createdAt, offerDate: applicant.offerDate, offerDeadline: applicant.offerDeadline, acceptanceDate: applicant.acceptanceDate, rejectionDate: applicant.status === ApplicantStatus.REJECTED ? applicant.rejectionDate : null, rejectionReason: applicant.status === ApplicantStatus.REJECTED ? applicant.rejectionReason : null };
  }

  // ── Reference data (public, read-only) ─────────────────────────────────────
  async listReferenceCountries() {
    return this.prisma.country.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, iso2: true, iso3: true, name: true, officialName: true, nationalityName: true } });
  }

  async listReferenceDivisions(countryId: string, parentId?: string) {
    const country = await this.prisma.country.findUnique({ where: { id: countryId }, select: { id: true } });
    if (!country) throw new NotFoundException('Country not found.');
    return this.prisma.administrativeDivision.findMany({ where: { countryId, parentId: parentId ?? null, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, parentId: true, code: true, name: true, type: true, level: true } });
  }

  async listReferenceExamAuthorities() {
    return this.prisma.examinationAuthority.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, code: true, name: true, countryId: true } });
  }

  async listReferenceExamTypes(authorityId: string) {
    return this.prisma.examinationType.findMany({ where: { authorityId, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, authorityId: true, code: true, name: true, candidateLabel: true } });
  }

  async listReferenceSubjects() {
    return this.prisma.academicSubject.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, code: true, name: true, category: true } });
  }

  private async validateOriginLocation(dto: CreateApplicantDto) {
    if (!dto.countryOfOriginId) return null;
    const country = await this.prisma.country.findUnique({ where: { id: dto.countryOfOriginId }, select: { id: true, iso2: true, name: true } });
    if (!country) throw new BadRequestException('Selected country of origin is invalid.');
    let state: { id: string; countryId: string; name: string; level: number } | null = null;
    let lga: { id: string; countryId: string; parentId: string | null; name: string; level: number } | null = null;
    if (dto.stateOfOriginId) {
      state = await this.prisma.administrativeDivision.findUnique({ where: { id: dto.stateOfOriginId }, select: { id: true, countryId: true, name: true, level: true } });
      if (!state || state.countryId !== country.id || state.level !== 1) throw new BadRequestException('Selected state/province/region does not belong to the selected country.');
    }
    if (dto.lgaOfOriginId) {
      lga = await this.prisma.administrativeDivision.findUnique({ where: { id: dto.lgaOfOriginId }, select: { id: true, countryId: true, parentId: true, name: true, level: true } });
      if (!lga || lga.countryId !== country.id || lga.level !== 2 || (state && lga.parentId !== state.id)) throw new BadRequestException('Selected local administrative area does not belong to the selected state/region.');
      if (country.iso2 !== 'NG') throw new BadRequestException('LGA selection is only valid for Nigeria. Use the appropriate foreign region instead.');
    }
    if (country.iso2 === 'NG' && dto.stateOfOriginId && !dto.lgaOfOriginId) throw new BadRequestException('For Nigeria, select the LGA after selecting the state.');
    return { country, state, lga };
  }

  private async validateAddressReference(address?: import('./dto/admissions.dto').AddressDto) {
    if (!address?.countryId) return null;
    const country = await this.prisma.country.findUnique({ where: { id: address.countryId }, select: { id: true, iso2: true, name: true } });
    if (!country) throw new BadRequestException('Selected address country is invalid.');
    if (address.regionId) {
      const region = await this.prisma.administrativeDivision.findUnique({ where: { id: address.regionId }, select: { id: true, countryId: true, level: true } });
      if (!region || region.countryId !== country.id || region.level !== 1) throw new BadRequestException('Selected address region does not belong to the selected country.');
    }
    if (address.localAreaId) {
      const local = await this.prisma.administrativeDivision.findUnique({ where: { id: address.localAreaId }, select: { id: true, countryId: true, parentId: true, level: true } });
      if (!local || local.countryId !== country.id || local.level !== 2 || (address.regionId && local.parentId !== address.regionId)) throw new BadRequestException('Selected address local area does not belong to the selected region.');
      if (country.iso2 !== 'NG') throw new BadRequestException('LGA/local area selection is only valid for Nigeria.');
    }
    if (country.iso2 === 'NG' && address.regionId && !address.localAreaId) throw new BadRequestException('For a Nigerian address, select the LGA after selecting the state.');
    return country;
  }

  private async validateOLevelReferences(results: OLevelSubjectResultDto[]) {
    for (const r of results) {
      if (r.subjectId) {
        const subject = await this.prisma.academicSubject.findUnique({ where: { id: r.subjectId }, select: { id: true, name: true, isActive: true } });
        if (!subject?.isActive) throw new BadRequestException("One or more selected O'Level subjects are invalid.");
        r.subject = subject.name;
      } else if (!r.subject?.trim()) {
        throw new BadRequestException("Select an O'Level subject for every result row.");
      }
      let canonicalExamType: OLevelExamTypeEnum | undefined;
      if (r.examinationTypeId) {
        const type = await this.prisma.examinationType.findUnique({
          where: { id: r.examinationTypeId },
          select: { id: true, code: true, authorityId: true, isActive: true, authority: { select: { code: true } } },
        });
        if (!type?.isActive) throw new BadRequestException('Selected examination type is invalid.');
        if (r.examinationAuthorityId && type.authorityId !== r.examinationAuthorityId) throw new BadRequestException('Examination type does not belong to the selected examination authority.');
        r.examinationAuthorityId ??= type.authorityId;
        canonicalExamType = this.toCanonicalExamType(type.authority.code);
      }
      if (r.examinationAuthorityId) {
        const authority = await this.prisma.examinationAuthority.findUnique({ where: { id: r.examinationAuthorityId }, select: { id: true, code: true, isActive: true } });
        if (!authority?.isActive) throw new BadRequestException('Selected examination authority is invalid.');
        canonicalExamType ??= this.toCanonicalExamType(authority.code);
      }
      if (canonicalExamType && r.examType && r.examType !== canonicalExamType) {
        throw new BadRequestException('Exam type must match the selected examination authority/type reference.');
      }
      r.examType = canonicalExamType ?? r.examType;
      if (!r.examType) throw new BadRequestException('Provide controlled examination references or a valid exam type.');
    }
  }

  private toCanonicalExamType(code: string): OLevelExamTypeEnum | undefined {
    const normalized = code.trim().toUpperCase();
    if (normalized === 'WAEC') return OLevelExamTypeEnum.WAEC;
    if (normalized === 'NECO') return OLevelExamTypeEnum.NECO;
    if (normalized === 'NABTEB') return OLevelExamTypeEnum.NABTEB;
    if (normalized === 'NBAIS') return OLevelExamTypeEnum.NBAIS;
    if (normalized === 'GCE' || normalized === 'OTHER') return OLevelExamTypeEnum.GCE;
    return undefined;
  }

  // ── Applicants ─────────────────────────────────────────────────────────────
  private async findIdempotentReplay(idempotencyKey: string, waitForCommit = false) {
    const attempts = waitForCommit ? 8 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const previous = await this.prisma.application.findUnique({
        where: { submissionIdempotencyKey: idempotencyKey },
        select: { applicant: { select: { id: true, applicationNo: true, email: true } }, completionPercent: true },
      });
      if (previous) {
        return {
          id: previous.applicant.id,
          applicationNo: previous.applicant.applicationNo,
          completionPercent: previous.completionPercent,
          trackingToken: this.createTrackingToken(previous.applicant.applicationNo, previous.applicant.email),
        };
      }
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
    return null;
  }

  async apply(dto: CreateApplicantDto, idempotencyKey?: string): Promise<{ id: string; applicationNo: string; completionPercent: number; trackingToken: string }> {
    this.requireTrackingSecret();
    if (idempotencyKey) {
      const previous = await this.findIdempotentReplay(idempotencyKey);
      if (previous) return previous;
    }
    const cycle = await this.prisma.admissionCycle.findUniqueOrThrow({ where: { id: dto.admissionCycleId } });
    const admissionType = cycle.admissionType as AdmissionType;
    const now = new Date();
    if (!cycle.isActive || now < cycle.openDate || now > cycle.closeDate) {
      throw new UnprocessableEntityException({ code: 'BUSINESS_RULE_INVALID_STATE', message: 'This admission cycle is not currently accepting applications.' });
    }
    if (dto.admissionType && dto.admissionType !== cycle.admissionType) {
      throw new BadRequestException('Admission type must match the selected admission cycle.');
    }
    if (!dto.declarationAccepted) {
      throw new BadRequestException('You must accept the application declaration before submitting.');
    }
    if (dto.nin && !dto.ninConsentAccepted) {
      throw new BadRequestException('Please acknowledge the NIN identity-verification privacy notice before submitting a NIN.');
    }
    const origin = await this.validateOriginLocation(dto);
    await this.validateAddressReference(dto.residentialAddress);
    await this.validateAddressReference(dto.permanentAddress);
    if (dto.oLevelResults?.length) await this.validateOLevelReferences(dto.oLevelResults);

    const programmeIds = [dto.programmeChoice1Id, dto.programmeChoice2Id, dto.programmeChoice3Id].filter(Boolean) as string[];
    if (new Set(programmeIds).size !== programmeIds.length) throw new BadRequestException('Programme choices must be different.');
    const programmes = await this.prisma.programme.findMany({ where: { id: { in: programmeIds }, isActive: true }, select: { id: true } });
    if (programmes.length !== programmeIds.length) throw new BadRequestException('One or more selected programmes are invalid or inactive.');

    const dob = new Date(dto.dateOfBirth);
    if (Number.isNaN(dob.getTime()) || dob > now) throw new BadRequestException('Date of birth is invalid.');
    const age = this.calculateAge(dob, now);
    const requirement = await this.prisma.admissionRequirement.findFirst({
      where: { programmeId: dto.programmeChoice1Id, admissionType, academicYear: cycle.academicYear, isActive: true },
      include: { subjectRequirements: true },
    });
    const minimumAge = requirement?.minAge ?? 16;
    if (age < minimumAge) throw new BadRequestException(`Applicant must be at least ${minimumAge} years old.`);
    if (requirement?.maxAge && age > requirement.maxAge) throw new BadRequestException(`Applicant exceeds the maximum permitted age of ${requirement.maxAge}.`);

    const email = dto.email.trim().toLowerCase();
    const duplicate = await this.prisma.applicant.findFirst({ where: { admissionCycleId: cycle.id, email, deletedAt: null } });
    if (duplicate) throw new ConflictException({ code: 'DUPLICATE_APPLICATION', message: 'An application already exists for this email in the selected admission cycle.', applicationNo: duplicate.applicationNo });
    if (dto.jambRegNo) {
      const jambDuplicate = await this.prisma.applicant.findFirst({ where: { admissionCycleId: cycle.id, jambRegNo: dto.jambRegNo } });
      if (jambDuplicate) throw new ConflictException({ code: 'DUPLICATE_JAMB_APPLICATION', message: 'This JAMB registration number has already been used for this admission cycle.', applicationNo: jambDuplicate.applicationNo });
    }

    const oLevelEligibility = dto.oLevelResults?.length
      ? this.evaluateOLevelEligibility(dto.oLevelResults, this.toOLevelPolicy(requirement))
      : null;
    const completionPercent = this.calculateCompletion(dto, admissionType as CreateApplicantDto['admissionType']);

    // Capacity is guarded by a dedicated advisory lock. This prevents the classic
    // count-then-insert race during admission opening, while retaining the DB unique
    // constraints as the final safety net.
    const lockKey = buildAdvisoryLockKey('admission-capacity', cycle.id);
    const createSubmission = () => this.direct.$transaction(async (tx: Prisma.TransactionClient) => {
      const applicationNo = await this.generateApplicationNoInTransaction(tx, cycle.academicYear, admissionType);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey}::bigint)`;
      if (cycle.maxApplicants) {
        const count = await tx.applicant.count({ where: { admissionCycleId: cycle.id, deletedAt: null } });
        if (count >= cycle.maxApplicants) throw new UnprocessableEntityException({ code: 'APPLICATION_CAPACITY_REACHED', message: 'Application capacity reached.' });
      }
      const person = await tx.person.create({ data: {
        firstName: dto.firstName, lastName: dto.lastName, middleName: dto.middleName ?? null,
        dateOfBirth: dob, gender: dto.gender, nationality: dto.nationality,
        stateOfOrigin: origin?.state?.name ?? dto.stateOfOrigin ?? null, lga: origin?.lga?.name ?? dto.lga ?? null,
        countryOfOriginId: origin?.country.id ?? null, stateOfOriginId: origin?.state?.id ?? null, lgaOfOriginId: origin?.lga?.id ?? null,
        primaryEmail: email, primaryPhone: dto.phone,
      }});
      const applicant = await tx.applicant.create({ data: {
        personId: person.id, applicationNo, firstName: dto.firstName, lastName: dto.lastName,
        middleName: dto.middleName ?? null, dateOfBirth: dob, gender: dto.gender,
        nationality: dto.nationality, stateOfOrigin: origin?.state?.name ?? dto.stateOfOrigin ?? null, lga: origin?.lga?.name ?? dto.lga ?? null,
        countryOfOriginId: origin?.country.id ?? null, stateOfOriginId: origin?.state?.id ?? null, lgaOfOriginId: origin?.lga?.id ?? null,
        phone: dto.phone, email, admissionType,
        admissionCycleId: dto.admissionCycleId, programmeChoice1Id: dto.programmeChoice1Id,
        programmeChoice2Id: dto.programmeChoice2Id ?? null, programmeChoice3Id: dto.programmeChoice3Id ?? null,
        jambRegNo: dto.jambRegNo ?? null, jambScore: dto.jambScore ?? null,
        nin: dto.nin ? encryptPii(dto.nin.trim()) : null,
        declarationAccepted: true, declarationAcceptedAt: now, submittedAt: now,
        status: ApplicantStatus.SUBMITTED,
      }});
      const application = await tx.application.create({ data: {
        applicantId: applicant.id, admissionCycleId: cycle.id, status: ApplicationStatus.SUBMITTED,
        completionPercent, submittedAt: now, lastSavedAt: now, submissionIdempotencyKey: idempotencyKey ?? null, declarationAccepted: true,
        declarationAcceptedAt: now, paymentStatus: ApplicationPaymentStatus.NOT_REQUIRED,
      }});
      if (dto.residentialAddress) await tx.address.create({ data: { applicantId: applicant.id, type: 'RESIDENTIAL', ...dto.residentialAddress, country: dto.residentialAddress.country ?? 'Nigeria', countryId: dto.residentialAddress.countryId ?? null, regionId: dto.residentialAddress.regionId ?? null, localAreaId: dto.residentialAddress.localAreaId ?? null } });
      if (dto.permanentAddress) await tx.address.create({ data: { applicantId: applicant.id, type: 'PERMANENT', ...dto.permanentAddress, country: dto.permanentAddress.country ?? 'Nigeria', countryId: dto.permanentAddress.countryId ?? null, regionId: dto.permanentAddress.regionId ?? null, localAreaId: dto.permanentAddress.localAreaId ?? null } });
      if (dto.guardian) await tx.guardianContact.create({ data: { applicantId: applicant.id, ...dto.guardian } });
      if (dto.emergencyContact) await tx.emergencyContact.create({ data: { applicantId: applicant.id, fullName: dto.emergencyContact.fullName, relationship: dto.emergencyContact.relationship, phone: dto.emergencyContact.phone, email: dto.emergencyContact.email ?? null, address: dto.emergencyContact.address ?? null } });
      if (dto.previousEducation?.length) await tx.previousEducation.createMany({ data: dto.previousEducation.map((e) => ({ applicationId: application.id, ...e })) });
      if (dto.oLevelResults?.length) {
        const bySitting = new Map<number, typeof dto.oLevelResults>();
        for (const r of dto.oLevelResults) bySitting.set(r.sittingNumber, [...(bySitting.get(r.sittingNumber) ?? []), r]);
        for (const [sittingNumber, results] of bySitting) {
          const first = results[0];
          const metadataMismatch = results.some((result) =>
            result.examType !== first.examType
            || result.examinationAuthorityId !== first.examinationAuthorityId
            || result.examinationTypeId !== first.examinationTypeId
            || result.candidateCategory !== first.candidateCategory
            || result.examYear !== first.examYear,
          );
          if (metadataMismatch) {
            throw new BadRequestException(`All O'Level results in sitting ${sittingNumber} must use the same examination metadata.`);
          }
          const examType = first.examType;
          if (!examType) throw new BadRequestException(`Sitting ${sittingNumber} is missing a canonical examination type.`);
          const sitting = await tx.oLevelSitting.create({ data: {
            applicationId: application.id, examType, examinationAuthorityId: first.examinationAuthorityId ?? null, examinationTypeId: first.examinationTypeId ?? null, candidateCategory: first.candidateCategory ?? null, examYear: first.examYear,
            sittingNumber, verificationStatus: VerificationStatus.PENDING,
          }});
          await tx.oLevelSubject.createMany({ data: results.map((r) => ({ sittingId: sitting.id, subjectId: r.subjectId ?? null, subject: r.subject!.trim(), grade: r.grade })) });
        }
      }
      if (dto.jambRegNo && admissionType === AdmissionType.UTME) {
        await this.outbox.write(tx, 'admissions.jamb_verification_requested', {
          applicantId: applicant.id,
          jambRegNo: dto.jambRegNo,
        });
      }
      return { applicant, application, applicationNo, oLevelEligibility };
    });

    let created: Awaited<ReturnType<typeof createSubmission>>;
    try {
      created = await createSubmission();
    } catch (error) {
      if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const replay = await this.findIdempotentReplay(idempotencyKey, true);
        if (replay) return replay;
      }
      throw error;
    }

    await this.audit.log({ action: AuditAction.CREATE, targetTable: 'applications', targetId: created.application.id, newValues: { applicationNo: created.applicationNo, admissionCycleId: cycle.id, programmeChoice1Id: dto.programmeChoice1Id, completionPercent } });
    return { id: created.applicant.id, applicationNo: created.applicationNo, completionPercent, trackingToken: this.createTrackingToken(created.applicationNo, email) };
  }

  async presignApplicantPhoto(dto: ApplicantPhotoPresignDto) {
    const applicant = await this.findTrackedApplicant(dto.applicationNo, dto.trackingToken);
    const extension = dto.contentType === 'image/png' ? 'png' : 'jpg';
    const key = `admissions/${applicant.applicationNo}/passport-photo/${randomUUID()}.${extension}`;
    return this.storage.presignPost(key, dto.contentType, dto.sizeBytes);
  }

  async completeApplicantPhoto(dto: ApplicantPhotoCompleteDto) {
    const applicant = await this.findTrackedApplicant(dto.applicationNo, dto.trackingToken);
    const prefix = `admissions/${applicant.applicationNo}/passport-photo/`;
    if (!dto.key.startsWith(prefix)) throw new BadRequestException('Photograph key is not scoped to this application.');
    const verified = await this.storage.verifyObject(dto.key, dto.sizeBytes, dto.contentType);
    const application = await this.prisma.application.findUnique({ where: { applicantId: applicant.id }, select: { id: true } });
    if (!application) throw new NotFoundException('Application record not found.');
    const existing = await this.prisma.applicationDocument.findFirst({ where: { applicationId: application.id, documentType: ApplicationDocumentType.PASSPORT_PHOTO }, orderBy: { createdAt: 'desc' } });
    const document = existing
      ? await this.prisma.applicationDocument.update({ where: { id: existing.id }, data: { fileUrl: verified.key, originalFileName: dto.originalFileName ?? null, mimeType: verified.contentType, sizeBytes: verified.sizeBytes, status: VerificationStatus.PENDING, rejectionReason: null, verifiedAt: null, verifiedById: null, version: { increment: 1 } } })
      : await this.prisma.applicationDocument.create({ data: { applicationId: application.id, documentType: ApplicationDocumentType.PASSPORT_PHOTO, fileUrl: verified.key, originalFileName: dto.originalFileName ?? null, mimeType: verified.contentType, sizeBytes: verified.sizeBytes, status: VerificationStatus.PENDING } });
    await this.prisma.applicant.update({ where: { id: applicant.id }, data: { passportPhotoUrl: verified.key } });
    await this.audit.log({ action: AuditAction.CREATE, targetTable: 'application_documents', targetId: document.id, newValues: { applicationId: application.id, documentType: ApplicationDocumentType.PASSPORT_PHOTO, sizeBytes: verified.sizeBytes } });
    return { documentId: document.id, status: document.status, message: 'Photograph uploaded and queued for admissions review.' };
  }

  private async findTrackedApplicant(applicationNo: string, trackingToken: string) {
    const applicant = await this.prisma.applicant.findFirst({ where: { applicationNo: applicationNo.trim().toUpperCase(), deletedAt: null }, select: { id: true, applicationNo: true, email: true } });
    const valid = applicant ? this.isTrackingTokenValid(applicant.applicationNo, applicant.email, trackingToken.trim()) : false;
    if (!applicant || !valid) throw new NotFoundException('Application not found or tracking credential is invalid.');
    return applicant;
  }

  async findAll(filters: {
    status?: ApplicantStatus; admissionType?: AdmissionType;
    cycleId?: string; page: number; pageSize: number;
  }) {
    const { status, admissionType, cycleId, page, pageSize } = filters;
    const where = {
      ...(status        ? { status }             : {}),
      ...(admissionType ? { admissionType }       : {}),
      ...(cycleId       ? { admissionCycleId: cycleId } : {}),
      deletedAt: null,
    };
    const [applicants, total] = await this.prisma.$transaction([
      this.prisma.applicant.findMany({
        where,
        include: {
          programmeChoice1: { select: { name: true, code: true } },
          admissionCycle:   { select: { cycleName: true, academicYear: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * pageSize,
        take:    pageSize,
      }),
      this.prisma.applicant.count({ where }),
    ]);
    const safeApplicants = applicants.map(({ nin, ...applicant }) => ({
      ...applicant,
      ninMasked: nin ? '***********' : null,
    }));
    return { applicants: safeApplicants, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findById(id: string) {
    const applicant = await this.prisma.applicant.findUniqueOrThrow({
      where:   { id },
      include: {
        programmeChoice1: true,
        programmeChoice2: true,
        programmeChoice3: true,
        admissionCycle:   true,
        person:            true,
        addresses:        true,
        guardians:        true,
        emergencyContacts: true,
        application:      { include: { documents: true, oLevelSittings: { include: { subjects: true } }, education: true, screenings: true, decisions: true, offers: true } },
        student:          { select: { id: true, matricNo: true } },
      },
    });
    const { nin, ...safeApplicant } = applicant;
    return { ...safeApplicant, ninMasked: nin ? '***********' : null };
  }

  async updateStatus(id: string, dto: UpdateApplicantStatusDto, actorId: string) {
    const applicant = await this.prisma.applicant.findUniqueOrThrow({ where: { id } });

    // Validate FSM transitions
    const allowed: Partial<Record<ApplicantStatus, string[]>> = {
      [ApplicantStatus.SUBMITTED]: ['PENDING', 'DOCUMENT_REVIEW', 'REVIEW_REQUIRED', 'REJECTED', 'WITHDRAWN'],
      [ApplicantStatus.PENDING]: ['SCREENED', 'DOCUMENT_REVIEW', 'REVIEW_REQUIRED', 'ELIGIBLE', 'INELIGIBLE', 'REJECTED', 'WITHDRAWN'],
      [ApplicantStatus.DOCUMENT_REVIEW]: ['SCREENED', 'ELIGIBLE', 'REVIEW_REQUIRED', 'INELIGIBLE', 'REJECTED'],
      [ApplicantStatus.REVIEW_REQUIRED]: ['DOCUMENT_REVIEW', 'SCREENED', 'ELIGIBLE', 'INELIGIBLE', 'REJECTED'],
      [ApplicantStatus.SCREENED]: ['ELIGIBLE', 'OFFERED', 'WAITLISTED', 'REJECTED'],
      [ApplicantStatus.ELIGIBLE]: ['OFFERED', 'WAITLISTED', 'REJECTED'],
      [ApplicantStatus.OFFERED]: ['ACCEPTED', 'DECLINED', 'REJECTED', 'WITHDRAWN', 'DEFERRED'],
      [ApplicantStatus.WAITLISTED]: ['OFFERED', 'REJECTED', 'WITHDRAWN'],
      [ApplicantStatus.ACCEPTED]: ['CLEARANCE', 'WITHDRAWN', 'DEFERRED'],
      [ApplicantStatus.CLEARANCE]: ['MATRICULATED', 'WITHDRAWN', 'DEFERRED'],
    };
    if (!allowed[applicant.status]?.includes(dto.status)) {
      throw new UnprocessableEntityException({
        code:    'BUSINESS_RULE_INVALID_STATE',
        message: `Cannot transition from ${applicant.status} to ${dto.status}`,
      });
    }

    if (dto.status === 'REJECTED' && !dto.rejectionReason) {
      throw new BadRequestException('Rejection reason is required');
    }

    // Deep-audit fix (Aug 2026): admission eligibility in this system was
    // JAMB-score-only — nothing checked O'Level requirements (minimum 5
    // credit passes including English and Mathematics, from not more than
    // two sittings) before an offer could be made, despite this being a
    // legally required part of Nigerian university admission alongside
    // UTME score. See checkOLevelEligibility()/evaluateOLevelEligibility()
    // below.
    let selectedProgrammeId = applicant.programmeChoice1Id;
    if (dto.selectedProgrammeId) {
      const choices = [applicant.programmeChoice1Id, applicant.programmeChoice2Id, applicant.programmeChoice3Id].filter(Boolean);
      if (!choices.includes(dto.selectedProgrammeId)) throw new BadRequestException('Selected admission programme must be one of the applicant’s submitted choices.');
      selectedProgrammeId = dto.selectedProgrammeId;
    }

    if (dto.status === 'OFFERED') {
      const evaluation = await this.evaluateApplicationEligibility(id);
      const selected = evaluation.choices?.find((x: any) => x.programmeId === selectedProgrammeId);
      if (!selected || selected.result !== 'ELIGIBLE') {
        throw new UnprocessableEntityException({
          code: 'ADMISSION_NOT_ELIGIBLE',
          message: `Cannot make an offer for the selected programme: ${(selected?.reasons ?? evaluation.reasons).join('; ')}`,
          details: evaluation,
        });
      }
    }

    const data: Record<string, unknown> = { status: dto.status };
    if (dto.status === 'OFFERED') {
      data['offerDate'] = new Date();
      data['offerDeadline'] = dto.offerDeadline ? new Date(dto.offerDeadline) : null;
    }
    if (dto.status === 'REJECTED' || dto.status === 'INELIGIBLE') {
      data['rejectionDate'] = new Date();
      data['rejectionReason'] = dto.rejectionReason ?? null;
    }
    if (dto.status === 'ACCEPTED') data['acceptanceDate'] = new Date();
    if (dto.status === 'WITHDRAWN' || dto.status === 'DECLINED') data['rejectionReason'] = dto.rejectionReason ?? null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.applicant.update({ where: { id }, data });

      await tx.auditLog.create({
        data: {
          actorId, action: AuditAction.UPDATE, targetTable: 'applicants', targetId: id,
          oldValues: { status: applicant.status }, newValues: { status: dto.status },
        },
      });

      // C1 fix: was `void this.notifQueue.add('send-notification', {...})`
      // — wrong job name (NotificationsProcessor only handles
      // 'deliver-domain-event' jobs, produced by the outbox below), so this
      // silently never reached anyone. REJECTED gets its own specific event
      // (NotificationsProcessor already had a handler for it, unreachable
      // for the same reason); everything else goes through a new generic
      // status-update event.
      const application = await tx.application.findUnique({ where: { applicantId: id } });
      if (application) {
        const statusMap: Record<string, ApplicationStatus> = {
          PENDING: ApplicationStatus.UNDER_SCREENING, SCREENED: ApplicationStatus.UNDER_SCREENING, DOCUMENT_REVIEW: ApplicationStatus.DOCUMENT_REVIEW,
          REVIEW_REQUIRED: ApplicationStatus.REVIEW_REQUIRED, ELIGIBLE: ApplicationStatus.ELIGIBLE, INELIGIBLE: ApplicationStatus.INELIGIBLE,
          OFFERED: ApplicationStatus.OFFERED, WAITLISTED: ApplicationStatus.WAITLISTED, ACCEPTED: ApplicationStatus.ACCEPTED, DECLINED: ApplicationStatus.DECLINED,
          REJECTED: ApplicationStatus.REJECTED, WITHDRAWN: ApplicationStatus.WITHDRAWN, DEFERRED: ApplicationStatus.DEFERRED, CLEARANCE: ApplicationStatus.CLEARANCE, MATRICULATED: ApplicationStatus.MATRICULATED,
        };
        await tx.application.update({ where: { id: application.id }, data: { status: statusMap[dto.status] ?? ApplicationStatus.REVIEW_REQUIRED, lastSavedAt: new Date() } });
        const decisionMap: Record<string, AdmissionDecisionType> = { OFFERED: AdmissionDecisionType.OFFER, WAITLISTED: AdmissionDecisionType.WAITLIST, REJECTED: AdmissionDecisionType.REJECT, DEFERRED: AdmissionDecisionType.DEFER };
        if (decisionMap[dto.status]) {
          await tx.admissionDecision.create({ data: {
  applicationId: application.id, programmeId: selectedProgrammeId,
  decision: decisionMap[dto.status], reasonCode: dto.reasonCode as AdmissionDecisionReason ?? undefined,
  reason: dto.rejectionReason ?? undefined, decisionById: actorId,
} });
        }
        if (dto.status === 'OFFERED') {
          const existing = await tx.admissionOffer.findFirst({ where: { applicationId: application.id, status: 'PENDING' } });
          if (!existing) {
            await tx.admissionOffer.create({ data: {
  applicationId: application.id, offerNumber: `${applicant.applicationNo}-OFF-${selectedProgrammeId.slice(0,8)}`,
  programmeId: selectedProgrammeId, issueDate: new Date(),
  expiryDate: dto.offerDeadline ? new Date(dto.offerDeadline) : null,
} });
          }
        }
        if (dto.status === 'ACCEPTED') await tx.admissionOffer.updateMany({ where: { applicationId: application.id, status: 'PENDING' }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
        if (dto.status === 'DECLINED') await tx.admissionOffer.updateMany({ where: { applicationId: application.id, status: 'PENDING' }, data: { status: 'DECLINED', declinedAt: new Date() } });
      }
      if (dto.status === 'REJECTED') {
        await this.outbox.write(tx, 'applicant.rejected', { applicantId: id, email: applicant.email, reason: dto.rejectionReason });
      } else {
        await this.outbox.write(tx, 'admission.status_updated', { applicantId: id, email: applicant.email, firstName: applicant.firstName, status: dto.status });
      }

      return result;
    });

    return updated;
  }

  // ── Bulk screening against configured programme/cycle policy ────────────────
  async screenBulk(dto: ScreenApplicantsDto, actorId: string): Promise<{
    screened: number; rejected: number; skipped: number; dryRun: boolean;
  }> {
    const cycle = await this.prisma.admissionCycle.findUniqueOrThrow({
      where: { id: dto.admissionCycleId },
    });

    const pendingApplicants = await this.prisma.applicant.findMany({
      where: { admissionCycleId: cycle.id, status: ApplicantStatus.PENDING, deletedAt: null },
      select: { id: true },
    });

    let screened = 0, rejected = 0, skipped = 0;
    const dryRun = dto.dryRun ?? false;

    for (const app of pendingApplicants) {
      // Dry runs must not write AdmissionScreening rows. A real screening
      // persists an immutable policy snapshot; a preview only computes it.
      const evaluation = await this.evaluateApplicationEligibility(app.id, { persistScreening: !dryRun });
      if (evaluation.result === 'ELIGIBLE') {
        screened++;
        if (!dryRun) await this.updateStatus(app.id, { status: ApplicantStatus.ELIGIBLE as UpdateApplicantStatusDto['status'] }, actorId);
      } else if (evaluation.result === 'INELIGIBLE') {
        rejected++;
        if (!dryRun) await this.updateStatus(app.id, {
          status: ApplicantStatus.INELIGIBLE as UpdateApplicantStatusDto['status'],
          rejectionReason: evaluation.reasons.join('; ') || 'Admission requirements were not met.',
        }, actorId);
      } else {
        skipped++;
        if (!dryRun) await this.updateStatus(app.id, { status: ApplicantStatus.REVIEW_REQUIRED as UpdateApplicantStatusDto['status'] }, actorId);
      }
    }

    if (!dryRun) {
      await this.audit.log({
        action: AuditAction.UPDATE, targetTable: 'applicants',
        metadata: { bulkScreen: true, cycleId: cycle.id, screened, rejected, skipped },
      }, actorId);
    }

    return { screened, rejected, skipped, dryRun };
  }

  // ── JAMB verification webhook / job result ─────────────────────────────────
  async markManualVerificationRequired(applicantId: string, verificationType: 'JAMB' | 'OLEVEL', reason: string) {
    const result = await this.direct.$transaction(async (tx) => {
      const applicant = await tx.applicant.findUniqueOrThrow({ where: { id: applicantId }, select: { id: true, status: true } });
      const terminalStatuses = new Set<ApplicantStatus>([ApplicantStatus.REJECTED, ApplicantStatus.INELIGIBLE, ApplicantStatus.WITHDRAWN, ApplicantStatus.MATRICULATED]);
      const terminal = terminalStatuses.has(applicant.status);
      const updated = terminal || applicant.status === ApplicantStatus.REVIEW_REQUIRED
        ? applicant
        : await tx.applicant.update({ where: { id: applicantId }, data: { status: ApplicantStatus.REVIEW_REQUIRED } });
      const eventId = await this.outbox.write(tx, 'admissions.manual_verification_required', {
        applicantId, verificationType, reason, status: 'MANUAL_VERIFICATION_REQUIRED',
      });
      return { applicant: updated, eventId };
    });
    await this.audit.log({
      action: AuditAction.UPDATE, targetTable: 'applicants', targetId: applicantId,
      newValues: { status: result.applicant.status, verificationType, manualVerificationRequired: true, reason },
      metadata: { eventId: result.eventId, systemGenerated: true },
    });
    return result;
  }

  async updateJambVerification(
    applicantId: string,
    verified: boolean,
    score: number,
    actorId?: string,
    remarks?: string,
  ) {
    if (!Number.isInteger(score) || score < 0 || score > 400) {
      throw new BadRequestException('JAMB score must be an integer between 0 and 400.');
    }
    const updated = await this.prisma.applicant.update({
      where: { id: applicantId },
      data: { jambVerified: verified, jambScore: score },
    });
    if (actorId) {
      await this.audit.log({
        action: AuditAction.UPDATE,
        targetTable: 'applicants',
        targetId: applicantId,
        newValues: { jambVerified: verified, jambScore: score, verificationRemarks: remarks ?? null },
      }, actorId);
    }
    this.logger.log(`JAMB verification: applicant ${applicantId} → verified=${verified}, score=${score}`);
    return updated;
  }

  async evaluateApplicationEligibility(applicantId: string, options: EligibilityEvaluationOptions = {}) {
    const app = await this.prisma.applicant.findUniqueOrThrow({
      where: { id: applicantId },
      include: { application: { include: { documents: true, oLevelSittings: { include: { subjects: true } } } }, admissionCycle: true },
    });
    const programmeIds = [app.programmeChoice1Id, app.programmeChoice2Id, app.programmeChoice3Id].filter(Boolean) as string[];
    const choices = [];
    for (const programmeId of programmeIds) {
      choices.push(await this.evaluateEligibilityForProgramme(app, programmeId, options));
    }
    const primary = choices[0]!;
    const result = choices.some(x => x.result === 'ELIGIBLE') ? 'ELIGIBLE' : choices.some(x => x.result === 'REVIEW_REQUIRED') ? 'REVIEW_REQUIRED' : 'INELIGIBLE';
    return { ...primary, result, choices };
  }

  private async evaluateEligibilityForProgramme(app: any, programmeId: string, options: EligibilityEvaluationOptions = {}) {
    await this.prisma.programme.findUniqueOrThrow({ where: { id: programmeId } });
    const requirement = await this.prisma.admissionRequirement.findFirst({
      where: { programmeId, admissionType: app.admissionType, academicYear: app.admissionCycle.academicYear, isActive: true },
      include: { subjectRequirements: true },
    });
    const policy = this.toOLevelPolicy(requirement);
    const reasons: string[] = [];
    let requiresReview = false;
    let isIneligible = false;

    if (app.admissionType === AdmissionType.UTME) {
      const cutoff = requirement?.minUtmeScore ?? app.admissionCycle.utmeMinScore;
      if (cutoff != null && app.jambScore == null) { reasons.push('JAMB score has not been supplied.'); requiresReview = true; }
      if (cutoff != null && app.jambScore != null && !app.jambVerified) { reasons.push('JAMB result is awaiting verification.'); requiresReview = true; }
      if (cutoff != null && app.jambScore != null && app.jambScore < cutoff) {
        reasons.push(`UTME score ${app.jambScore} is below the applicable cut-off of ${cutoff}.`);
        isIneligible = true;
      }
    }

    if (app.dateOfBirth && requirement) {
      const age = this.calculateAge(new Date(app.dateOfBirth), new Date());
      if (requirement.minAge != null && age < requirement.minAge) {
        reasons.push(`Applicant is ${age}; the minimum age for this programme is ${requirement.minAge}.`);
        isIneligible = true;
      }
      if (requirement.maxAge != null && age > requirement.maxAge) {
        reasons.push(`Applicant is ${age}; the maximum age for this programme is ${requirement.maxAge}.`);
        isIneligible = true;
      }
    }

    const sittings = app.application?.oLevelSittings ?? [];
    const verifiedSittings = sittings.filter((s: any) => s.verificationStatus === VerificationStatus.VERIFIED);
    const hasUnverifiedSittings = sittings.some((s: any) => s.verificationStatus !== VerificationStatus.VERIFIED);
    const subjects = verifiedSittings.flatMap((s: any) => s.subjects.map((x: any) => ({
      subject: x.subject, grade: x.grade, sitting: s.sittingNumber,
    }))) ?? [];
    const oLevel = subjects.length ? this.evaluateOLevelEligibility(subjects.map((x: any) => ({
      subject: x.subject,
      grade: x.grade as OLevelGradeEnum,
      examType: OLevelExamTypeEnum.WAEC,
      examYear: 2000,
      sittingNumber: x.sitting,
    })), policy) : null;
    if (hasUnverifiedSittings) {
      reasons.push("O'Level evidence is awaiting verification or contains a rejected sitting.");
      requiresReview = true;
    }
    if (!oLevel) {
      reasons.push("No verified O'Level results are available.");
      requiresReview = true;
    } else if (!oLevel.eligible) {
      reasons.push(...oLevel.reasons);
      isIneligible = true;
    }

    if (app.application) {
      const rejected = app.application.documents.filter((d: any) => d.status === VerificationStatus.REJECTED);
      if (rejected.length) {
        reasons.push(`${rejected.length} application document(s) have been rejected.`);
        requiresReview = true;
      }
    }

    if (requirement) {
      const requiredDocuments = Array.isArray(requirement.requiredDocuments) ? requirement.requiredDocuments as string[] : [];
      if (requiredDocuments.length && app.application) {
        const verified = new Set(app.application.documents.filter((d: any) => d.status === VerificationStatus.VERIFIED).map((d: any) => String(d.documentType)));
        for (const required of requiredDocuments) {
          if (!verified.has(required)) {
            reasons.push(`Required document is not verified: ${required}.`);
            isIneligible = true;
          }
        }
      }
    }

    const result = isIneligible ? 'INELIGIBLE' : requiresReview ? 'REVIEW_REQUIRED' : 'ELIGIBLE';
    const policySnapshot = requirement ? {
      id: requirement.id,
      academicYear: requirement.academicYear,
      minUtmeScore: requirement.minUtmeScore,
      minAge: requirement.minAge,
      maxAge: requirement.maxAge,
      minOLevelCredits: policy.minOLevelCredits,
      maxOLevelSittings: policy.maxOLevelSittings,
      requireEnglish: policy.requireEnglish,
      requireMathematics: policy.requireMathematics,
      subjectRequirements: policy.subjectRequirements,
      requiredDocuments: requirement.requiredDocuments,
    } : {
      cycleCutoff: app.admissionCycle.utmeMinScore,
      minOLevelCredits: policy.minOLevelCredits,
      maxOLevelSittings: policy.maxOLevelSittings,
      requireEnglish: policy.requireEnglish,
      requireMathematics: policy.requireMathematics,
      subjectRequirements: policy.subjectRequirements,
    };

    if (app.application && options.persistScreening !== false) {
      await this.prisma.admissionScreening.create({
        data: {
          applicationId: app.application.id,
          programmeId,
          result: result as ScreeningResult,
          reasons,
          policySnapshot: policySnapshot as Prisma.InputJsonValue,
        },
      });
    }
    return { result, reasons, programmeId, policy: policySnapshot };
  }

  async registerDocument(id: string, dto: RegisterApplicationDocumentDto, actorId: string) {
    const application = await this.prisma.application.findUniqueOrThrow({ where: { applicantId: id } });
    const document = await this.prisma.applicationDocument.create({ data: { applicationId: application.id, documentType: dto.documentType as ApplicationDocumentType, fileUrl: dto.fileUrl ?? null, originalFileName: dto.originalFileName ?? null, mimeType: dto.mimeType ?? null, sizeBytes: dto.sizeBytes ?? null, documentNumber: dto.documentNumber ?? null, status: VerificationStatus.PENDING } });
    await this.audit.log({ action: AuditAction.CREATE, targetTable: 'application_documents', targetId: document.id, newValues: { applicationId: application.id, documentType: dto.documentType } }, actorId);
    return document;
  }

  async recordDocumentVerification(id: string, documentId: string, status: VerificationStatus, actorId: string, rejectionReason?: string) {
    const application = await this.prisma.application.findUniqueOrThrow({ where: { applicantId: id } });
    const document = await this.prisma.applicationDocument.findFirst({ where: { id: documentId, applicationId: application.id } });
    if (!document) throw new NotFoundException('Document not found for this application.');
    const updated = await this.prisma.applicationDocument.update({ where: { id: documentId }, data: { status, rejectionReason: status === VerificationStatus.REJECTED ? rejectionReason ?? 'Document was not accepted.' : null, verifiedAt: status === VerificationStatus.VERIFIED ? new Date() : null, verifiedById: status === VerificationStatus.VERIFIED ? actorId : null } });
    await this.audit.log({ action: AuditAction.UPDATE, targetTable: 'application_documents', targetId: documentId, newValues: { status, rejectionReason } }, actorId);
    return updated;
  }

  private requireTrackingSecret(): string {
    const secret = process.env.ADMISSIONS_TRACKING_SECRET;
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException('Admissions tracking is temporarily unavailable. Configure ADMISSIONS_TRACKING_SECRET before accepting applications.');
    }
    return secret;
  }

  private createTrackingToken(applicationNo: string, email: string): string {
    return createHmac('sha256', this.requireTrackingSecret())
      .update(`${applicationNo.trim().toUpperCase()}:${email.trim().toLowerCase()}`)
      .digest('hex');
  }

  private isTrackingTokenValid(applicationNo: string, email: string, token: string): boolean {
    if (!/^[a-f0-9]{64}$/i.test(token)) return false;
    const expected = Buffer.from(this.createTrackingToken(applicationNo, email), 'utf8');
    const supplied = Buffer.from(token.toLowerCase(), 'utf8');
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }

  private calculateCompletion(dto: CreateApplicantDto, admissionType = dto.admissionType): number {
    const checks = [
      !!dto.firstName && !!dto.lastName && !!dto.dateOfBirth && !!dto.gender && !!dto.nationality,
      !!dto.phone && !!dto.email,
      !!dto.admissionCycleId && !!admissionType && !!dto.programmeChoice1Id,
      admissionType !== AdmissionType.UTME || !!dto.jambRegNo,
      !!dto.oLevelResults?.length,
      !!dto.residentialAddress,
      !!dto.guardian,
      !!dto.declarationAccepted,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }

  private calculateAge(dob: Date, at: Date): number {
    let age = at.getUTCFullYear() - dob.getUTCFullYear();
    const month = at.getUTCMonth() - dob.getUTCMonth();
    if (month < 0 || (month === 0 && at.getUTCDate() < dob.getUTCDate())) age--;
    return age;
  }

  // ── Internal helpers ───────────────────────────────────────────────────────
  /**
   * Deep-audit fix (Aug 2026): previously read a plain count() then
   * constructed prefix+(count+1) with no locking at all — the exact same
   * check-then-act race MatricNumberService.generate() was already built
   * to solve for matric numbers (concurrent applicants during an
   * admission cycle's opening rush could read the same count before
   * either INSERT committed, generating duplicate application numbers).
   * applicationNo does have a DB-level unique constraint, so the failure
   * mode wasn't silent corruption — it was a raw P2002 conflict for
   * whichever concurrent applicant lost the race, during the single
   * highest-stakes, most deadline-sensitive moment in the whole system.
   * Now uses the same advisory-lock pattern as matric numbers, for the
   * same PgBouncer-safety reason — see DirectPrismaService and
   * MatricNumberService for the full explanation of why a direct,
   * non-pooled connection is required for the lock to actually work.
   * See docs/CHANGELOG.md finding, Part 3 (race conditions).
   */
  private async generateApplicationNoInTransaction(
    tx: Prisma.TransactionClient,
    academicYear: string,
    admissionType: AdmissionType,
  ): Promise<string> {
    const prefix = `${academicYear.replace('/', '')}${admissionType.slice(0, 2).toUpperCase()}`;
    const lockKey = buildAdvisoryLockKey('applicant-no', prefix);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey}::bigint)`;
    const count = await tx.applicant.count({
      where: { applicationNo: { startsWith: prefix } },
    });
    return `${prefix}${String(count + 1).padStart(5, '0')}`;
  }

  // ── O'Level eligibility (deep-audit fix, Aug 2026) ─────────────────────────

  /**
   * Records/replaces an applicant's O'Level (WAEC/NECO/NABTEB/GCE) subject
   * results and returns the resulting eligibility evaluation. A full
   * replace, not a merge — the applicant/registrar resubmits the complete
   * result set each time (matching how CreateApplicantDto/jambScore work:
   * one authoritative current value, not an append-only log).
   */
  async recordOLevelResults(applicantId: string, dto: RecordOLevelResultsDto, actorId: string) {
    const applicant = await this.prisma.applicant.findUniqueOrThrow({
      where: { id: applicantId },
      include: { admissionCycle: true },
    });
    if (['MATRICULATED', 'REJECTED', 'WITHDRAWN'].includes(applicant.status)) {
      throw new UnprocessableEntityException({
        code: 'BUSINESS_RULE_INVALID_STATE',
        message: `Cannot record O'Level results for an application that is already ${applicant.status}`,
      });
    }

    await this.validateOLevelReferences(dto.results);
    const requirement = await this.prisma.admissionRequirement.findFirst({
      where: {
        programmeId: applicant.programmeChoice1Id,
        admissionType: applicant.admissionType,
        academicYear: applicant.admissionCycle.academicYear,
        isActive: true,
      },
      include: { subjectRequirements: true },
    });
    const eligibility = this.evaluateOLevelEligibility(dto.results, this.toOLevelPolicy(requirement));

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedApplicant = await tx.applicant.update({ where: { id: applicantId }, data: { oLevelResults: dto.results as unknown as Prisma.InputJsonValue } });
      const application = await tx.application.findUnique({ where: { applicantId } });
      if (application) {
        await tx.oLevelSitting.deleteMany({ where: { applicationId: application.id } });
        const groups = new Map<number, OLevelSubjectResultDto[]>();
        for (const row of dto.results) groups.set(row.sittingNumber, [...(groups.get(row.sittingNumber) ?? []), row]);
        for (const [sittingNumber, rows] of groups) {
          const first = rows[0];
          const sitting = await tx.oLevelSitting.create({ data: { applicationId: application.id, examType: first.examType as OLevelExamTypeEnum, examinationAuthorityId: first.examinationAuthorityId ?? null, examinationTypeId: first.examinationTypeId ?? null, candidateCategory: first.candidateCategory ?? null, examYear: first.examYear, sittingNumber, verificationStatus: VerificationStatus.UNDER_REVIEW } });
          await tx.oLevelSubject.createMany({ data: rows.map((r) => ({ sittingId: sitting.id, subjectId: r.subjectId ?? null, subject: r.subject!.trim(), grade: r.grade })) });
        }
        await tx.application.update({ where: { id: application.id }, data: { status: ApplicationStatus.DOCUMENT_REVIEW, lastSavedAt: new Date() } });
      }
      return updatedApplicant;
    });

    await this.audit.log({
      action: AuditAction.UPDATE, targetTable: 'applicants', targetId: applicantId,
      newValues: { oLevelResults: dto.results, oLevelEligible: eligibility.eligible },
    }, actorId);

    return { applicant: updated, eligibility };
  }

  async recordOLevelVerification(
    applicantId: string,
    status: VerificationStatus,
    actorId: string,
    remarks?: string,
  ) {
    const application = await this.prisma.application.findUniqueOrThrow({
      where: { applicantId },
      select: { id: true },
    });
    if (![VerificationStatus.PENDING, VerificationStatus.UNDER_REVIEW, VerificationStatus.VERIFIED, VerificationStatus.REJECTED].includes(status)) {
      throw new BadRequestException('Unsupported O\'Level verification status.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.oLevelSitting.updateMany({
        where: { applicationId: application.id },
        data: {
          verificationStatus: status,
          verifiedAt: status === VerificationStatus.VERIFIED ? new Date() : null,
          verifiedById: status === VerificationStatus.VERIFIED ? actorId : null,
          remarks: remarks ?? null,
        },
      });
      await tx.application.update({ where: { id: application.id }, data: { lastSavedAt: new Date() } });
      return result;
    });

    await this.audit.log({
      action: AuditAction.UPDATE,
      targetTable: 'olevel_sittings',
      targetId: application.id,
      newValues: { applicantId, status, remarks },
    }, actorId);
    return { ...updated, status };
  }

  /** Read-only eligibility check against verified O'Level results on file. */
  async checkOLevelEligibility(applicantId: string): Promise<OLevelEligibility> {
    const applicant = await this.prisma.applicant.findUniqueOrThrow({
      where: { id: applicantId },
      select: {
        oLevelResults: true,
        programmeChoice1Id: true,
        admissionType: true,
        admissionCycle: { select: { academicYear: true } },
        application: { select: { oLevelSittings: { include: { subjects: true } } } },
      },
    });
    const verifiedSittings = applicant.application?.oLevelSittings.filter((s) => s.verificationStatus === VerificationStatus.VERIFIED) ?? [];
    if (!verifiedSittings.length) {
      return {
        eligible: false,
        creditCount: 0,
        hasEnglish: false,
        hasMathematics: false,
        sittingsUsed: 0,
        reasons: applicant.oLevelResults
          ? ["O'Level results are recorded but have not been verified."]
          : ["No O'Level results recorded yet"],
      };
    }
    const requirement = await this.prisma.admissionRequirement.findFirst({
      where: {
        programmeId: applicant.programmeChoice1Id,
        admissionType: applicant.admissionType,
        academicYear: applicant.admissionCycle.academicYear,
        isActive: true,
      },
      include: { subjectRequirements: true },
    });
    const results = verifiedSittings.flatMap((s) => s.subjects.map((subject) => ({
      subject: subject.subject,
      grade: subject.grade as OLevelGradeEnum,
      examType: s.examType as unknown as OLevelExamTypeEnum,
      examYear: s.examYear,
      sittingNumber: s.sittingNumber,
    })));
    return this.evaluateOLevelEligibility(results, this.toOLevelPolicy(requirement));
  }

  /**
   * Convert a persisted admission requirement into the policy consumed by the
   * eligibility engine. The defaults preserve the institution's Nigerian
   * undergraduate baseline when a programme-specific row is absent.
   */
  private toOLevelPolicy(requirement?: OLevelPolicy | null): OLevelPolicy {
    return {
      minOLevelCredits: requirement?.minOLevelCredits ?? 5,
      maxOLevelSittings: requirement?.maxOLevelSittings ?? 2,
      requireEnglish: requirement?.requireEnglish ?? true,
      requireMathematics: requirement?.requireMathematics ?? true,
      subjectRequirements: requirement?.subjectRequirements ?? [],
    };
  }

  private normalizeSubject(subject: string): string {
    return subject.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  private parseSubjectAlternatives(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }

  /**
   * Evaluate combined O'Level results against the configured policy. Credit
   * counts are distinct by normalized subject, so English/Mathematics or any
   * other repeated subject across two sittings cannot inflate the total.
   */
  private evaluateOLevelEligibility(
    results: OLevelSubjectResultDto[],
    rawPolicy: OLevelPolicy = {},
  ): OLevelEligibility {
    const policy = this.toOLevelPolicy(rawPolicy);
    const CREDIT_GRADES = new Set(['A1', 'B2', 'B3', 'C4', 'C5', 'C6']);
    const creditedSubjects = new Map<string, string>();
    for (const result of results) {
      if (!CREDIT_GRADES.has(result.grade)) continue;
      const normalized = this.normalizeSubject(result.subject ?? '');
      if (normalized && !creditedSubjects.has(normalized)) creditedSubjects.set(normalized, result.subject!.trim());
    }

    const creditCount = creditedSubjects.size;
    const creditedNames = [...creditedSubjects.keys()];
    const hasEnglish = creditedNames.some((subject) => subject.includes('english'));
    const hasMathematics = creditedNames.some((subject) => subject.includes('math'));
    const sittingsUsed = new Set(results.map((r) => r.sittingNumber)).size;
    const reasons: string[] = [];

    if (creditCount < (policy.minOLevelCredits ?? 5)) {
      reasons.push(`Only ${creditCount} distinct credit subject(s) recorded (minimum ${policy.minOLevelCredits ?? 5} required)`);
    }
    if (policy.requireEnglish !== false && !hasEnglish) reasons.push('No credit pass in English Language');
    if (policy.requireMathematics !== false && !hasMathematics) reasons.push('No credit pass in Mathematics');
    if (sittingsUsed > (policy.maxOLevelSittings ?? 2)) {
      reasons.push(`Results span ${sittingsUsed} sittings (maximum ${policy.maxOLevelSittings ?? 2} permitted)`);
    }

    for (const requirement of policy.subjectRequirements ?? []) {
      if (!requirement.required) continue;
      const accepted = [requirement.subject, ...this.parseSubjectAlternatives(requirement.alternatives)]
        .map((subject) => this.normalizeSubject(subject))
        .filter(Boolean);
      const satisfied = accepted.some((subject) => creditedNames.some((credited) => credited === subject));
      if (!satisfied) {
        const alternatives = this.parseSubjectAlternatives(requirement.alternatives);
        const label = alternatives.length ? `${requirement.subject} (${alternatives.join(' or ')})` : requirement.subject;
        reasons.push(`Required O'Level subject credit missing: ${label}.`);
      }
    }

    const hasIneligibilityReason = reasons.some((reason) =>
      /Only \d+ distinct|No credit|Results span|Required O'Level subject credit missing/i.test(reason),
    );
    return {
      eligible: !hasIneligibilityReason,
      creditCount,
      hasEnglish,
      hasMathematics,
      sittingsUsed,
      reasons,
    };
  }
}

export interface OLevelEligibility {
  eligible: boolean;
  creditCount: number;
  hasEnglish: boolean;
  hasMathematics: boolean;
  sittingsUsed: number;
  reasons: string[];
}
