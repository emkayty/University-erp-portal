import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from "@nestjs/common";
import { AuditAction, Prisma, StudentStatus } from "@prisma/client";
import {
  computeDegreeAudit,
  evaluateAcademicStanding,
  evaluateProgression,
  resolveApplicablePolicyVersion,
  type AttemptInput,
  type DegreeAuditInput,
  type EquivalencyInput,
  type ExemptionInput,
  type GraduationRequirementInput,
  type GraduationRequirementType,
  type PriorStandingInput,
  type ProgressionPolicyRule,
  type RequirementGroupInput,
  type StandingPolicyRule,
  type SubstitutionInput,
  type TransferInput,
} from "@uniportal/utils";

import { AuditService } from "../../common/audit/audit.service";
import { RlsContextService } from "../../common/rls/rls-context.service";
import { PrismaService } from "../../database/prisma.service";
import type {
  CreateGraduationPolicyDto,
  DecideAcademicAppealDto,
  DecideAcademicInterruptionDto,
  DecideProgrammeTransferDto,
  IssueAcademicCredentialDto,
  RequestAcademicInterruptionDto,
  RequestProgrammeTransferDto,
  SubmitAcademicAppealDto,
} from "./dto/academic-lifecycle.dto";

type RuleDefinition = Record<string, unknown>;

type RequirementCatalogEntry = {
  curriculumRequirementId: string;
  requirementGroupId: string;
  courseId: string;
  code: string;
  title: string;
  creditUnits: number;
  level: number;
  semester: string;
  isCompulsory: boolean;
};

type OutstandingCourse = Pick<
  RequirementCatalogEntry,
  | "courseId"
  | "code"
  | "title"
  | "creditUnits"
  | "level"
  | "semester"
  | "isCompulsory"
>;

const PROGRESSION_POLICY_TYPE = "PROGRESSION";
const STANDING_POLICY_TYPE = "ACADEMIC_STANDING";
const GRADUATION_POLICY_TYPE = "GRADUATION_REQUIREMENTS";
const APPROVED = "APPROVED";
const ACTIVE = "ACTIVE";
const SUSPENSION_RECOMMENDED = "SUSPENSION_RECOMMENDED";

/**
 * Orchestrates the immutable academic decision record around the pure domain
 * engine. It deliberately keeps evaluation and application distinct: an
 * evaluation can recommend an academic consequence, but only a separately
 * authorized application changes the student operational record.
 */
