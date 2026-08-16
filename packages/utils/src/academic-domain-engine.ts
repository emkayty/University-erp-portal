/**
 * UniPortal ERP — Integrated Academic Domain Engine
 * Generated from the supplied Stage 2–8 academic-domain fixes.
 *
 * This file is deliberately pure: no Prisma, NestJS, HTTP, filesystem or
 * database dependencies. API/application services should map persistence
 * records into these deterministic shapes, call the engines, then persist
 * the returned decision/snapshot as an auditable record.
 *
 * Included:
 * - Degree/requirement audit and deterministic allocation
 * - Progression and academic standing evaluation
 * - Scoped policy precedence resolution
 * - Course-attempt repeat/supersession reconciliation
 * - Migration/backfill matching and validation helpers
 *
 * CourseRepeatPolicy is imported only as a type from grades.ts so the
 * institution's existing REPLACE/INCLUDE/BEST policy remains the single
 * semantic source of truth.
 */
import type { CourseRepeatPolicy } from './grades';

// ==============================================================================
// INTEGRATED ACADEMIC DOMAIN STAGE 1: progression.ts
// ==============================================================================

/**
 * Progression & academic-standing rule engine \u2014 Deep Audit (Aug 2026), Stage 3.
 *
 * Pure, DB-free for the same reason degree-audit.ts and grades.ts are: the
 * caller (a ProgressionService in apps/api, not yet written) fetches a
 * student's period record and the applicable AcademicPolicyVersion rows,
 * maps them into the plain shapes below, and persists what these functions
 * return as ProgressionEvaluation / AcademicStanding rows.
 *
 * Findings addressed: DA-13 (progression engine), DA-40/123/124 (a
 * placement is a decision, never `level++`), DA-41 (standing, progression
 * eligibility, and risk are three different things \u2014 this file only
 * produces the first two; no predictive/AI signal is consumed here, by
 * design, per DA-42), DA-63/64 (reproducible decision record \u2014 the
 * reasons[] this returns are exactly what gets persisted onto
 * ProgressionEvaluation.reasons / AcademicStanding.reasons, not
 * regenerated later against today's policy).
 *
 * DELIBERATELY TWO SEPARATE FUNCTIONS, NOT ONE: evaluateProgression()
 * answers "can this student continue registering," evaluateAcademicStanding()
 * answers "what is this student's official standing." A university can
 * allow registration under WARNING standing, or require it be blocked \u2014
 * that's a policy decision made by whatever calls both functions and
 * reconciles them, not something this file assumes (DA-60).
 */

// \u2500\u2500 Shared shapes \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export interface PeriodRecordInput {
  creditUnitsAttempted: number;
  creditUnitsEarned: number;
  gpa: number;             // this period's GPA
  cgpa: number;             // cumulative CGPA as of this period
  failedCourseCount: number; // outstanding (not-yet-passed) courses from this period
}

export type StandingType = 'GOOD_STANDING' | 'WARNING' | 'PROBATION' | 'SUSPENSION_RECOMMENDED';

export interface PriorStandingInput {
  standing: StandingType;
  periodSequence: number; // any monotonically increasing ordering (semester index, etc.)
}

// \u2500\u2500 Progression \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export type ProgressionOutcome = 'ELIGIBLE' | 'CONDITIONAL' | 'NOT_ELIGIBLE';
export type ProgressionAction = 'PROMOTE' | 'PROMOTE_WITH_CARRYOVER' | 'REPEAT_PLACEMENT';

/** The expected shape of AcademicPolicyVersion.ruleDefinition for a
 * PROGRESSION-type policy \u2014 see docs/architecture.md \u00a75. */
export interface ProgressionPolicyRule {
  minCreditUnitsToProgress: number;
  minCgpaForUnconditionalProgress: number;
  maxCarryoversForConditionalProgress: number;
  /** what a CONDITIONAL outcome recommends when it isn't an outright block \u2014
   * institutions differ on whether a struggling student repeats the level or
   * carries the failure forward (DA-36/60), so this is policy input, not a
   * hardcoded assumption. */
  conditionalProgressionAction: 'PROMOTE_WITH_CARRYOVER' | 'REPEAT_PLACEMENT';
}

export interface ProgressionEvaluationResult {
  outcome: ProgressionOutcome;
  reasons: string[];
  recommendedAction: ProgressionAction;
}

/** DA-63/64/74-equivalent for progression: deterministic, no side effects,
 * no clock/DB reads \u2014 same input always produces the same output. */
export function evaluateProgression(period: PeriodRecordInput, rule: ProgressionPolicyRule): ProgressionEvaluationResult {
  if (!Number.isFinite(period.cgpa) || period.cgpa < 0 || period.cgpa > 5) throw new RangeError('Invalid CGPA');
  if (!Number.isFinite(period.creditUnitsEarned) || period.creditUnitsEarned < 0) throw new RangeError('Invalid earned credit units');
  if (!Number.isInteger(period.failedCourseCount) || period.failedCourseCount < 0) throw new RangeError('Invalid failed course count');
  if (!Number.isFinite(rule.minCreditUnitsToProgress) || rule.minCreditUnitsToProgress < 0 ||
      !Number.isFinite(rule.minCgpaForUnconditionalProgress) || rule.minCgpaForUnconditionalProgress < 0 || rule.minCgpaForUnconditionalProgress > 5 ||
      !Number.isInteger(rule.maxCarryoversForConditionalProgress) || rule.maxCarryoversForConditionalProgress < 0) {
    throw new RangeError('Invalid progression policy configuration');
  }
  const meetsCredits = period.creditUnitsEarned >= rule.minCreditUnitsToProgress;
  const meetsCgpa = period.cgpa >= rule.minCgpaForUnconditionalProgress;
  const withinCarryoverCap = period.failedCourseCount <= rule.maxCarryoversForConditionalProgress;

  if (meetsCredits && meetsCgpa && period.failedCourseCount === 0) {
    return {
      outcome: 'ELIGIBLE',
      reasons: [`Meets all progression criteria: ${period.creditUnitsEarned}/${rule.minCreditUnitsToProgress} CU, CGPA ${period.cgpa.toFixed(2)}, 0 outstanding courses`],
      recommendedAction: 'PROMOTE',
    };
  }

  if (!withinCarryoverCap) {
    return {
      outcome: 'NOT_ELIGIBLE',
      reasons: [`${period.failedCourseCount} outstanding course(s) exceeds the ${rule.maxCarryoversForConditionalProgress} allowed for conditional progression`],
      recommendedAction: 'REPEAT_PLACEMENT',
    };
  }

  const reasons: string[] = [];
  if (!meetsCgpa) reasons.push(`CGPA ${period.cgpa.toFixed(2)} below the ${rule.minCgpaForUnconditionalProgress.toFixed(2)} unconditional-progression threshold`);
  if (!meetsCredits) reasons.push(`${period.creditUnitsEarned}/${rule.minCreditUnitsToProgress} credit units earned`);
  if (period.failedCourseCount > 0) reasons.push(`${period.failedCourseCount} course(s) to carry over (within the ${rule.maxCarryoversForConditionalProgress}-course cap)`);

  return { outcome: 'CONDITIONAL', reasons, recommendedAction: rule.conditionalProgressionAction };
}

// \u2500\u2500 Academic standing \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/** The expected shape of AcademicPolicyVersion.ruleDefinition for an
 * ACADEMIC_STANDING-type policy. */
export interface StandingPolicyRule {
  probationCgpaThreshold: number;
  warningCgpaThreshold: number;
  /** e.g. 2 = suspension is recommended on the 2nd *consecutive* probation period */
  consecutiveProbationPeriodsForSuspension: number;
}

export interface StandingEvaluationResult {
  standing: StandingType;
  reasons: string[];
}