@Injectable()
export class AcademicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rlsContext: RlsContextService,
  ) {}

  async listGraduationPolicies(
    scope?: CreateGraduationPolicyDto["scope"],
    scopeId?: string,
  ) {
    return this.prisma
      .forRequest(this.rlsContext)
      .academicPolicyVersion.findMany({
        where: {
          policyType: GRADUATION_POLICY_TYPE,
          ...(scope ? { scope } : {}),
          ...(scopeId ? { scopeId } : {}),
        },
        orderBy: [
          { scope: "asc" },
          { priority: "desc" },
          { effectiveFrom: "desc" },
        ],
      });
  }

  async createGraduationPolicy(
    dto: CreateGraduationPolicyDto,
    actorId: string,
  ) {
    if (dto.scope === "INSTITUTION" && dto.scopeId) {
      throw new BadRequestException(
        "Institution-scoped graduation policies must not include scopeId.",
      );
    }
    if (dto.scope !== "INSTITUTION" && !dto.scopeId) {
      throw new BadRequestException(
        "Faculty, department, and programme graduation policies require scopeId.",
      );
    }
    const requirements = this.parseGraduationRequirementsRule(
      dto.ruleDefinition,
      0,
    );
    const effectiveFrom = dto.effectiveFrom
      ? new Date(dto.effectiveFrom)
      : new Date();
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
    if (
      Number.isNaN(effectiveFrom.getTime()) ||
      (effectiveTo &&
        (Number.isNaN(effectiveTo.getTime()) || effectiveTo <= effectiveFrom))
    ) {
      throw new BadRequestException(
        "Graduation-policy effective dates are invalid or out of order.",
      );
    }
    const policy = await this.prisma.runExclusive(this.rlsContext, async (tx) =>
      tx.academicPolicyVersion.create({
        data: {
          policyType: GRADUATION_POLICY_TYPE,
          scope: dto.scope,
          scopeId: dto.scopeId,
          priority: dto.priority ?? 0,
          ruleDefinition: {
            ...dto.ruleDefinition,
            requirements,
          } as unknown as Prisma.InputJsonValue,
          approvalStatus: "DRAFT",
          effectiveFrom,
          effectiveTo,
          createdById: actorId,
        },
      }),
    );
    await this.audit.log(
      {
        action: AuditAction.CREATE,
        targetTable: "academic_policy_versions",
        targetId: policy.id,
        newValues: {
          policyType: GRADUATION_POLICY_TYPE,
          scope: policy.scope,
          scopeId: policy.scopeId,
          approvalStatus: policy.approvalStatus,
        },
      },
      actorId,
    );
    return policy;
  }

  async activateGraduationPolicy(policyId: string, actorId: string) {
    const policy = await this.prisma.runExclusive(
      this.rlsContext,
      async (tx) => {
        const current = await tx.academicPolicyVersion.findUniqueOrThrow({
          where: { id: policyId },
        });
        if (current.policyType !== GRADUATION_POLICY_TYPE) {
          throw new BadRequestException(
            "Only graduation-requirement policies can be activated through this endpoint.",
          );
        }
        if (current.approvalStatus !== "DRAFT") {
          throw new BadRequestException(
            "Only draft graduation policies can be activated.",
          );
        }
        const now = new Date();
        if (current.effectiveTo && current.effectiveTo <= now) {
          throw new BadRequestException(
            "The graduation policy effective period has expired.",
          );
        }
        const floorWhere =
          current.scope === "PROGRAMME"
            ? { id: current.scopeId ?? undefined }
            : current.scope === "DEPARTMENT"
              ? { departmentId: current.scopeId ?? undefined }
              : current.scope === "FACULTY"
                ? { department: { facultyId: current.scopeId ?? undefined } }
                : {};
        const programmeFloors = await tx.programme.findMany({
          where: floorWhere,
          select: { minCreditUnits: true },
        });
        const minimumCreditFloor = programmeFloors.reduce(
          (floor, programme) => Math.max(floor, programme.minCreditUnits),
          0,
        );
        this.parseGraduationRequirementsRule(
          current.ruleDefinition,
          minimumCreditFloor,
        );
        await tx.academicPolicyVersion.updateMany({
          where: {
            policyType: GRADUATION_POLICY_TYPE,
            scope: current.scope,
            scopeId: current.scopeId,
            approvalStatus: "ACTIVE",
            id: { not: current.id },
          },
          data: { approvalStatus: "EXPIRED", effectiveTo: now },
        });
        return tx.academicPolicyVersion.update({
          where: { id: current.id },
          data: {
            approvalStatus: "ACTIVE",
            approvedById: actorId,
            approvedAt: now,
          },
        });
      },
    );
    await this.audit.log(
      {
        action: AuditAction.UPDATE,
        targetTable: "academic_policy_versions",
        targetId: policy.id,
        newValues: {
          approvalStatus: policy.approvalStatus,
          approvedById: actorId,
        },
      },
      actorId,
    );
    return policy;
  }

  async getJourneyForUser(userId: string) {
    const db = this.prisma.forRequest(this.rlsContext);
    const student = await db.student.findUniqueOrThrow({
      where: { userId },
    });
    return this.getJourney(student.id, db);
  }

  async getJourney(
    studentId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma.forRequest(
      this.rlsContext,
    ),
  ) {
    const student = await db.student.findUniqueOrThrow({
      where: { id: studentId },
      include: {
        programme: { include: { department: { include: { faculty: true } } } },
        curriculumVersion: true,
        academicHistory: { orderBy: { periodKey: "asc" } },
        courseRegs: {
          include: {
            courseOffering: { include: { course: true, semesterModel: true } },
          },
          orderBy: { registeredAt: "desc" },
          take: 100,
        },
        results: {
          where: { status: "SENATE_PUBLISHED" },
          include: {
            courseOffering: { include: { course: true } },
            semester: true,
          },
          orderBy: [
            { semester: { academicYear: "asc" } },
            { createdAt: "asc" },
          ],
        },
        graduationCandidates: { orderBy: { createdAt: "desc" }, take: 3 },
      },
    });
    const [degreeAudit, academicPlan] = await Promise.all([
      this.latestAudit(studentId, student.curriculumVersionId, db),
      this.latestPlan(studentId, student.curriculumVersionId, db),
    ]);
    const outstanding = this.outstandingForJourney(
      degreeAudit?.policySnapshot,
      degreeAudit?.requirementResults,
      student.results,
    );
    const outstandingRequirementGroups = this.unmetGroupsForJourney(
      degreeAudit?.policySnapshot,
      degreeAudit?.requirementResults,
    );
    const credits = Number(student.totalCreditUnitsEarned);
    const required = student.programme.minCreditUnits;

    return {
      student: {
        id: student.id,
        matricNo: student.matricNo,
        firstName: student.firstName,
        lastName: student.lastName,
        level: student.level,
        status: student.status,
      },
      programme: {
        id: student.programme.id,
        code: student.programme.code,
        name: student.programme.name,
        degreeType: student.programme.degreeType,
        department: student.programme.department.name,
        faculty: student.programme.department.faculty.name,
      },
      curriculum: {
        id: student.curriculumVersion.id,
        academicYear: student.curriculumVersion.academicYear,
        version: student.curriculumVersion.version,
        status: student.curriculumVersion.status,
      },
      progress: {
        cgpa: Number(student.cgpa),
        creditsEarned: credits,
        creditsRequired: required,
        percent: required
          ? Math.min(100, Math.round((credits / required) * 100))
          : 0,
        outstandingCourses: outstanding.length,
        outstandingRequirementGroups,
      },
      history: student.academicHistory,
      currentCourses: student.courseRegs
        .filter((registration) => registration.status === "REGISTERED")
        .map((registration) => ({
          id: registration.id,
          courseId: registration.courseOffering.courseId,
          code: registration.courseOffering.course.code,
          title: registration.courseOffering.course.title,
          credits: registration.courseOffering.course.creditUnits,
          semester: registration.courseOffering.semesterModel.name,
        })),
      results: student.results.slice(-20).map((result) => ({
        id: result.id,
        code: result.courseOffering.course.code,
        title: result.courseOffering.course.title,
        score: Number(result.score),
        grade: result.grade,
        gradePoint: Number(result.gradePoint),
        credits: result.creditUnits,
        semester: result.semester.name,
        academicYear: result.semester.academicYear,
      })),
      outstanding,
      degreeAudit: degreeAudit
        ? {
            id: degreeAudit.id,
            status: degreeAudit.status,
            snapshot: degreeAudit.requirementResults,
            auditedAt: degreeAudit.createdAt,
          }
        : null,
      academicPlan,
      graduation: student.graduationCandidates[0] ?? null,
    };
  }

  async getLatestDegreeAuditForUser(userId: string) {
    const db = this.prisma.forRequest(this.rlsContext);
    const student = await db.student.findUniqueOrThrow({
      where: { userId },
      select: { id: true, curriculumVersionId: true },
    });
    return this.latestAudit(student.id, student.curriculumVersionId, db);
  }

  async getPlanForUser(userId: string) {
    const db = this.prisma.forRequest(this.rlsContext);
    const student = await db.student.findUniqueOrThrow({
      where: { userId },
      select: { id: true, curriculumVersionId: true },
    });
    return this.latestPlan(student.id, student.curriculumVersionId, db);
  }

  /**
   * Builds a degree audit and its successor plan atomically. The transaction
   * lock covers the student/curriculum pair, and the database also has a
   * partial unique index for an additional cross-process safety guarantee.
   */
  async runDegreeAudit(studentId: string, actorId: string) {
    const result = await this.prisma.runExclusive(
      this.rlsContext,
      async (tx) => {
        const lockKey = `academic-plan:${studentId}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

        const student = await tx.student.findUniqueOrThrow({
          where: { id: studentId },
          include: {
            programme: {
              include: { department: { include: { faculty: true } } },
            },
            curriculumVersion: true,
            results: {
              where: { status: "SENATE_PUBLISHED" },
              include: { courseOffering: { include: { course: true } } },
            },
          },
        });
        const programmeCourses = await tx.programmeCourse.findMany({
          where: { curriculumVersionId: student.curriculumVersionId },
          include: { course: true },
          orderBy: [
            { level: "asc" },
            { semester: "asc" },
            { course: { code: "asc" } },
          ],
        });
        const groups = await tx.academicRequirementGroup.findMany({
          where: { curriculumVersionId: student.curriculumVersionId },
          include: { requirements: { include: { course: true } } },
          orderBy: { code: "asc" },
        });
        const now = new Date();
        const exemptions = await tx.academicExemption.findMany({
          where: {
            studentId,
            status: APPROVED,
            approvedById: { not: null },
            approvedAt: { not: null },
          },
          select: { id: true, curriculumRequirementId: true },
        });
        const substitutions = await tx.academicSubstitution.findMany({
          where: {
            studentId,
            status: APPROVED,
            approvedById: { not: null },
            approvedAt: { not: null },
          },
          select: {
            id: true,
            curriculumRequirementId: true,
            substituteCourseId: true,
          },
        });
        const transfers = await tx.academicTransferCredit.findMany({
          where: {
            studentId,
            status: APPROVED,
            approvedById: { not: null },
            approvedAt: { not: null },
          },
          select: { id: true, creditUnits: true, mappedCourseId: true },
        });
        const equivalencies = await tx.courseEquivalency.findMany({
          where: {
            effectiveFrom: { lte: now },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
            approvedById: { not: null },
          },
          select: {
            id: true,
            fromCourseId: true,
            toCourseId: true,
            direction: true,
          },
        });
        const graduationPolicies =
          (await tx.academicPolicyVersion.findMany({
            where: {
              policyType: GRADUATION_POLICY_TYPE,
              approvalStatus: ACTIVE,
              approvedById: { not: null },
              approvedAt: { not: null },
              effectiveFrom: { lte: now },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
            },
            select: {
              id: true,
              policyType: true,
              scope: true,
              scopeId: true,
              priority: true,
              effectiveFrom: true,
              approvalStatus: true,
              ruleDefinition: true,
            },
          })) ?? [];

        const { requirementGroups, catalog } = this.buildRequirementCatalog(
          groups,
          programmeCourses,
          student.curriculumVersionId,
          student.programme.minCreditUnits,
        );
        const requirementIds = new Set(
          catalog.map((entry) => entry.curriculumRequirementId),
        );
        const curriculumCourseIds = new Set(
          catalog.map((entry) => entry.courseId),
        );
        const applicableExemptions = exemptions.filter((record) =>
          requirementIds.has(record.curriculumRequirementId),
        );
        const applicableSubstitutions = substitutions.filter(
          (record) =>
            requirementIds.has(record.curriculumRequirementId) &&
            curriculumCourseIds.has(record.substituteCourseId),
        );
        const applicableTransfers = transfers.filter(
          (record) =>
            !record.mappedCourseId ||
            curriculumCourseIds.has(record.mappedCourseId),
        );
        const applicableEquivalencies = equivalencies.filter(
          (record) =>
            curriculumCourseIds.has(record.fromCourseId) ||
            curriculumCourseIds.has(record.toCourseId),
        );
        const graduationPolicy = this.selectGraduationPolicy(
          graduationPolicies,
          {
            programmeId: student.programmeId,
            departmentId: student.programme.departmentId,
            facultyId: student.programme.department.facultyId,
          },
        );
        const graduationRequirements = graduationPolicy
          ? this.parseGraduationRequirementsRule(
              graduationPolicy.ruleDefinition,
              student.programme.minCreditUnits,
            )
          : this.defaultGraduationRequirements(
              student.programme.minCreditUnits,
            );
        const attempts: AttemptInput[] = student.results.map((record) => ({
          courseAttemptId: record.id,
          courseId: record.courseOffering.courseId,
          creditUnits: record.creditUnits,
          grade: record.grade,
          outcome: record.grade.toUpperCase() === "F" ? "FAILED" : "PASSED",
          attemptNumber: record.attemptNumber,
          gradePoint: Number(record.gradePoint),
          countsTowardCredits: record.grade.toUpperCase() !== "F",
        }));
        const auditInput: DegreeAuditInput = {
          attempts,
          exemptions: applicableExemptions.map((record): ExemptionInput => ({
            curriculumRequirementId: record.curriculumRequirementId,
          })),
          substitutions: applicableSubstitutions.map(
            (record): SubstitutionInput => ({
              originalCurriculumRequirementId: record.curriculumRequirementId,
              substituteCourseId: record.substituteCourseId,
            }),
          ),
          transfers: applicableTransfers.map((record): TransferInput => ({
            creditTransferId: record.id,
            creditUnits: record.creditUnits,
            approvalStatus: APPROVED,
            mappedCourseId: record.mappedCourseId ?? undefined,
          })),
          equivalencies: applicableEquivalencies.map(
            (record): EquivalencyInput => ({
              fromCourseId: record.fromCourseId,
              toCourseId: record.toCourseId,
              direction: record.direction as EquivalencyInput["direction"],
            }),
          ),
          requirementGroups,
          graduationRequirements,
          courseRepeatPolicy: "REPLACE",
          currentCgpa: Number(student.cgpa),
          totalElapsedYears: Math.max(
            0,
            new Date().getFullYear() -
              Number(student.entryAcademicYear.slice(0, 4)),
          ),
        };
        const engineResult = computeDegreeAudit(auditInput);
        const outstanding = this.outstandingFromEngine(engineResult, catalog);
        const unmetRequirementGroups = engineResult.requirementGroupResults
          .filter((group) => !group.satisfied || group.needsReview)
          .map((group) => ({
            requirementGroupId: group.requirementGroupId,
            unmetReasons: group.unmetReasons,
            unmetRequirementIds: group.unmetRequirementIds,
            needsReview: group.needsReview,
          }));
        const policySnapshot = {
          source: "academic-domain-engine",
          curriculumVersionId: student.curriculumVersionId,
          generatedAt: now.toISOString(),
          requirementCatalog: catalog,
          exceptionSourceIds: {
            exemptionIds: applicableExemptions.map((record) => record.id),
            substitutionIds: applicableSubstitutions.map((record) => record.id),
            transferCreditIds: applicableTransfers.map((record) => record.id),
            equivalencyIds: applicableEquivalencies.map((record) => record.id),
          },
          unmetRequirementGroups,
          graduationPolicyVersionId: graduationPolicy?.id ?? null,
          graduationRequirements,
        };
        const audit = await tx.degreeAudit.create({
          data: {
            studentId,
            curriculumVersionId: student.curriculumVersionId,
            status: engineResult.overallStatus,
            requirementResults:
              engineResult as unknown as Prisma.InputJsonValue,
            policySnapshot: policySnapshot as unknown as Prisma.InputJsonValue,
            auditedById: actorId,
          },
        });
        const plan = await this.replaceAcademicPlan(
          tx,
          studentId,
          student.curriculumVersionId,
          audit.id,
          outstanding,
          unmetRequirementGroups,
        );
        return { audit, plan };
      },
    );

    await this.audit.log(
      {
        action: AuditAction.UPDATE,
        targetTable: "degree_audits",
        targetId: result.audit.id,
        newValues: {
          status: result.audit.status,
          studentId,
          academicPlanId: result.plan.id,
        },
      },
      actorId,
    );
    return result.audit;
  }

  /**
   * Resolves institution/faculty/department/programme policies, then persists
   * a single immutable evaluation per student period and selected policy.
   */
  async runProgression(studentId: string, actorId: string) {
    const result = await this.prisma.runExclusive(
      this.rlsContext,
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`academic-progression:${studentId}`}))`;
        const student = await tx.student.findUniqueOrThrow({
          where: { id: studentId },
          include: {
            programme: {
              include: { department: { include: { faculty: true } } },
            },
            academicHistory: { orderBy: { startDate: "desc" }, take: 1 },
          },
        });
        const latest = student.academicHistory[0];
        if (!latest) {
          throw new BadRequestException(
            "No academic period record exists for progression evaluation.",
          );
        }
        const now = new Date();
        const policyRows = await tx.academicPolicyVersion.findMany({
          where: {
            policyType: { in: [PROGRESSION_POLICY_TYPE, STANDING_POLICY_TYPE] },
            approvalStatus: ACTIVE,
            approvedById: { not: null },
            approvedAt: { not: null },
            effectiveFrom: { lte: now },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
          },
        });
        const context = {
          programmeId: student.programmeId,
          departmentId: student.programme.departmentId,
          facultyId: student.programme.department.facultyId,
        };
        const selectPolicy = (policyType: string) => {
          const candidates = policyRows
            .filter((row) => row.policyType === policyType)
            .map((row) => ({
              id: row.id,
              scope: row.scope,
              scopeId: row.scopeId,
              priority: row.priority,
              effectiveFrom: row.effectiveFrom.toISOString(),
              approvalStatus: row.approvalStatus,
            }));
          const winner = resolveApplicablePolicyVersion(candidates, context);
          if (!winner) {
            throw new UnprocessableEntityException({
              code: "ACADEMIC_POLICY_NOT_CONFIGURED",
              message: `No active ${policyType} policy applies to this student's programme context.`,
            });
          }
          const record = policyRows.find((row) => row.id === winner.id);
          if (!record)
            throw new BadRequestException(
              `Selected ${policyType} policy record cannot be loaded.`,
            );
          return record;
        };
        const progressionPolicy = selectPolicy(PROGRESSION_POLICY_TYPE);
        const standingPolicy = selectPolicy(STANDING_POLICY_TYPE);
        const period = {
          creditUnitsAttempted: latest.creditUnitsAttempted,
          creditUnitsEarned: latest.creditUnitsEarned,
          gpa: Number(latest.gpa ?? 0),
          cgpa: Number(latest.cgpa ?? student.cgpa),
          failedCourseCount: latest.failedCourseCount,
        };
        const progressionRule = this.parseProgressionRule(
          progressionPolicy.ruleDefinition,
        );
        const standingRule = this.parseStandingRule(
          standingPolicy.ruleDefinition,
        );
        const priorStandingRows = await tx.academicStanding.findMany({
          where: { studentId, academicHistoryId: { not: latest.id } },
          include: { academicHistory: { select: { startDate: true } } },
          orderBy: { createdAt: "desc" },
        });
        const seenHistoryIds = new Set<string>();
        const priorStandings: PriorStandingInput[] = priorStandingRows
          .filter((record) => {
            if (seenHistoryIds.has(record.academicHistoryId)) return false;
            seenHistoryIds.add(record.academicHistoryId);
            return [
              "GOOD_STANDING",
              "WARNING",
              "PROBATION",
              SUSPENSION_RECOMMENDED,
            ].includes(record.standing);
          })
          .map((record) => ({
            standing: record.standing as PriorStandingInput["standing"],
            periodSequence: record.academicHistory.startDate.getTime(),
          }));

        const existingEvaluation = await tx.progressionEvaluation.findUnique({
          where: {
            studentId_academicHistoryId_policyVersionId: {
              studentId,
              academicHistoryId: latest.id,
              policyVersionId: progressionPolicy.id,
            },
          },
        });
        const existingStanding = await tx.academicStanding.findUnique({
          where: {
            studentId_academicHistoryId_policyVersionId: {
              studentId,
              academicHistoryId: latest.id,
              policyVersionId: standingPolicy.id,
            },
          },
        });
        if (existingEvaluation && existingStanding) {
          let placement = await tx.academicPlacement.findUnique({
            where: { sourceProgressionEvaluationId: existingEvaluation.id },
          });
          if (!placement) {
            const decision =
              existingStanding.standing === SUSPENSION_RECOMMENDED
                ? "SUSPEND"
                : existingEvaluation.recommendedAction;
            placement = await tx.academicPlacement.create({
              data: {
                studentId,
                sourceProgressionEvaluationId: existingEvaluation.id,
                academicYear: latest.academicYear,
                fromLevel: student.level,
                toLevel:
                  decision === "PROMOTE" ||
                  decision === "PROMOTE_WITH_CARRYOVER"
                    ? student.level + 100
                    : student.level,
                decision,
                status: "RECOMMENDED",
                reason:
                  "Placement backfilled from an existing progression and standing decision.",
                policySnapshot: {
                  progressionPolicyVersionId: progressionPolicy.id,
                  standingPolicyVersionId: standingPolicy.id,
                  progressionRule,
                  standingRule,
                } as unknown as Prisma.InputJsonValue,
                effectiveDate: latest.endDate ?? now,
              },
            });
          }
          return {
            progression: existingEvaluation,
            standing: existingStanding,
            placement,
          };
        }

        const progression = evaluateProgression(period, progressionRule);
        const standing = evaluateAcademicStanding(
          period,
          priorStandings,
          standingRule,
        );
        const evaluation = await tx.progressionEvaluation.create({
          data: {
            studentId,
            academicHistoryId: latest.id,
            policyVersionId: progressionPolicy.id,
            outcome: progression.outcome,
            recommendedAction: progression.recommendedAction,
            reasons: progression.reasons,
            evaluatedById: actorId,
            policySnapshot: {
              policyVersionId: progressionPolicy.id,
              policyType: progressionPolicy.policyType,
              scope: progressionPolicy.scope,
              scopeId: progressionPolicy.scopeId,
              ruleDefinition: progressionRule,
            } as unknown as Prisma.InputJsonValue,
          },
        });
        const standingRecord = await tx.academicStanding.create({
          data: {
            studentId,
            academicHistoryId: latest.id,
            policyVersionId: standingPolicy.id,
            standing: standing.standing,
            reasons: standing.reasons,
            determinedById: actorId,
            policySnapshot: {
              policyVersionId: standingPolicy.id,
              policyType: standingPolicy.policyType,
              scope: standingPolicy.scope,
              scopeId: standingPolicy.scopeId,
              ruleDefinition: standingRule,
              priorStandingCount: priorStandings.length,
            } as unknown as Prisma.InputJsonValue,
          },
        });

        const placementDecision =
          standing.standing === SUSPENSION_RECOMMENDED
            ? "SUSPEND"
            : progression.recommendedAction;
        const placement = await tx.academicPlacement.create({
          data: {
            studentId,
            sourceProgressionEvaluationId: evaluation.id,
            academicYear: latest.academicYear,
            fromLevel: student.level,
            toLevel:
              placementDecision === "PROMOTE" ||
              placementDecision === "PROMOTE_WITH_CARRYOVER"
                ? student.level + 100
                : student.level,
            decision: placementDecision,
            status: "RECOMMENDED",
            reason: [...progression.reasons, ...standing.reasons].join(" | "),
            policySnapshot: {
              progressionPolicyVersionId: progressionPolicy.id,
              standingPolicyVersionId: standingPolicy.id,
              progressionRule,
              standingRule,
            } as unknown as Prisma.InputJsonValue,
            effectiveDate: latest.endDate ?? now,
          },
        });
        return { progression: evaluation, standing: standingRecord, placement };
      },
    );

    await this.audit.log(
      {
        action: AuditAction.UPDATE,
        targetTable: "progression_evaluations",
        targetId: result.progression.id,
        newValues: {
          outcome: result.progression.outcome,
          recommendedAction: result.progression.recommendedAction,
          placementId: result.placement?.id ?? null,
        },
      },
      actorId,
    );
    return result;
  }

  /**
   * Applies a recommended placement after an authorized academic officer has
   * independently reviewed it. This is the only lifecycle operation that
   * changes student level/status, keeping recommendations from silently
   * becoming operative academic sanctions.
   */
  async applyPlacement(placementId: string, actorId: string) {
    const applied = await this.prisma.runExclusive(
      this.rlsContext,
      async (tx) => {
        const placement = await tx.academicPlacement.findUniqueOrThrow({
          where: { id: placementId },
        });
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`academic-placement:${placement.studentId}`}))`;
        if (!["RECOMMENDED", "APPROVED"].includes(placement.status)) {
          throw new ConflictException(
            `Academic placement is ${placement.status} and cannot be applied.`,
          );
        }
        const student = await tx.student.findUniqueOrThrow({
          where: { id: placement.studentId },
        });
        let status: StudentStatus;
        switch (placement.decision) {
          case "SUSPEND":
            status = StudentStatus.SUSPENDED;
            break;
          case "REPEAT_PLACEMENT":
            status = StudentStatus.REPEATING;
            break;
          case "PROMOTE":
          case "PROMOTE_WITH_CARRYOVER":
            status = StudentStatus.ACTIVE;
            break;
          default:
            throw new BadRequestException(
              `Unsupported academic placement decision: ${placement.decision}`,
            );
        }
        await tx.student.update({
          where: { id: student.id },
          data: { level: placement.toLevel, status },
        });
        return tx.academicPlacement.update({
          where: { id: placement.id },
          data: {
            status: "APPLIED",
            approvedById: actorId,
            appliedById: actorId,
            appliedAt: new Date(),
          },
        });
      },
    );

    await this.audit.log(
      {
        action: AuditAction.UPDATE,
        targetTable: "academic_placements",
        targetId: applied.id,
        newValues: {
          status: applied.status,
          decision: applied.decision,
          appliedById: actorId,
        },
      },
      actorId,
    );
    return applied;
  }

  async submitAppealForUser(userId: string, dto: SubmitAcademicAppealDto) {
    const student = await this.prisma.student.findUniqueOrThrow({
      where: { userId },
      select: { id: true },
    });
    const appeal = await this.prisma.academicAppeal.create({
      data: {
        studentId: student.id,
        appealType: dto.appealType.trim().toUpperCase(),
        subjectId: dto.subjectId,
        reason: dto.reason.trim(),
        evidenceRef: dto.evidenceRef,
        status: "SUBMITTED",
      },
    });
    await this.audit.log(
      {
        action: AuditAction.CREATE,
        targetTable: "academic_appeals",
        targetId: appeal.id,
        newValues: { studentId: student.id, appealType: appeal.appealType },
      },
      userId,
    );
    return appeal;
  }

  async decideAppeal(
    appealId: string,
    dto: DecideAcademicAppealDto,
    actorId: string,
  ) {
    const appeal = await this.prisma.runExclusive(
      this.rlsContext,
      async (tx) => {
        const current = await tx.academicAppeal.findUniqueOrThrow({
          where: { id: appealId },
        });
        if (current.status !== "SUBMITTED") {
          throw new ConflictException(
            `Academic appeal is ${current.status} and cannot be decided again.`,
          );
        }
        return tx.academicAppeal.update({
          where: { id: current.id },
          data: {
            status: dto.decision,
            decision: dto.rationale.trim(),
            decidedById: actorId,
            decidedAt: new Date(),
          },
        });
      },
    );
    await this.audit.log(
      {
        action: AuditAction.UPDATE,
        targetTable: "academic_appeals",
        targetId: appeal.id,
        newValues: { status: appeal.status, decidedById: actorId },
      },
      actorId,
    );
    return appeal;
  }

  async requestProgrammeTransferForUser(
    userId: string,
    dto: RequestProgrammeTransferDto,
  ) {
    const student = await this.prisma.student.findUniqueOrThrow({
      where: { userId },
      select: { id: true, programmeId: true },
    });
    if (student.programmeId === dto.toProgrammeId) {
      throw new BadRequestException(
        "The requested programme is already the student's current programme.",
      );
    }
    const request = await this.prisma.runExclusive(
      this.rlsContext,
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`programme-transfer:${student.id}`}))`;
        await tx.programme.findUniqueOrThrow({
          where: { id: dto.toProgrammeId },
          select: { id: true },
        });
        const open = await tx.programmeTransferRequest.findFirst({
          where: {
            studentId: student.id,
            status: { in: ["SUBMITTED", "UNDER_REVIEW"] },
          },
          select: { id: true },
        });
        if (open)
          throw new ConflictException(
            "An open programme transfer request already exists for this student.",
          );
        return tx.programmeTransferRequest.create({
          data: {
            studentId: student.id,
            fromProgrammeId: student.programmeId,
            toProgrammeId: dto.toProgrammeId,
            status: "SUBMITTED",
            reason: dto.reason?.trim(),
          },
        });
      },
    );
    await this.audit.log(
      {
        action: AuditAction.CREATE,
        targetTable: "programme_transfer_requests",
        targetId: request.id,
        newValues: { studentId: student.id, toProgrammeId: dto.toProgrammeId },
      },
      userId,
    );
    return request;
  }

  async decideProgrammeTransfer(
    requestId: string,
    dto: DecideProgrammeTransferDto,
    actorId: string,
  ) {
    const request = await this.prisma.runExclusive(
      this.rlsContext,
      async (tx) => {
        const current = await tx.programmeTransferRequest.findUniqueOrThrow({
          where: { id: requestId },
        });
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`programme-transfer:${current.studentId}`}))`;
        if (!["SUBMITTED", "UNDER_REVIEW"].includes(current.status)) {
          throw new ConflictException(
            `Programme transfer request is ${current.status} and cannot be decided again.`,
          );
        }
        if (dto.decision === "APPROVED") {
          const currentStudent = await tx.student.findUniqueOrThrow({
            where: { id: current.studentId },
            select: { programmeId: true },
          });
          if (currentStudent.programmeId !== current.fromProgrammeId) {
            throw new ConflictException(
              "The student programme changed after this transfer request was submitted. Re-open the request before approving it.",
            );
          }
          const targetProgramme = await tx.programme.findUniqueOrThrow({
            where: { id: current.toProgrammeId },
            select: { id: true, departmentId: true },
          });
          const targetCurriculum = await tx.curriculumVersion.findFirst({
            where: { programmeId: targetProgramme.id, status: "ACTIVE" },
            orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
            select: { id: true },
          });
          if (!targetCurriculum) {
            throw new UnprocessableEntityException({
              code: "TARGET_CURRICULUM_NOT_CONFIGURED",
              message:
                "The target programme has no active curriculum version; transfer cannot be applied.",
            });
          }
          await tx.student.update({
            where: { id: current.studentId },
            data: {
              programmeId: targetProgramme.id,
              departmentId: targetProgramme.departmentId,
              curriculumVersionId: targetCurriculum.id,
            },
          });
        }
        return tx.programmeTransferRequest.update({
          where: { id: current.id },
          data: {
            status: dto.decision,
            mappedCredits: dto.mappedCredits,
            decisionNote: dto.decisionNote?.trim(),
            decidedById: actorId,
            decidedAt: new Date(),
          },
        });
      },
    );
    await this.audit.log(
      {
        action: AuditAction.UPDATE,
        targetTable: "programme_transfer_requests",
        targetId: request.id,
        newValues: {
          status: request.status,
          mappedCredits: request.mappedCredits,
        },
      },
      actorId,
    );
    return request;
  }

  async requestInterruptionForUser(
    userId: string,
    dto: RequestAcademicInterruptionDto,
  ) {
    const startDate = new Date(dto.startDate);
    const endDate = dto.endDate ? new Date(dto.endDate) : null;
    if (endDate && endDate < startDate)
      throw new BadRequestException(
        "Interruption end date cannot precede its start date.",
      );
    const student = await this.prisma.student.findUniqueOrThrow({
      where: { userId },
      select: { id: true },
    });
    const interruption = await this.prisma.runExclusive(
      this.rlsContext,
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`academic-interruption:${student.id}`}))`;
        const open = await tx.academicInterruption.findFirst({
          where: {
            studentId: student.id,
            status: { in: ["REQUESTED", "APPROVED"] },
          },
          select: { id: true },
        });
        if (open)
          throw new ConflictException(
            "An active academic interruption request already exists for this student.",
          );
        return tx.academicInterruption.create({
          data: {
            studentId: student.id,
            type: dto.type.trim().toUpperCase(),
            startDate,
            endDate,
            reason: dto.reason?.trim(),
            status: "REQUESTED",
          },
        });
      },
    );
    await this.audit.log(
      {
        action: AuditAction.CREATE,
        targetTable: "academic_interruptions",
        targetId: interruption.id,
        newValues: { studentId: student.id, type: interruption.type },
      },
      userId,
    );
    return interruption;
  }

  async decideInterruption(
    interruptionId: string,
    dto: DecideAcademicInterruptionDto,
    actorId: string,
  ) {
    const interruption = await this.prisma.runExclusive(
      this.rlsContext,
      async (tx) => {
        const current = await tx.academicInterruption.findUniqueOrThrow({
          where: { id: interruptionId },
        });
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`academic-interruption:${current.studentId}`}))`;
        if (current.status !== "REQUESTED") {
          throw new ConflictException(
            `Academic interruption is ${current.status} and cannot be decided again.`,
          );
        }
        if (dto.decision === "APPROVED") {
          await tx.student.update({
            where: { id: current.studentId },
            data: { status: StudentStatus.DEFERRED },
          });
        }
        return tx.academicInterruption.update({
          where: { id: current.id },
          data: {
            status: dto.decision,
            decidedById: actorId,
            decidedAt: new Date(),
          },
        });
      },
    );
    await this.audit.log(
      {
        action: AuditAction.UPDATE,
        targetTable: "academic_interruptions",
        targetId: interruption.id,
        newValues: { status: interruption.status },
      },
      actorId,
    );
    return interruption;
  }

  async resumeInterruption(interruptionId: string, actorId: string) {
    const interruption = await this.prisma.runExclusive(
      this.rlsContext,
      async (tx) => {
        const current = await tx.academicInterruption.findUniqueOrThrow({
          where: { id: interruptionId },
        });
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`academic-interruption:${current.studentId}`}))`;
        if (current.status !== "APPROVED") {
          throw new ConflictException(
            `Academic interruption is ${current.status} and cannot be resumed.`,
          );
        }
        const now = new Date();
        if (current.endDate && current.endDate > now) {
          throw new ConflictException(
            "This academic interruption has not reached its end date.",
          );
        }
        const student = await tx.student.findUniqueOrThrow({
          where: { id: current.studentId },
          select: { status: true },
        });
        if (student.status === StudentStatus.DEFERRED) {
          await tx.student.update({
            where: { id: current.studentId },
            data: { status: StudentStatus.ACTIVE },
          });
        }
        return tx.academicInterruption.update({
          where: { id: current.id },
          data: {
            status: "COMPLETED",
            endDate: current.endDate ?? now,
            decidedById: actorId,
            decidedAt: now,
          },
        });
      },
    );
    await this.audit.log(
      {
        action: AuditAction.UPDATE,
        targetTable: "academic_interruptions",
        targetId: interruption.id,
        newValues: { status: interruption.status, resumedById: actorId },
      },
      actorId,
    );
    return interruption;
  }

  async issueCredential(dto: IssueAcademicCredentialDto, actorId: string) {
    const credential = await this.prisma.runExclusive(
      this.rlsContext,
      async (tx) => {
        const student = await tx.student.findUniqueOrThrow({
          where: { id: dto.studentId },
          select: { id: true, status: true, matricNo: true, programmeId: true },
        });
        if (student.status !== StudentStatus.GRADUATED) {
          throw new UnprocessableEntityException({
            code: "CREDENTIAL_STUDENT_NOT_GRADUATED",
            message:
              "Academic credentials can only be issued for a graduated student.",
          });
        }
        return tx.academicCredential.create({
          data: {
            studentId: student.id,
            credentialType: dto.credentialType.trim().toUpperCase(),
            credentialNo: dto.credentialNo.trim(),
            documentHash: dto.documentHash?.trim(),
            status: "ISSUED",
            snapshot: {
              ...dto.snapshot,
              studentId: student.id,
              matricNo: student.matricNo,
              programmeId: student.programmeId,
              issuedById: actorId,
            } as unknown as Prisma.InputJsonValue,
          },
        });
      },
    );
    await this.audit.log(
      {
        action: AuditAction.CREATE,
        targetTable: "academic_credentials",
        targetId: credential.id,
        newValues: {
          studentId: credential.studentId,
          credentialType: credential.credentialType,
          credentialNo: credential.credentialNo,
        },
      },
      actorId,
    );
    return credential;
  }

  async revokeCredential(
    credentialId: string,
    reason: string,
    actorId: string,
  ) {
    const credential = await this.prisma.runExclusive(
      this.rlsContext,
      async (tx) => {
        const current = await tx.academicCredential.findUniqueOrThrow({
          where: { id: credentialId },
        });
        if (current.status !== "ISSUED") {
          throw new ConflictException(
            `Academic credential is ${current.status} and cannot be revoked.`,
          );
        }
        return tx.academicCredential.update({
          where: { id: current.id },
          data: {
            status: "REVOKED",
            revokedAt: new Date(),
            snapshot: {
              ...(current.snapshot as Record<string, unknown>),
              revocationReason: reason.trim(),
              revokedById: actorId,
            } as Prisma.InputJsonValue,
          },
        });
      },
    );
    await this.audit.log(
      {
        action: AuditAction.UPDATE,
        targetTable: "academic_credentials",
        targetId: credential.id,
        newValues: {
          status: credential.status,
          revocationReason: reason.trim(),
        },
      },
      actorId,
    );
    return credential;
  }

  private async latestAudit(
    studentId: string,
    curriculumVersionId?: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma.forRequest(
      this.rlsContext,
    ),
  ) {
    return db.degreeAudit.findFirst({
      where: {
        studentId,
        ...(curriculumVersionId ? { curriculumVersionId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  private async latestPlan(
    studentId: string,
    curriculumVersionId?: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma.forRequest(
      this.rlsContext,
    ),
  ) {
    return db.academicPlan.findFirst({
      where: {
        studentId,
        status: ACTIVE,
        ...(curriculumVersionId ? { curriculumVersionId } : {}),
      },
      include: {
        items: { orderBy: { sequence: "asc" }, include: { course: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  private async replaceAcademicPlan(
    tx: Prisma.TransactionClient,
    studentId: string,
    curriculumVersionId: string,
    sourceAuditId: string,
    outstanding: OutstandingCourse[],
    unmetRequirementGroups: Array<{
      requirementGroupId: string;
      unmetReasons: string[];
      unmetRequirementIds: string[];
      needsReview: boolean;
    }>,
  ) {
    await tx.academicPlan.updateMany({
      where: { studentId, status: ACTIVE },
      data: { status: "SUPERSEDED" },
    });
    return tx.academicPlan.create({
      data: {
        studentId,
        curriculumVersionId,
        sourceAuditId,
        rationale: {
          generatedFrom: "degree-audit",
          rule: "canonical unmet requirement results; compulsory courses first",
          outstandingRequirementCount: outstanding.length,
          unresolvedGroupCount: unmetRequirementGroups.length,
          unresolvedGroups: unmetRequirementGroups,
        },

        items: {
          create: outstanding.slice(0, 30).map((course, index) => ({
            courseId: course.courseId,
            sequence: index + 1,
            targetPeriod: `${course.level} LEVEL / ${course.semester}`,
            reason: course.isCompulsory
              ? "Unmet compulsory curriculum requirement"
              : "Unmet curriculum requirement",
            status: "RECOMMENDED",
          })),
        },
      },
      include: {
        items: { include: { course: true }, orderBy: { sequence: "asc" } },
      },
    });
  }

  private buildRequirementCatalog(
    groups: Array<{
      id: string;
      name: string;
      groupType: string;
      minCourses: number | null;
      maxCourses: number | null;
      minCreditUnits: number | null;
      maxCreditUnits: number | null;
      allowDoubleCounting: boolean;
      requirements: Array<{
        id: string;
        courseId: string | null;
        isCompulsoryWithinGroup: boolean;
        course: { code: string; title: string; creditUnits: number } | null;
      }>;
    }>,
    programmeCourses: Array<{
      courseId: string;
      level: number;
      semester: string;
      isCompulsory: boolean;
      course: { code: string; title: string; creditUnits: number };
    }>,
    curriculumVersionId: string,
    minCreditUnits: number,
  ): {
    requirementGroups: RequirementGroupInput[];
    catalog: RequirementCatalogEntry[];
  } {
    if (groups.length) {
      const catalog: RequirementCatalogEntry[] = [];
      const requirementGroups = groups.map((group) => ({
        requirementGroupId: group.id,
        name: group.name,
        groupType: group.groupType as RequirementGroupInput["groupType"],
        minCourses: group.minCourses ?? undefined,
        maxCourses: group.maxCourses ?? undefined,
        minCreditUnits: group.minCreditUnits ?? undefined,
        maxCreditUnits: group.maxCreditUnits ?? undefined,
        allowDoubleCounting: group.allowDoubleCounting,
        requirements: group.requirements.map((requirement) => {
          if (requirement.courseId && requirement.course) {
            const matchingProgrammeCourse = programmeCourses.find(
              (course) => course.courseId === requirement.courseId,
            );
            catalog.push({
              curriculumRequirementId: requirement.id,
              requirementGroupId: group.id,
              courseId: requirement.courseId,
              code: requirement.course.code,
              title: requirement.course.title,
              creditUnits: requirement.course.creditUnits,
              level: matchingProgrammeCourse?.level ?? 0,
              semester: matchingProgrammeCourse?.semester ?? "UNSCHEDULED",
              isCompulsory: requirement.isCompulsoryWithinGroup,
            });
          }
          return {
            curriculumRequirementId: requirement.id,
            courseId: requirement.courseId ?? undefined,
            isCompulsoryWithinGroup: requirement.isCompulsoryWithinGroup,
          };
        }),
      }));
      return { requirementGroups, catalog };
    }

    const catalog = programmeCourses.map((course) => ({
      curriculumRequirementId: `fallback:${course.courseId}`,
      requirementGroupId: `fallback:${curriculumVersionId}`,
      courseId: course.courseId,
      code: course.course.code,
      title: course.course.title,
      creditUnits: course.course.creditUnits,
      level: course.level,
      semester: course.semester,
      isCompulsory: course.isCompulsory,
    }));
    return {
      catalog,
      requirementGroups: [
        {
          requirementGroupId: `fallback:${curriculumVersionId}`,
          name: "Curriculum Courses",
          groupType: "CORE",
          minCreditUnits,
          allowDoubleCounting: false,
          requirements: catalog.map((course) => ({
            curriculumRequirementId: course.curriculumRequirementId,
            courseId: course.courseId,
            isCompulsoryWithinGroup: course.isCompulsory,
          })),
        },
      ],
    };
  }

  private outstandingFromEngine(
    result: {
      requirementGroupResults: Array<{
        unmetReasons: string[];
        unmetRequirementIds?: string[];
      }>;
    },
    catalog: RequirementCatalogEntry[],
  ): OutstandingCourse[] {
    const unmetRequirementIds = new Set(
      result.requirementGroupResults.flatMap(
        (group) => group.unmetRequirementIds ?? [],
      ),
    );
    // Compatibility for audits written by the pre-structured engine: preserve
    // only the old compulsory-course extraction while all new audits use IDs.
    if (!unmetRequirementIds.size) {
      for (const reason of result.requirementGroupResults.flatMap(
        (group) => group.unmetReasons,
      )) {
        const match =
          /^Compulsory requirement not satisfied: course (.+)$/.exec(reason);
        if (match?.[1]) {
          const fallback = catalog.find(
            (course) => course.courseId === match[1],
          );
          if (fallback)
            unmetRequirementIds.add(fallback.curriculumRequirementId);
        }
      }
    }
    return catalog
      .filter((course) =>
        unmetRequirementIds.has(course.curriculumRequirementId),
      )
      .sort(
        (a, b) =>
          a.level - b.level ||
          a.semester.localeCompare(b.semester) ||
          Number(b.isCompulsory) - Number(a.isCompulsory) ||
          a.code.localeCompare(b.code),
      )
      .map(
        ({
          courseId,
          code,
          title,
          creditUnits,
          level,
          semester,
          isCompulsory,
        }) => ({
          courseId,
          code,
          title,
          creditUnits,
          level,
          semester,
          isCompulsory,
        }),
      );
  }

  private outstandingForJourney(
    policySnapshot: unknown,
    requirementResults: unknown,
    results: Array<{
      courseOffering: {
        courseId: string;
        course: { code: string; title: string; creditUnits: number };
      };
      grade: string;
    }>,
  ) {
    const snapshot = policySnapshot as {
      requirementCatalog?: RequirementCatalogEntry[];
    } | null;
    const engine = requirementResults as {
      requirementGroupResults?: Array<{
        unmetReasons?: string[];
        unmetRequirementIds?: string[];
      }>;
    } | null;
    if (snapshot?.requirementCatalog && engine?.requirementGroupResults) {
      return this.outstandingFromEngine(
        {
          requirementGroupResults: engine.requirementGroupResults.map(
            (group) => ({
              unmetReasons: Array.isArray(group.unmetReasons)
                ? group.unmetReasons
                : [],
              unmetRequirementIds: Array.isArray(group.unmetRequirementIds)
                ? group.unmetRequirementIds
                : [],
            }),
          ),
        },
        snapshot.requirementCatalog,
      );
    }

    // Historical audits written before the canonical snapshot format cannot be
    // reconstructed exactly. This deliberately conservative fallback is only
    // used until the next audit is run and is never used to generate new plans.
    const passed = new Set(
      results
        .filter((record) => record.grade !== "F")
        .map((record) => record.courseOffering.courseId),
    );
    const failed = new Map<
      string,
      { courseId: string; code: string; title: string; credits: number }
    >();
    for (const record of results.filter((entry) => entry.grade === "F")) {
      if (!passed.has(record.courseOffering.courseId)) {
        failed.set(record.courseOffering.courseId, {
          courseId: record.courseOffering.courseId,
          code: record.courseOffering.course.code,
          title: record.courseOffering.course.title,
          credits: record.courseOffering.course.creditUnits,
        });
      }
    }
    return [...failed.values()].map((course) => ({
      courseId: course.courseId,
      code: course.code,
      title: course.title,
      creditUnits: course.credits,
      level: 0,
      semester: "HISTORICAL",
      isCompulsory: false,
    }));
  }

  private unmetGroupsForJourney(
    policySnapshot: unknown,
    requirementResults: unknown,
  ): Array<{
    requirementGroupId: string;
    unmetReasons: string[];
    unmetRequirementIds: string[];
    needsReview: boolean;
  }> {
    const snapshot = policySnapshot as {
      unmetRequirementGroups?: Array<{
        requirementGroupId?: string;
        unmetReasons?: string[];
        unmetRequirementIds?: string[];
        needsReview?: boolean;
      }>;
    } | null;
    if (snapshot?.unmetRequirementGroups) {
      return snapshot.unmetRequirementGroups.map((group) => ({
        requirementGroupId: group.requirementGroupId ?? "unknown",
        unmetReasons: Array.isArray(group.unmetReasons)
          ? group.unmetReasons
          : [],
        unmetRequirementIds: Array.isArray(group.unmetRequirementIds)
          ? group.unmetRequirementIds
          : [],
        needsReview: group.needsReview === true,
      }));
    }
    const engine = requirementResults as {
      requirementGroupResults?: Array<{
        requirementGroupId?: string;
        unmetReasons?: string[];
        unmetRequirementIds?: string[];
        needsReview?: boolean;
      }>;
    } | null;
    return (engine?.requirementGroupResults ?? [])
      .filter(
        (group) => (group.unmetReasons?.length ?? 0) > 0 || group.needsReview,
      )
      .map((group) => ({
        requirementGroupId: group.requirementGroupId ?? "unknown",
        unmetReasons: Array.isArray(group.unmetReasons)
          ? group.unmetReasons
          : [],
        unmetRequirementIds: Array.isArray(group.unmetRequirementIds)
          ? group.unmetRequirementIds
          : [],
        needsReview: group.needsReview === true,
      }));
  }

  private parseProgressionRule(ruleDefinition: unknown): ProgressionPolicyRule {
    const rule = this.requireRuleObject(
      ruleDefinition,
      PROGRESSION_POLICY_TYPE,
    );
    const action = rule.conditionalProgressionAction;
    if (
      !this.isNonNegativeNumber(rule.minCreditUnitsToProgress) ||
      !this.isCgpa(rule.minCgpaForUnconditionalProgress) ||
      !this.isNonNegativeInteger(rule.maxCarryoversForConditionalProgress) ||
      (action !== "PROMOTE_WITH_CARRYOVER" && action !== "REPEAT_PLACEMENT")
    ) {
      throw new UnprocessableEntityException({
        code: "ACADEMIC_POLICY_INVALID",
        message:
          "The selected progression policy has an invalid rule definition.",
      });
    }
    return {
      minCreditUnitsToProgress: rule.minCreditUnitsToProgress,
      minCgpaForUnconditionalProgress: rule.minCgpaForUnconditionalProgress,
      maxCarryoversForConditionalProgress:
        rule.maxCarryoversForConditionalProgress,
      conditionalProgressionAction: action,
    };
  }

  private selectGraduationPolicy(
    policies: Array<{
      id: string;
      policyType: string;
      scope: string;
      scopeId: string | null;
      priority: number;
      effectiveFrom: Date;
      approvalStatus: string;
      ruleDefinition: unknown;
    }>,
    context: { programmeId: string; departmentId: string; facultyId: string },
  ) {
    const candidates = policies.map((policy) => ({
      id: policy.id,
      policyType: policy.policyType,
      scope: policy.scope as
        "INSTITUTION" | "FACULTY" | "DEPARTMENT" | "PROGRAMME",
      scopeId: policy.scopeId,
      priority: policy.priority,
      effectiveFrom: policy.effectiveFrom.toISOString(),
      approvalStatus: policy.approvalStatus as
        "ACTIVE" | "DRAFT" | "REVOKED" | "EXPIRED",
    }));
    const winner = resolveApplicablePolicyVersion(candidates, context);
    return winner
      ? (policies.find((policy) => policy.id === winner.id) ?? null)
      : null;
  }

  private defaultGraduationRequirements(
    minCreditUnits: number,
  ): GraduationRequirementInput[] {
    return [
      {
        graduationRequirementId: "minimum-credits",
        requirementType: "MIN_CREDITS",
        config: { minCredits: minCreditUnits },
        isMandatory: true,
      },
      {
        graduationRequirementId: "minimum-cgpa",
        requirementType: "MIN_CGPA",
        config: { minCgpa: 1.0 },
        isMandatory: true,
      },
    ];
  }

  private parseGraduationRequirementsRule(
    ruleDefinition: unknown,
    fallbackMinCredits: number,
  ): GraduationRequirementInput[] {
    const rule = this.requireRuleObject(ruleDefinition, GRADUATION_POLICY_TYPE);
    if (!Array.isArray(rule.requirements) || rule.requirements.length === 0) {
      throw new UnprocessableEntityException({
        code: "ACADEMIC_POLICY_INVALID",
        message:
          "The selected graduation policy must contain at least one requirement.",
      });
    }
    const allowedTypes = new Set<GraduationRequirementType>([
      "MIN_CREDITS",
      "MIN_CGPA",
      "MIN_RESIDENCY_CREDITS",
      "PROJECT",
      "THESIS",
      "INTERNSHIP",
      "MAX_DURATION",
      "CUSTOM",
    ]);
    const seenIds = new Set<string>();
    return rule.requirements.map((candidate, index) => {
      if (
        !candidate ||
        typeof candidate !== "object" ||
        Array.isArray(candidate)
      ) {
        throw new UnprocessableEntityException({
          code: "ACADEMIC_POLICY_INVALID",
          message: `Graduation requirement ${index + 1} must be an object.`,
        });
      }
      const value = candidate as Record<string, unknown>;
      const id =
        typeof value.graduationRequirementId === "string"
          ? value.graduationRequirementId.trim()
          : "";
      const requirementType = value.requirementType;
      const config = value.config;
      if (
        !id ||
        seenIds.has(id) ||
        typeof requirementType !== "string" ||
        !allowedTypes.has(requirementType as GraduationRequirementType) ||
        !config ||
        typeof config !== "object" ||
        Array.isArray(config) ||
        typeof value.isMandatory !== "boolean"
      ) {
        throw new UnprocessableEntityException({
          code: "ACADEMIC_POLICY_INVALID",
          message: `Graduation requirement ${index + 1} has an invalid identifier, type, config, or mandatory flag.`,
        });
      }
      seenIds.add(id);
      const typedConfig = config as Record<string, unknown>;
      const minCredits = typedConfig.minCredits;
      const minCgpa = typedConfig.minCgpa;
      const minResidencyCredits = typedConfig.minResidencyCredits;
      const maxYears = typedConfig.maxYears;
      if (
        ["PROJECT", "THESIS", "INTERNSHIP"].includes(requirementType) &&
        (typeof typedConfig.curriculumRequirementId !== "string" ||
          typedConfig.curriculumRequirementId.trim().length === 0)
      ) {
        throw new UnprocessableEntityException({
          code: "ACADEMIC_POLICY_INVALID",
          message: `${requirementType} requirement ${id} must reference a curriculum requirement.`,
        });
      }
      if (
        requirementType === "MIN_CREDITS" &&
        !this.isNonNegativeNumber(minCredits)
      ) {
        throw new UnprocessableEntityException({
          code: "ACADEMIC_POLICY_INVALID",
          message: `MIN_CREDITS requirement ${id} must define a non-negative minCredits value.`,
        });
      }
      if (
        requirementType === "MIN_CREDITS" &&
        this.isNonNegativeNumber(minCredits) &&
        minCredits < fallbackMinCredits
      ) {
        throw new UnprocessableEntityException({
          code: "ACADEMIC_POLICY_INVALID",
          message: `MIN_CREDITS requirement ${id} cannot be lower than the programme minimum of ${fallbackMinCredits}.`,
        });
      }
      if (requirementType === "MIN_CGPA" && !this.isCgpa(minCgpa)) {
        throw new UnprocessableEntityException({
          code: "ACADEMIC_POLICY_INVALID",
          message: `MIN_CGPA requirement ${id} must define minCgpa between 0 and 5.`,
        });
      }
      if (
        requirementType === "MIN_RESIDENCY_CREDITS" &&
        !this.isNonNegativeNumber(minResidencyCredits)
      ) {
        throw new UnprocessableEntityException({
          code: "ACADEMIC_POLICY_INVALID",
          message: `MIN_RESIDENCY_CREDITS requirement ${id} must define a non-negative minResidencyCredits value.`,
        });
      }
      if (
        requirementType === "MAX_DURATION" &&
        !this.isNonNegativeNumber(maxYears)
      ) {
        throw new UnprocessableEntityException({
          code: "ACADEMIC_POLICY_INVALID",
          message: `MAX_DURATION requirement ${id} must define a non-negative maxYears value.`,
        });
      }
      return {
        graduationRequirementId: id,
        requirementType: requirementType as GraduationRequirementType,
        config: typedConfig,
        isMandatory: value.isMandatory,
      };
    });
  }

  private parseStandingRule(ruleDefinition: unknown): StandingPolicyRule {
    const rule = this.requireRuleObject(ruleDefinition, STANDING_POLICY_TYPE);
    if (
      !this.isCgpa(rule.probationCgpaThreshold) ||
      !this.isCgpa(rule.warningCgpaThreshold) ||
      rule.warningCgpaThreshold < rule.probationCgpaThreshold ||
      !this.isPositiveInteger(rule.consecutiveProbationPeriodsForSuspension)
    ) {
      throw new UnprocessableEntityException({
        code: "ACADEMIC_POLICY_INVALID",
        message:
          "The selected academic-standing policy has an invalid rule definition.",
      });
    }
    return {
      probationCgpaThreshold: rule.probationCgpaThreshold,
      warningCgpaThreshold: rule.warningCgpaThreshold,
      consecutiveProbationPeriodsForSuspension:
        rule.consecutiveProbationPeriodsForSuspension,
    };
  }

  private requireRuleObject(
    value: unknown,
    policyType: string,
  ): RuleDefinition {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new UnprocessableEntityException({
        code: "ACADEMIC_POLICY_INVALID",
        message: `The selected ${policyType} policy does not contain a rule-definition object.`,
      });
    }
    return value as RuleDefinition;
  }

  private isNonNegativeNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
  }

  private isNonNegativeInteger(value: unknown): value is number {
    return this.isNonNegativeNumber(value) && Number.isInteger(value);
  }

  private isPositiveInteger(value: unknown): value is number {
    return this.isNonNegativeInteger(value) && value > 0;
  }

  private isCgpa(value: unknown): value is number {
    return this.isNonNegativeNumber(value) && value <= 5;
  }
}