/** Counts a trailing run of `target` standings immediately preceding the
 * current period \u2014 a GOOD_STANDING or WARNING period in between resets the
 * streak, matching how "consecutive" is normally meant in academic
 * regulations (DA-41: this is standing history, not a raw counter). */
function countTrailingConsecutive(priorStandings: PriorStandingInput[], target: StandingType): number {
  const sorted = [...priorStandings].sort((a, b) => b.periodSequence - a.periodSequence);
  let count = 0;
  for (const s of sorted) {
    if (s.standing === target) count += 1;
    else break;
  }
  return count;
}

/** DA-41/42: standing is computed from the academic record only \u2014 no
 * predictive/AI signal is an input here. A risk model can flag a student
 * for advisor review long before their CGPA crosses a threshold, but it
 * must never be what sets GOOD_STANDING/WARNING/PROBATION \u2014 that stays an
 * institutional, rule-based, auditable decision. */
export function evaluateAcademicStanding(
  period: PeriodRecordInput,
  priorStandings: PriorStandingInput[],
  rule: StandingPolicyRule,
): StandingEvaluationResult {
  if (!Number.isFinite(period.cgpa) || period.cgpa < 0 || period.cgpa > 5) throw new RangeError('Invalid CGPA');
  if (!Number.isFinite(rule.probationCgpaThreshold) || !Number.isFinite(rule.warningCgpaThreshold) ||
      rule.probationCgpaThreshold < 0 || rule.warningCgpaThreshold < rule.probationCgpaThreshold || rule.warningCgpaThreshold > 5 ||
      !Number.isInteger(rule.consecutiveProbationPeriodsForSuspension) || rule.consecutiveProbationPeriodsForSuspension < 1) {
    throw new RangeError('Invalid academic-standing policy configuration');
  }
  if (period.cgpa >= rule.warningCgpaThreshold) {
    return { standing: 'GOOD_STANDING', reasons: [`CGPA ${period.cgpa.toFixed(2)} at or above the ${rule.warningCgpaThreshold.toFixed(2)} warning threshold`] };
  }
  if (period.cgpa >= rule.probationCgpaThreshold) {
    return { standing: 'WARNING', reasons: [`CGPA ${period.cgpa.toFixed(2)} below the ${rule.warningCgpaThreshold.toFixed(2)} warning threshold, at/above probation threshold ${rule.probationCgpaThreshold.toFixed(2)}`] };
  }

  const consecutivePriorProbations = countTrailingConsecutive(priorStandings, 'PROBATION');
  const totalConsecutiveIncludingNow = consecutivePriorProbations + 1;
  if (totalConsecutiveIncludingNow >= rule.consecutiveProbationPeriodsForSuspension) {
    return {
      standing: 'SUSPENSION_RECOMMENDED',
      reasons: [`CGPA ${period.cgpa.toFixed(2)} below the ${rule.probationCgpaThreshold.toFixed(2)} probation threshold for the ${totalConsecutiveIncludingNow}${totalConsecutiveIncludingNow === 2 ? 'nd' : totalConsecutiveIncludingNow === 3 ? 'rd' : 'th'} consecutive period \u2014 meets the ${rule.consecutiveProbationPeriodsForSuspension}-period suspension trigger`],
    };
  }
  return { standing: 'PROBATION', reasons: [`CGPA ${period.cgpa.toFixed(2)} below the ${rule.probationCgpaThreshold.toFixed(2)} probation threshold`] };
}

// ==============================================================================
// INTEGRATED ACADEMIC DOMAIN STAGE 2: policy-resolver.ts
// ==============================================================================

/**
 * Policy-precedence resolver (DA-91) — Deep Audit (Aug 2026), Stage 6.
 *
 * Both ProgressionService (Stage 3) and its STAGE3_SUMMARY.md flagged the
 * same simplification explicitly: policy resolution only ever took the
 * institution-wide ACTIVE version of a policy type, never a
 * faculty/department/programme-scoped override. This is the resolver that
 * closes that gap — pure, no DB dependency, for the same reason every other
 * engine in this project is pure (see degree-audit.ts's header).
 *
 * Precedence, exactly as documented in
 * docs/architecture.md §"Policy engine & precedence":
 *   1. Narrowest scope wins (PROGRAMME > DEPARTMENT > FACULTY > INSTITUTION)
 *   2. Ties broken by highest `priority`
 *   3. Remaining ties broken by latest `effectiveFrom`
 *
 * This function does the RESOLUTION only. Fetching the candidate list and
 * the student's programme/department/faculty context is the caller's job
 * (ProgressionService, or any future consumer) — kept out of here
 * deliberately, same reasoning as degree-audit.ts staying free of Prisma.
 */

export type PolicyScope = 'INSTITUTION' | 'FACULTY' | 'DEPARTMENT' | 'PROGRAMME';

export interface PolicyVersionCandidate {
  id: string;
  scope: PolicyScope;
  scopeId: string | null; // null for INSTITUTION; a Faculty/Department/Programme id otherwise
  priority: number;
  effectiveFrom: string; // ISO date string — callers pass Prisma DateTime.toISOString()
  approvalStatus: 'ACTIVE' | 'DRAFT' | 'REVOKED' | 'EXPIRED';
}

export interface PolicyResolutionContext {
  programmeId?: string;
  departmentId?: string;
  facultyId?: string;
}

const SCOPE_SPECIFICITY: Record<PolicyScope, number> = { PROGRAMME: 4, DEPARTMENT: 3, FACULTY: 2, INSTITUTION: 1 };

function isApplicable(candidate: PolicyVersionCandidate, context: PolicyResolutionContext): boolean {
  if (candidate.approvalStatus !== 'ACTIVE') return false;
  switch (candidate.scope) {
    case 'INSTITUTION': return true;
    case 'PROGRAMME':   return candidate.scopeId !== null && candidate.scopeId === context.programmeId;
    case 'DEPARTMENT':  return candidate.scopeId !== null && candidate.scopeId === context.departmentId;
    case 'FACULTY':      return candidate.scopeId !== null && candidate.scopeId === context.facultyId;
    default:             return false;
  }
}

/**
 * Returns the single winning policy version for this context, or null if
 * nothing ACTIVE applies at all (the caller decides what that means — for
 * ProgressionService, "no policy configured" is currently a hard error, not
 * a silent skip, since evaluating progression without any policy would be
 * worse than refusing).
 */
export function resolveApplicablePolicyVersion(
  candidates: PolicyVersionCandidate[],
  context: PolicyResolutionContext,
): PolicyVersionCandidate | null {
  const applicable = candidates.filter((c) => isApplicable(c, context));
  if (applicable.length === 0) return null;

  const sorted = [...applicable].sort((a, b) => {
    const specificityDiff = SCOPE_SPECIFICITY[b.scope] - SCOPE_SPECIFICITY[a.scope];
    if (specificityDiff !== 0) return specificityDiff;
    if (b.priority !== a.priority) return b.priority - a.priority;
    const effectiveDiff = new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime();
    if (effectiveDiff !== 0) return effectiveDiff;
    return a.id.localeCompare(b.id);
  });
  return sorted[0];
}

// ==============================================================================
// INTEGRATED ACADEMIC DOMAIN STAGE 3: repeat-attempts.ts
// ==============================================================================

/**
 * Repeat-attempt supersession reconciler (DA-36) — Deep Audit (Aug 2026), Stage 8.
 *
 * grades.ts's applyRepeatPolicy() already decides which SENATE_PUBLISHED
 * results feed CGPA under REPLACE/INCLUDE/BEST — that function is untouched
 * here. What was missing: CourseAttempt.countsTowardGpa/countsTowardCredits
 * (introduced in Stage 2, defaulted to always-true) never actually reflected
 * that same policy, so the degree-audit engine's MIN_CREDITS/
 * MIN_RESIDENCY_CREDITS calculations could double-count a course a student
 * passed twice under REPLACE/BEST. This function keeps those two fields —
 * and supersededByAttemptId — consistent with the exact same policy
 * semantics applyRepeatPolicy() already implements, just applied to
 * attempts instead of results.
 *
 * Pure, no DB dependency, same reasoning as every other engine in this
 * project. Mirrors applyRepeatPolicy()'s own group-by-course structure
 * deliberately, so the two are easy to compare side by side.
 */

export type AttemptOutcomeForSupersession = 'IN_PROGRESS' | 'PASSED' | 'FAILED' | 'WITHDRAWN' | 'INCOMPLETE';

export interface AttemptForSupersession {
  courseAttemptId: string;
  courseId: string;
  outcome: AttemptOutcomeForSupersession;
  /** null when no result exists yet (IN_PROGRESS) — such attempts are
   * filtered out below before ranking ever needs this. */
  gradePoint: number | null;
  attemptNumber: number;
}

export interface SupersessionDecision {
  courseAttemptId: string;
  countsTowardGpa: boolean;
  countsTowardCredits: boolean;
  supersededByAttemptId: string | null;
}

/**
 * Only PASSED/FAILED attempts are ever ranked — WITHDRAWN/INCOMPLETE/
 * IN_PROGRESS attempts already have their own correct countsTowardGpa/
 * countsTowardCredits values set elsewhere (see students.service.ts
 * dropCourse()) and are left out of the returned decisions entirely rather
 * than have this function guess at them.
 *
 * REPLACE ties break on attemptNumber (the later attempt wins) rather than
 * mirroring applyRepeatPolicy()'s senatePublishedAt ordering — attemptNumber
 * is a more direct measure of "which attempt is actually the more recent
 * one" than when its paperwork happened to be processed, and avoids mixing
 * a timestamp with an integer in one comparator. A deliberate small
 * improvement, not a silent divergence — noted here for whoever compares
 * the two functions next.
 */
export function reconcileAttemptSupersession(
  attempts: AttemptForSupersession[],
  policy: CourseRepeatPolicy,
): SupersessionDecision[] {
  const grouped = new Map<string, AttemptForSupersession[]>();
  for (const a of attempts) {
    if (a.outcome !== 'PASSED' && a.outcome !== 'FAILED') continue;
    const list = grouped.get(a.courseId) ?? [];
    list.push(a);
    grouped.set(a.courseId, list);
  }

  const decisions: SupersessionDecision[] = [];
  for (const courseAttempts of grouped.values()) {
    if (policy === 'INCLUDE' || courseAttempts.length === 1) {
      decisions.push(...courseAttempts.map((a) => ({
        courseAttemptId: a.courseAttemptId, countsTowardGpa: true, countsTowardCredits: a.outcome === 'PASSED', supersededByAttemptId: null,
      })));
      continue;
    }

    const sorted = [...courseAttempts].sort((a, b) => {
      if (policy === 'REPLACE') return b.attemptNumber - a.attemptNumber;
      const gp = (b.gradePoint ?? -1) - (a.gradePoint ?? -1);
      return gp !== 0 ? gp : b.attemptNumber - a.attemptNumber;
    });
    const winner = sorted[0];
    decisions.push(...courseAttempts.map((a) => ({
      courseAttemptId: a.courseAttemptId,
      countsTowardGpa: a.courseAttemptId === winner.courseAttemptId,
      countsTowardCredits: a.courseAttemptId === winner.courseAttemptId && a.outcome === 'PASSED',
      supersededByAttemptId: a.courseAttemptId === winner.courseAttemptId ? null : winner.courseAttemptId,
    })));
  }
  return decisions;
}

// ==============================================================================
// INTEGRATED ACADEMIC DOMAIN STAGE 4: degree-audit-1.ts
// ==============================================================================

/**
 * Degree-audit / requirement-satisfaction engine — Deep Audit (Aug 2026), Stage 2.
 *
 * Pure, DB-free by design (same reasoning as grades.ts/payroll.ts in this
 * package): this is the one piece of genuinely new business logic the
 * academic-domain audit called for — a real degree-audit algorithm did not
 * exist anywhere in the codebase before this. Keeping it pure means it is
 * unit-testable without @prisma/client or a running Postgres; the
 * DegreeAuditService in apps/api is a thin Prisma-fetch + call-this-function
 * + persist wrapper (mirrors how ResultsService wraps
 * computeCgpa()/applyRepeatPolicy() from grades.ts).
 *
 * Findings addressed: DA-7 (requirement allocation / double-counting),
 * DA-46, DA-74 (deterministic degree audit), DA-94/136/137 (reproducible
 * snapshot — the caller persists this function's return value verbatim as
 * DegreeAudit.requirementResults, never recomputes it later against
 * changed curriculum/policy), DA-98 (passed \u2260 requirement satisfied),
 * DA-102/103 (constrained allocation), DA-119 (satisfaction precedence).
 *
 * IMPORTANT \u2014 what this is NOT: a general integer-program / constraint
 * solver. It is a deterministic, documented greedy heuristic
 * (most-constrained-group-first \u2014 see sortGroupsByConstraint). For curricula
 * shaped like a handful of compulsory groups plus a few elective baskets per
 * stage, that heuristic finds the same allocation an optimal solver would.
 * It is NOT guaranteed optimal for pathological cases (one course eligible
 * for five overlapping elective baskets with tight, conflicting caps) \u2014
 * flagged here rather than silently assumed away. Revisit with a real
 * assignment-problem solver if that scenario turns out to matter in practice.
 */

// \u2500\u2500 Input shapes \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Deliberately NOT @prisma/client types \u2014 see file header. The caller
// (DegreeAuditService) maps Prisma rows into these before calling in.

export type AttemptOutcome = 'IN_PROGRESS' | 'PASSED' | 'FAILED' | 'WITHDRAWN' | 'INCOMPLETE';

export interface AttemptInput {
  courseAttemptId: string;
  courseId: string;
  creditUnits: number;
  outcome: AttemptOutcome;
  attemptNumber: number;
  gradePoint: number;
  countsTowardCredits: boolean;
}

export interface ExemptionInput {
  curriculumRequirementId: string;
}

export interface SubstitutionInput {
  originalCurriculumRequirementId: string;
  substituteCourseId: string;
}

export interface TransferInput {
  creditTransferId: string;
  creditUnits: number;
  /** Only APPROVED transfer credit can satisfy graduation requirements. */
  approvalStatus: 'APPROVED' | 'PENDING' | 'REJECTED';
  mappedCourseId?: string;
  mappedCurriculumRequirementId?: string;
}

export interface EquivalencyInput {
  fromCourseId: string;
  toCourseId: string;
  direction: 'BIDIRECTIONAL' | 'ONE_WAY';
}

export interface CurriculumRequirementInput {
  curriculumRequirementId: string;
  courseId?: string; // undefined = generic/basket slot, any course counts
  isCompulsoryWithinGroup: boolean;
}

export type RequirementGroupType =
  | 'CORE' | 'DEPARTMENTAL_ELECTIVE' | 'GENERAL_STUDIES' | 'SPECIALIZATION'
  | 'MINOR' | 'FREE_ELECTIVE' | 'PROJECT_THESIS' | 'INTERNSHIP';

export interface RequirementGroupInput {
  requirementGroupId: string;
  name: string;
  groupType: RequirementGroupType;
  minCourses?: number;
  maxCourses?: number;
  minCreditUnits?: number;
  maxCreditUnits?: number;
  allowDoubleCounting: boolean;
  requirements: CurriculumRequirementInput[];
}

export type GraduationRequirementType =
  | 'MIN_CREDITS' | 'MIN_CGPA' | 'MIN_RESIDENCY_CREDITS' | 'PROJECT'
  | 'THESIS' | 'INTERNSHIP' | 'MAX_DURATION' | 'CUSTOM';

export interface GraduationRequirementInput {
  graduationRequirementId: string;
  requirementType: GraduationRequirementType;
  config: Record<string, unknown>; // shape depends on requirementType \u2014 see evaluateGraduationRequirement()
  isMandatory: boolean;
}

export interface DegreeAuditInput {
  attempts: AttemptInput[];
  exemptions: ExemptionInput[];
  substitutions: SubstitutionInput[];
  transfers: TransferInput[];
  equivalencies: EquivalencyInput[];
  requirementGroups: RequirementGroupInput[];
  graduationRequirements: GraduationRequirementInput[];
  courseRepeatPolicy: CourseRepeatPolicy;
  currentCgpa: number;
  totalElapsedYears: number;
}

// \u2500\u2500 Output shapes \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export type SatisfactionMethod = 'DIRECT' | 'EQUIVALENCY' | 'SUBSTITUTION' | 'EXEMPTION' | 'TRANSFER';

export interface AllocationResult {
  curriculumRequirementId?: string; // undefined for basket-only allocations
  requirementGroupId: string;
  courseAttemptId?: string;         // undefined when satisfied by exemption/transfer with no local attempt
  creditTransferId?: string;
  allocatedCreditUnits: number;
  satisfactionMethod: SatisfactionMethod;
}

export interface RequirementGroupResult {
  requirementGroupId: string;
  satisfied: boolean;
  coursesCounted: number;
  creditsCounted: number;
  unmetReasons: string[];
  /** Requirement identifiers that remain unsatisfied. Generic basket groups
   * may legitimately have none because they require manual course selection. */
  unmetRequirementIds: string[];
  /** Stage 7 (Aug 2026): true when this group has elective/basket slots but
   * no minCourses/minCreditUnits threshold at all — e.g. a group backfill
   * script 04 or the addProgrammeCourse dual-write created from legacy data
   * that never recorded "choose N of these" (see both files' own headers).
   * Such a group always reports satisfied=true (there is no threshold left
   * to fail), which is a real gap, not a clean pass — computeDegreeAudit()
   * downgrades the overall result to PENDING_REVIEW rather than a false
   * ELIGIBLE whenever this is true anywhere in the curriculum. */
  needsReview: boolean;
}

export interface GraduationRequirementResult {
  graduationRequirementId: string;
  requirementType: GraduationRequirementType;
  satisfied: boolean;
  detail: string;
}

export type DegreeAuditStatus = 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'PENDING_REVIEW';

export interface DegreeAuditResult {
  overallStatus: DegreeAuditStatus;
  requirementGroupResults: RequirementGroupResult[];
  graduationRequirementResults: GraduationRequirementResult[];
  allocations: AllocationResult[];
}

// \u2500\u2500 Allocation engine \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/**
 * Most-constrained-first ordering: groups where every requirement is
 * compulsory (no elective slack at all) go first, so a flexible/basket
 * group never "steals" the one attempt a compulsory group had no
 * alternative for. See the file header's "what this is NOT" note.
 */
function sortGroupsByConstraint(groups: RequirementGroupInput[]): RequirementGroupInput[] {
  const constraintScore = (g: RequirementGroupInput): number => {
    const hasElectiveSlack = g.requirements.some((r) => !r.isCompulsoryWithinGroup) || g.requirements.length === 0;
    return hasElectiveSlack ? 1 : 0;
  };
  return [...groups].sort((a, b) => {
    const scoreDiff = constraintScore(a) - constraintScore(b);
    return scoreDiff !== 0 ? scoreDiff : a.requirementGroupId.localeCompare(b.requirementGroupId);
  });
}

function findDirectAttempt(
  courseId: string,
  attemptsByCourse: Map<string, AttemptInput[]>,
  hardConsumed: Set<string>,
  allowDoubleCounting: boolean,
): AttemptInput | undefined {
  const candidates = attemptsByCourse.get(courseId) ?? [];
  return candidates.find((a) => allowDoubleCounting || !hardConsumed.has(a.courseAttemptId));
}

interface SatisfactionSearchContext {
  attemptsByCourse: Map<string, AttemptInput[]>;
  hardConsumed: Set<string>;
  exemptionsByRequirement: Map<string, ExemptionInput>;
  substitutionsByRequirement: Map<string, SubstitutionInput>;
  equivalenciesToCourse: Map<string, string[]>; // toCourseId -> [fromCourseId, ...] that satisfy it
  transfersByRequirement: Map<string, TransferInput>;
  transfersByCourse: Map<string, TransferInput>;
  consumedTransferIds: Set<string>;
}

interface SatisfactionMatch {
  method: SatisfactionMethod;
  attempt?: AttemptInput;
  transfer?: TransferInput;
  creditUnits: number;
}

/** DA-119: precedence \u2014 direct completion, then exemption, then approved
 * substitution, then equivalency, then transfer credit. */
function findSatisfyingSource(
  req: CurriculumRequirementInput,
  ctx: SatisfactionSearchContext,
  allowDoubleCounting: boolean,
): SatisfactionMatch | undefined {
  if (!req.courseId) return undefined; // generic slots are handled by the basket step, not here

  const direct = findDirectAttempt(req.courseId, ctx.attemptsByCourse, ctx.hardConsumed, allowDoubleCounting);
  if (direct) return { method: 'DIRECT', attempt: direct, creditUnits: direct.creditUnits };

  if (ctx.exemptionsByRequirement.has(req.curriculumRequirementId)) {
    return { method: 'EXEMPTION', creditUnits: 0 };
  }

  const sub = ctx.substitutionsByRequirement.get(req.curriculumRequirementId);
  if (sub) {
    const subAttempt = findDirectAttempt(sub.substituteCourseId, ctx.attemptsByCourse, ctx.hardConsumed, allowDoubleCounting);
    if (subAttempt) return { method: 'SUBSTITUTION', attempt: subAttempt, creditUnits: subAttempt.creditUnits };
  }

  const equivalentCourseIds = ctx.equivalenciesToCourse.get(req.courseId) ?? [];
  for (const fromCourseId of equivalentCourseIds) {
    const equivAttempt = findDirectAttempt(fromCourseId, ctx.attemptsByCourse, ctx.hardConsumed, allowDoubleCounting);
    if (equivAttempt) return { method: 'EQUIVALENCY', attempt: equivAttempt, creditUnits: equivAttempt.creditUnits };
  }

  const transferByReq = ctx.transfersByRequirement.get(req.curriculumRequirementId);
  if (transferByReq && (allowDoubleCounting || !ctx.consumedTransferIds.has(transferByReq.creditTransferId))) return { method: 'TRANSFER', transfer: transferByReq, creditUnits: transferByReq.creditUnits };
  const transferByCourse = ctx.transfersByCourse.get(req.courseId);
  if (transferByCourse && (allowDoubleCounting || !ctx.consumedTransferIds.has(transferByCourse.creditTransferId))) return { method: 'TRANSFER', transfer: transferByCourse, creditUnits: transferByCourse.creditUnits };

  return undefined;
}

function validateDegreeAuditInput(input: DegreeAuditInput): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(input.currentCgpa) || input.currentCgpa < 0 || input.currentCgpa > 5) errors.push('CGPA must be between 0 and 5');
  if (!Number.isFinite(input.totalElapsedYears) || input.totalElapsedYears < 0) errors.push('Elapsed years cannot be negative');
  const attemptIds = new Set<string>();
  const attemptNumbersByCourse = new Map<string, Set<number>>();
  for (const a of input.attempts) {
    if (attemptIds.has(a.courseAttemptId)) errors.push(`Duplicate course attempt: ${a.courseAttemptId}`);
    attemptIds.add(a.courseAttemptId);
    const numbers = attemptNumbersByCourse.get(a.courseId) ?? new Set<number>();
    if (numbers.has(a.attemptNumber)) errors.push(`Duplicate attempt number ${a.attemptNumber} for course ${a.courseId}`);
    numbers.add(a.attemptNumber);
    attemptNumbersByCourse.set(a.courseId, numbers);
    if (!Number.isFinite(a.creditUnits) || a.creditUnits <= 0) errors.push(`Invalid credit units for attempt ${a.courseAttemptId}`);
    if (!Number.isInteger(a.attemptNumber) || a.attemptNumber < 1) errors.push(`Invalid attempt number for ${a.courseAttemptId}`);
    if (!Number.isFinite(a.gradePoint) || a.gradePoint < 0 || a.gradePoint > 5) errors.push(`Invalid grade point for ${a.courseAttemptId}`);
    if (a.countsTowardCredits && a.outcome !== 'PASSED') errors.push(`Non-passed attempt ${a.courseAttemptId} cannot count toward credits`);
  }
  const transferIds = new Set<string>();
  for (const t of input.transfers) {
    if (transferIds.has(t.creditTransferId)) errors.push(`Duplicate transfer: ${t.creditTransferId}`);
    transferIds.add(t.creditTransferId);
    if (!['APPROVED', 'PENDING', 'REJECTED'].includes(t.approvalStatus)) errors.push(`Invalid transfer approval status for ${t.creditTransferId}`);
    if (!Number.isFinite(t.creditUnits) || t.creditUnits <= 0) errors.push(`Invalid transfer credit units for ${t.creditTransferId}`);
  }
  return errors;
}

function allocateRequirementsGreedy(
  input: Pick<DegreeAuditInput, 'attempts' | 'exemptions' | 'substitutions' | 'transfers' | 'equivalencies' | 'requirementGroups' | 'courseRepeatPolicy'>,
  forcedOrder?: string[],
): { allocations: AllocationResult[]; groupResults: RequirementGroupResult[] } {
  const decisions = reconcileAttemptSupersession(
    input.attempts.map((a) => ({ courseAttemptId: a.courseAttemptId, courseId: a.courseId, outcome: a.outcome === 'PASSED' || a.outcome === 'FAILED' ? a.outcome : 'IN_PROGRESS', gradePoint: a.gradePoint, attemptNumber: a.attemptNumber })),
    input.courseRepeatPolicy,
  );
  const creditedAttemptIds = new Set(decisions.filter((d) => d.countsTowardCredits).map((d) => d.courseAttemptId));
  const passedAttempts = input.attempts.filter((a) => a.outcome === 'PASSED' && creditedAttemptIds.has(a.courseAttemptId));
  const attemptsByCourse = new Map<string, AttemptInput[]>();
  for (const a of passedAttempts) {
    const list = attemptsByCourse.get(a.courseId) ?? [];
    list.push(a);
    attemptsByCourse.set(a.courseId, list);
  }

  const exemptionsByRequirement = new Map(input.exemptions.map((e) => [e.curriculumRequirementId, e] as const));
  const substitutionsByRequirement = new Map(input.substitutions.map((s) => [s.originalCurriculumRequirementId, s] as const));
  const approvedTransfers = input.transfers.filter((t) => t.approvalStatus === 'APPROVED');
  const transfersByRequirement = new Map(
    approvedTransfers.filter((t) => t.mappedCurriculumRequirementId).map((t) => [t.mappedCurriculumRequirementId as string, t] as const),
  );
  const transfersByCourse = new Map(
    approvedTransfers.filter((t) => t.mappedCourseId).map((t) => [t.mappedCourseId as string, t] as const),
  );

  const equivalenciesToCourse = new Map<string, string[]>();
  for (const eq of input.equivalencies) {
    const addEdge = (to: string, from: string) => {
      const list = equivalenciesToCourse.get(to) ?? [];
      list.push(from);
      equivalenciesToCourse.set(to, list);
    };
    addEdge(eq.toCourseId, eq.fromCourseId);
    if (eq.direction === 'BIDIRECTIONAL') addEdge(eq.fromCourseId, eq.toCourseId);
  }

  const ctx: SatisfactionSearchContext = {
    attemptsByCourse, hardConsumed: new Set<string>(), exemptionsByRequirement,
    substitutionsByRequirement, equivalenciesToCourse, transfersByRequirement, transfersByCourse, consumedTransferIds: new Set<string>(),
  };

  const allocations: AllocationResult[] = [];
  const groupResults: RequirementGroupResult[] = [];
  // DA-46: tracks attempts already "spoken for" so the basket-fill step below
  // never re-offers one as a generic elective even when double counting is
  // disallowed on the group that already claimed it.
  const consumedByAnyGroup = new Set<string>();

  const orderedGroups = forcedOrder
    ? forcedOrder.map((id) => input.requirementGroups.find((g) => g.requirementGroupId === id)).filter((g): g is RequirementGroupInput => Boolean(g))
        .concat(input.requirementGroups.filter((g) => !forcedOrder.includes(g.requirementGroupId)))
    : sortGroupsByConstraint(input.requirementGroups);

  for (const group of orderedGroups) {
    const unmetReasons: string[] = [];
    const unmetRequirementIds: string[] = [];
    let coursesCounted = 0;
    let creditsCounted = 0;

    const compulsory = group.requirements.filter((r) => r.isCompulsoryWithinGroup && r.courseId);
    const elective = group.requirements.filter((r) => !r.isCompulsoryWithinGroup && r.courseId);
    const isPureBasket = group.requirements.length === 0 || group.requirements.every((r) => !r.courseId);

    for (const req of compulsory) {
      const found = findSatisfyingSource(req, ctx, group.allowDoubleCounting);
      if (found) {
        if (found.attempt && !group.allowDoubleCounting) ctx.hardConsumed.add(found.attempt.courseAttemptId);
        if (found.attempt) consumedByAnyGroup.add(found.attempt.courseAttemptId);
        if (found.transfer && !group.allowDoubleCounting) ctx.consumedTransferIds.add(found.transfer.creditTransferId);
        coursesCounted += 1;
        creditsCounted += found.creditUnits;
        allocations.push({
          curriculumRequirementId: req.curriculumRequirementId,
          requirementGroupId: group.requirementGroupId,
          courseAttemptId: found.attempt?.courseAttemptId,
          creditTransferId: found.transfer?.creditTransferId,
          allocatedCreditUnits: found.creditUnits,
          satisfactionMethod: found.method,
        });
      } else {
        unmetReasons.push(`Compulsory requirement not satisfied: course ${req.courseId}`);
        unmetRequirementIds.push(req.curriculumRequirementId);
      }
    }

    const satisfiedElectives: { req: CurriculumRequirementInput; found: SatisfactionMatch }[] = [];
    for (const req of elective) {
      if (group.maxCourses !== undefined && satisfiedElectives.length >= group.maxCourses) break;
      const found = findSatisfyingSource(req, ctx, group.allowDoubleCounting);
      if (found) satisfiedElectives.push({ req, found });
    }
    for (const { req, found } of satisfiedElectives) {
      if (found.attempt && !group.allowDoubleCounting) ctx.hardConsumed.add(found.attempt.courseAttemptId);
      if (found.attempt) consumedByAnyGroup.add(found.attempt.courseAttemptId);
      if (found.transfer && !group.allowDoubleCounting) ctx.consumedTransferIds.add(found.transfer.creditTransferId);
      coursesCounted += 1;
      creditsCounted += found.creditUnits;
      allocations.push({
        curriculumRequirementId: req.curriculumRequirementId,
        requirementGroupId: group.requirementGroupId,
        courseAttemptId: found.attempt?.courseAttemptId,
        creditTransferId: found.transfer?.creditTransferId,
        allocatedCreditUnits: found.creditUnits,
        satisfactionMethod: found.method,
      });
    }

    if (isPureBasket) {
      for (const a of passedAttempts) {
        if (group.maxCourses !== undefined && coursesCounted >= group.maxCourses) break;
        if (group.maxCreditUnits !== undefined && creditsCounted >= group.maxCreditUnits) break;
        if (!group.allowDoubleCounting && (consumedByAnyGroup.has(a.courseAttemptId) || ctx.hardConsumed.has(a.courseAttemptId))) continue;
        coursesCounted += 1;
        creditsCounted += a.creditUnits;
        if (!group.allowDoubleCounting) { ctx.hardConsumed.add(a.courseAttemptId); consumedByAnyGroup.add(a.courseAttemptId); }
        allocations.push({
          requirementGroupId: group.requirementGroupId,
          courseAttemptId: a.courseAttemptId,
          allocatedCreditUnits: a.creditUnits,
          satisfactionMethod: 'DIRECT',
        });
      }
    }

    const satisfiedElectiveIds = new Set(satisfiedElectives.map(({ req }) => req.curriculumRequirementId));
    const groupNeedsMoreCourses = group.minCourses !== undefined && coursesCounted < group.minCourses;
    const groupNeedsMoreCredits = group.minCreditUnits !== undefined && creditsCounted < group.minCreditUnits;
    if (groupNeedsMoreCourses) {
      unmetReasons.push(`Needs ${group.minCourses} course(s), has ${coursesCounted}`);
    }
    if (groupNeedsMoreCredits) {
      unmetReasons.push(`Needs ${group.minCreditUnits} credit unit(s), has ${creditsCounted}`);
    }
    if (groupNeedsMoreCourses || groupNeedsMoreCredits) {
      for (const req of elective) {
        if (!satisfiedElectiveIds.has(req.curriculumRequirementId)) unmetRequirementIds.push(req.curriculumRequirementId);
      }
    }

    // Stage 7: a group with elective/basket slots but no threshold at all
    // can never produce an unmet reason above — it is not really "checked,"
    // just structurally unable to fail. Fully compulsory groups don't have
    // this gap (each requirement is individually enforced regardless of
    // group-level thresholds), so this only ever fires for elective/basket
    // shapes — see RequirementGroupResult.needsReview's own comment.
    const hasElectiveOrBasketSlots = elective.length > 0 || isPureBasket;
    const hasNoThreshold = group.minCourses === undefined && group.minCreditUnits === undefined;
    const needsReview = hasElectiveOrBasketSlots && hasNoThreshold;

    groupResults.push({
      requirementGroupId: group.requirementGroupId,
      satisfied: unmetReasons.length === 0,
      coursesCounted,
      creditsCounted,
      unmetReasons,
      unmetRequirementIds,
      needsReview,
    });
  }

  return { allocations, groupResults };
}

// \u2500\u2500 Graduation requirement evaluation \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/** Bounded deterministic backtracking prevents a greedy ordering from falsely denying a student when overlapping elective groups exist. */
export function allocateRequirements(
  input: Pick<DegreeAuditInput, 'attempts' | 'exemptions' | 'substitutions' | 'transfers' | 'equivalencies' | 'requirementGroups' | 'courseRepeatPolicy'>,
): { allocations: AllocationResult[]; groupResults: RequirementGroupResult[] } {
  const initial = allocateRequirementsGreedy(input);
  if (initial.groupResults.every((g) => g.satisfied)) return initial;

  const groups = sortGroupsByConstraint(input.requirementGroups);
  const maxSearch = groups.length <= 8 ? 100000 : 5000;
  let explored = 0;
  let best = initial;
  const score = (r: { groupResults: RequirementGroupResult[] }) => r.groupResults.filter((g) => g.satisfied).length;
  const used = new Set<string>();
  const order: string[] = [];

  const dfs = (): void => {
    if (explored >= maxSearch || best.groupResults.every((g) => g.satisfied)) return;
    if (order.length === groups.length) {
      explored += 1;
      const candidate = allocateRequirementsGreedy(input, order);
      if (score(candidate) > score(best)) best = candidate;
      return;
    }
    for (const group of groups) {
      if (used.has(group.requirementGroupId)) continue;
      used.add(group.requirementGroupId); order.push(group.requirementGroupId);
      dfs();
      order.pop(); used.delete(group.requirementGroupId);
      if (explored >= maxSearch || best.groupResults.every((g) => g.satisfied)) return;
    }
  };
  dfs();
  if (explored >= maxSearch && !best.groupResults.every((group) => group.satisfied)) {
    return {
      allocations: best.allocations,
      groupResults: best.groupResults.map((group) => group.satisfied ? group : {
        ...group,
        // The bounded search did not prove that this failure is real. Keep the
        // unmet IDs for planning, but make the audit explicitly reviewable.
        satisfied: true,
        needsReview: true,
        unmetReasons: [...group.unmetReasons, 'ALLOCATION_SEARCH_LIMIT_REACHED'],
      }),
    };
  }
  return best;
}

function evaluateGraduationRequirement(
  gr: GraduationRequirementInput,
  input: DegreeAuditInput,
  allocations: AllocationResult[],
): GraduationRequirementResult {
  const cfg = gr.config;
  const requiredNum = (key: string): number | null => {
    const v = cfg[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  const configError = (detail: string): GraduationRequirementResult => ({
    graduationRequirementId: gr.graduationRequirementId, requirementType: gr.requirementType,
    satisfied: false, detail: `CONFIGURATION_ERROR: ${detail}`,
  });

  switch (gr.requirementType) {
    case 'MIN_CREDITS': {
      const min = requiredNum('minCredits');
      if (min === null || min < 0) return configError('minCredits is required and must be a non-negative number');
      const decisions = reconcileAttemptSupersession(
        input.attempts.map((a) => ({ courseAttemptId: a.courseAttemptId, courseId: a.courseId, outcome: a.outcome === 'PASSED' || a.outcome === 'FAILED' ? a.outcome : 'IN_PROGRESS', gradePoint: a.gradePoint, attemptNumber: a.attemptNumber })),
        input.courseRepeatPolicy,
      );
      const creditedIds = new Set(decisions.filter((d) => d.countsTowardCredits).map((d) => d.courseAttemptId));
      const totalCredits = input.attempts.filter((a) => a.outcome === 'PASSED' && a.countsTowardCredits && creditedIds.has(a.courseAttemptId))
        .reduce((sum, a) => sum + a.creditUnits, 0);
      const canonicalPassedCourseIds = new Set(input.attempts.filter((a) => a.outcome === 'PASSED' && creditedIds.has(a.courseAttemptId)).map((a) => a.courseId));
      const directlySatisfiedRequirementIds = new Set(allocations.filter((a) => a.satisfactionMethod !== 'TRANSFER').map((a) => a.curriculumRequirementId).filter((id): id is string => Boolean(id)));
      const uniqueTransfers = new Set<string>();
      const transferCredits = input.transfers.filter((t) => t.approvalStatus === 'APPROVED' && !uniqueTransfers.has(t.creditTransferId))
        .filter((t) => !(t.mappedCourseId && canonicalPassedCourseIds.has(t.mappedCourseId)))
        .filter((t) => !(t.mappedCurriculumRequirementId && directlySatisfiedRequirementIds.has(t.mappedCurriculumRequirementId)))
        .reduce((sum, t) => { uniqueTransfers.add(t.creditTransferId); return sum + t.creditUnits; }, 0);
      const total = totalCredits + transferCredits;
      return { graduationRequirementId: gr.graduationRequirementId, requirementType: gr.requirementType, satisfied: total >= min, detail: `${total}/${min} credit units (institutional ${totalCredits} + approved transfer ${transferCredits})` };
    }
    case 'MIN_CGPA': {
      const min = requiredNum('minCgpa');
      if (min === null || min < 0 || min > 5) return configError('minCgpa is required and must be between 0 and 5');
      return { graduationRequirementId: gr.graduationRequirementId, requirementType: gr.requirementType, satisfied: input.currentCgpa >= min, detail: `CGPA ${input.currentCgpa.toFixed(2)}/${min.toFixed(2)}` };
    }
    case 'MIN_RESIDENCY_CREDITS': {
      const min = requiredNum('minResidencyCredits');
      if (min === null || min < 0) return configError('minResidencyCredits is required and must be a non-negative number');
      const decisions = reconcileAttemptSupersession(
        input.attempts.map((a) => ({ courseAttemptId: a.courseAttemptId, courseId: a.courseId, outcome: a.outcome === 'PASSED' || a.outcome === 'FAILED' ? a.outcome : 'IN_PROGRESS', gradePoint: a.gradePoint, attemptNumber: a.attemptNumber })),
        input.courseRepeatPolicy,
      );
      const creditedIds = new Set(decisions.filter((d) => d.countsTowardCredits).map((d) => d.courseAttemptId));
      const residencyCredits = input.attempts.filter((a) => a.outcome === 'PASSED' && a.countsTowardCredits && creditedIds.has(a.courseAttemptId))
        .reduce((sum, a) => sum + a.creditUnits, 0);
      return { graduationRequirementId: gr.graduationRequirementId, requirementType: gr.requirementType, satisfied: residencyCredits >= min, detail: `${residencyCredits}/${min} institutional credit units` };
    }
    case 'PROJECT':
    case 'THESIS':
    case 'INTERNSHIP': {
      const targetReqId = typeof cfg.curriculumRequirementId === 'string' ? cfg.curriculumRequirementId : '';
      const satisfied = allocations.some((a) => a.curriculumRequirementId === targetReqId);
      return { graduationRequirementId: gr.graduationRequirementId, requirementType: gr.requirementType, satisfied, detail: satisfied ? 'Satisfied' : `Requirement ${targetReqId} not yet satisfied` };
    }
    case 'MAX_DURATION': {
      const max = requiredNum('maxYears');
      if (max === null || max < 0) return configError('maxYears is required and must be a non-negative number');
      return { graduationRequirementId: gr.graduationRequirementId, requirementType: gr.requirementType, satisfied: input.totalElapsedYears <= max, detail: `${input.totalElapsedYears.toFixed(1)}/${max} years` };
    }
    case 'CUSTOM':
    default:
      return { graduationRequirementId: gr.graduationRequirementId, requirementType: gr.requirementType, satisfied: false, detail: 'CUSTOM requirement \u2014 requires manual review, not auto-evaluated' };
  }
}

// \u2500\u2500 Orchestrator \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/**
 * DA-74/94: the single deterministic entry point. Callers persist the
 * returned object verbatim as DegreeAudit.requirementResults (see
 * docs/architecture.md \u00a75). This function has no side effects and reads
 * no external state (no clock, no DB), so the same input always produces the
 * same output \u2014 DA-64 reproducibility.
 */
export function computeDegreeAudit(input: DegreeAuditInput): DegreeAuditResult {
  const validationErrors = validateDegreeAuditInput(input);
  if (validationErrors.length > 0) {
    return {
      overallStatus: 'NOT_ELIGIBLE',
      requirementGroupResults: input.requirementGroups.map((g) => ({ requirementGroupId: g.requirementGroupId, satisfied: false, coursesCounted: 0, creditsCounted: 0, unmetReasons: ['INPUT_VALIDATION_ERROR'], unmetRequirementIds: [], needsReview: false })),
      graduationRequirementResults: input.graduationRequirements.map((gr) => ({ graduationRequirementId: gr.graduationRequirementId, requirementType: gr.requirementType, satisfied: false, detail: `INPUT_VALIDATION_ERROR: ${validationErrors.join('; ')}` })),
      allocations: [],
    };
  }
  const { allocations, groupResults } = allocateRequirements(input);
  const graduationRequirementResults = input.graduationRequirements.map((gr) =>
    evaluateGraduationRequirement(gr, input, allocations),
  );

  // Every RequirementGroup attached to a curriculum is inherently required
  // (which specific courses fill it may be flexible; that the basket itself
  // gets filled is not) \u2014 there is no separate "optional group" concept.
  const anyGroupUnsatisfied = groupResults.some((g) => !g.satisfied);
  // Stage 7: distinct from "unsatisfied" \u2014 a needsReview group always
  // reports satisfied=true (nothing to fail against), so this is checked
  // independently rather than folded into anyGroupUnsatisfied.
  const anyGroupNeedsReview = groupResults.some((g) => g.needsReview);

  const mandatoryGradReqs = input.graduationRequirements.filter((gr) => gr.isMandatory);
  const mandatoryNonCustomUnmet = mandatoryGradReqs.some((gr) => {
    if (gr.requirementType === 'CUSTOM') return false; // handled via hasPendingCustom below
    const result = graduationRequirementResults.find((r) => r.graduationRequirementId === gr.graduationRequirementId);
    return !result?.satisfied;
  });
  const hasPendingCustom = mandatoryGradReqs.some((gr) => gr.requirementType === 'CUSTOM');

  let overallStatus: DegreeAuditStatus;
  if (anyGroupUnsatisfied || mandatoryNonCustomUnmet) {
    // A confirmed failure always wins \u2014 an unreviewed group elsewhere in
    // the curriculum doesn't get to soften a real NOT_ELIGIBLE into a PENDING_REVIEW.
    overallStatus = 'NOT_ELIGIBLE';
  } else if (hasPendingCustom || anyGroupNeedsReview) {
    overallStatus = 'PENDING_REVIEW';
  } else {
    overallStatus = 'ELIGIBLE';
  }

  return { overallStatus, requirementGroupResults: groupResults, graduationRequirementResults, allocations };
}

// ==============================================================================
// INTEGRATED ACADEMIC DOMAIN STAGE 5: backfill-mappers.ts
// ==============================================================================

/**
 * Backfill mapping/matching logic \u2014 Deep Audit (Aug 2026), Stage 4.
 *
 * Pure functions extracted out of the six backfill scripts in
 * apps/api/prisma/backfills/ for the same reason degree-audit.ts and
 * progression.ts are pure: this sandbox has no Postgres and no reachable
 * Prisma query-engine binary, so the scripts themselves (real DB I/O)
 * cannot be executed here \u2014 but the actual risk in a backfill is almost
 * always in the MATCHING/GROUPING logic, not the I/O. Pulling that logic out
 * to plain functions means it's the one part of this stage that gets real,
 * run test coverage instead of "reviewed by eye."
 *
 * Every backfill script imports from here rather than reimplementing
 * matching inline \u2014 see each script's own header for which function(s) it uses.
 */

// \u2500\u2500 1. Semester -> AcademicCalendar (fixes DA-17/70's missing FK) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export interface CalendarRef { id: string; academicYear: string; }
export interface SemesterYearRef { id: string; academicYear: string; }

export type MatchResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function matchSemesterToCalendar(semester: SemesterYearRef, calendars: CalendarRef[]): MatchResult<{ calendarId: string }> {
  const norm = (s: string) => s.trim();
  const matches = calendars.filter((c) => norm(c.academicYear) === norm(semester.academicYear));
  if (matches.length === 0) return { ok: false, error: `No AcademicCalendar found with academicYear "${semester.academicYear}" (Semester ${semester.id})` };
  if (matches.length > 1) return { ok: false, error: `Ambiguous: ${matches.length} AcademicCalendar rows share academicYear "${semester.academicYear}" (${matches.map((m) => m.id).join(', ')}) \u2014 needs manual resolution before backfilling Semester ${semester.id}` };
  return { ok: true, value: { calendarId: matches[0].id } };
}

// \u2500\u2500 2. CourseOffering -> Semester (completes the semesterId migration DA-16/69 flags as already in progress) \u2500\u2500

export interface OfferingLegacyRef { id: string; academicCalendarId: string; academicYear: string; semesterEnum: string; }
export interface SemesterCandidateRef { id: string; academicCalendarId: string | null; academicYear: string; semesterNumber: number; termType: string | null; }

const ENUM_TO_NUMBER: Record<string, number> = { FIRST: 1, SECOND: 2, SUMMER: 3 };

export function matchOfferingToSemester(offering: OfferingLegacyRef, semesters: SemesterCandidateRef[]): MatchResult<{ semesterId: string }> {
  const byCalendar = semesters.filter((s) => s.academicCalendarId === offering.academicCalendarId);
  // Falls back to matching by the (legacy, still-present) academicYear string
  // only when the calendar FK itself hasn't been backfilled yet for that
  // Semester row \u2014 run backfill script 01 before 02, but don't hard-fail if
  // run out of order.
  const pool = byCalendar.length > 0 ? byCalendar : semesters.filter((s) => s.academicYear.trim() === offering.academicYear.trim());
  const expectedNumber = ENUM_TO_NUMBER[offering.semesterEnum];
  const matches = pool.filter((s) => s.termType === offering.semesterEnum || s.semesterNumber === expectedNumber);

  if (matches.length === 0) return { ok: false, error: `No Semester found for CourseOffering ${offering.id} (calendar ${offering.academicCalendarId}, term ${offering.semesterEnum})` };
  if (matches.length > 1) return { ok: false, error: `Ambiguous: ${matches.length} Semester rows match CourseOffering ${offering.id} (${matches.map((m) => m.id).join(', ')})` };
  return { ok: true, value: { semesterId: matches[0].id } };
}

// \u2500\u2500 3. Grade scale seed validation + minGrade string -> GradeDefinition (DA-9/33) \u2500\u2500\u2500\u2500

export interface GradeBand { letter: string; minScore: number; maxScore: number; gradePoint: number; isPassing: boolean; }

/** Confirms a proposed grade scale is contiguous and covers 0-100 with no
 * gaps or overlaps before it's ever inserted \u2014 catches a typo'd band
 * (e.g. a gap between D's max and C's min) that would otherwise silently
 * leave some scores unclassifiable. */
export function validateGradeBands(bands: GradeBand[]): string[] {
  const problems: string[] = [];
  if (bands.length === 0) return ['No bands provided'];
  const sorted = [...bands].sort((a, b) => a.minScore - b.minScore);
  if (sorted[0].minScore !== 0) problems.push(`Bands must start at 0 (lowest minScore is ${sorted[0].minScore}, band "${sorted[0].letter}")`);
  const top = sorted[sorted.length - 1];
  if (top.maxScore !== 100) problems.push(`Bands must end at 100 (highest maxScore is ${top.maxScore}, band "${top.letter}")`);
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    if (cur.maxScore + 1 !== next.minScore) {
      problems.push(`Gap or overlap between "${cur.letter}" (max ${cur.maxScore}) and "${next.letter}" (min ${next.minScore})`);
    }
  }
  return problems;
}

export function matchGradeLetter(minGrade: string, definitions: { letter: string; id: string }[]): MatchResult<{ gradeDefinitionId: string }> {
  const normalized = minGrade.trim().toUpperCase();
  const match = definitions.find((d) => d.letter.trim().toUpperCase() === normalized);
  if (!match) return { ok: false, error: `No GradeDefinition matches minGrade "${minGrade}"` };
  return { ok: true, value: { gradeDefinitionId: match.id } };
}

// \u2500\u2500 4. ProgrammeCourse -> RequirementGroup buckets (DA-5) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export interface ProgrammeCourseRef { id: string; programmeId: string; courseId: string; level: number; semester: string; isCompulsory: boolean; }
export interface GroupedRequirement {
  groupKey: string;
  programmeId: string;
  level: number;
  semester: string;
  isCompulsory: boolean;
  courseIds: string[];
  sourceProgrammeCourseIds: string[];
}

/** One RequirementGroup per (programme, level, semester, isCompulsory)
 * bucket \u2014 mirrors exactly what docs/architecture.md \u00a72 step 4
 * describes. Buckets are returned sorted (level, then semester, then
 * compulsory-before-elective) so generated group names/ordering are stable
 * across repeat runs, not dependent on DB row-return order. */
export function groupProgrammeCoursesIntoRequirementGroups(rows: ProgrammeCourseRef[]): GroupedRequirement[] {
  const buckets = new Map<string, GroupedRequirement>();
  for (const row of rows) {
    const key = `${row.programmeId}|${row.level}|${row.semester}|${row.isCompulsory}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { groupKey: key, programmeId: row.programmeId, level: row.level, semester: row.semester, isCompulsory: row.isCompulsory, courseIds: [], sourceProgrammeCourseIds: [] };
      buckets.set(key, bucket);
    }
    bucket.courseIds.push(row.courseId);
    bucket.sourceProgrammeCourseIds.push(row.id);
  }
  return [...buckets.values()].sort((a, b) =>
    a.programmeId.localeCompare(b.programmeId) || a.level - b.level || a.semester.localeCompare(b.semester) || Number(b.isCompulsory) - Number(a.isCompulsory),
  );
}

// \u2500\u2500 5. CoursePrerequisite -> PrerequisiteGroup (DA-8) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export interface CoursePrerequisiteRef { id: string; courseId: string; prerequisiteId: string; minGrade: string; }
export interface GroupedPrerequisite { courseId: string; items: { prerequisiteCourseId: string; minGrade: string; sourceId: string }[]; }

/** One ALL_OF PrerequisiteGroup per course that has at least one legacy
 * CoursePrerequisite row, containing one PrerequisiteGroupItem per row \u2014
 * the direct, lossless migration path docs/architecture.md \u00a72 step 5 describes. */
export function groupPrerequisitesIntoGroups(rows: CoursePrerequisiteRef[]): GroupedPrerequisite[] {
  const buckets = new Map<string, GroupedPrerequisite>();
  for (const row of rows) {
    let bucket = buckets.get(row.courseId);
    if (!bucket) { bucket = { courseId: row.courseId, items: [] }; buckets.set(row.courseId, bucket); }
    bucket.items.push({ prerequisiteCourseId: row.prerequisiteId, minGrade: row.minGrade, sourceId: row.id });
  }
  return [...buckets.values()];
}

// \u2500\u2500 6. registeredCount backfill (DA-15) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export interface RegistrationCountRef { courseOfferingId: string; status: string; }

/** Counts only the statuses that should occupy a capacity seat. Excludes
 * DROPPED/WITHDRAWN (freed the seat) and the pre-confirmation states
 * DRAFT/SUBMITTED/VALIDATED (DA-85 \u2014 not committed yet). Mirrors what the
 * transactional increment/decrement in the live registration flow should
 * maintain going forward; this is only the one-time catch-up for existing rows. */
export function computeRegisteredCounts(registrations: RegistrationCountRef[]): Map<string, number> {
  const counted = new Set(['REGISTERED', 'COMPLETED']);
  const counts = new Map<string, number>();
  for (const r of registrations) {
    if (!counted.has(r.status)) continue;
    counts.set(r.courseOfferingId, (counts.get(r.courseOfferingId) ?? 0) + 1);
  }
  return counts;
}
