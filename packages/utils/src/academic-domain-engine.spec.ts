import {
  computeDegreeAudit,
  evaluateAcademicStanding,
  evaluateProgression,
  resolveApplicablePolicyVersion,
} from './academic-domain-engine';

describe('academic-domain-engine hardening', () => {
  const baseAttempt = {
    courseAttemptId: 'a1', courseId: 'c1', creditUnits: 3,
    outcome: 'PASSED' as const, attemptNumber: 1, gradePoint: 3,
    countsTowardCredits: true,
  };

  it('fails closed when mandatory graduation configuration is missing', () => {
    const result = computeDegreeAudit({
      attempts: [baseAttempt], exemptions: [], substitutions: [], transfers: [], equivalencies: [],
      requirementGroups: [], currentCgpa: 3.5, totalElapsedYears: 4,
      courseRepeatPolicy: 'REPLACE',
      graduationRequirements: [{ graduationRequirementId: 'g1', requirementType: 'MIN_CREDITS', config: {}, isMandatory: true }],
    });
    expect(result.overallStatus).toBe('NOT_ELIGIBLE');
    expect(result.graduationRequirementResults[0]?.detail).toContain('CONFIGURATION_ERROR');
  });

  it('counts only the canonical repeat attempt for graduation credits', () => {
    const result = computeDegreeAudit({
      attempts: [
        baseAttempt,
        { ...baseAttempt, courseAttemptId: 'a2', attemptNumber: 2, gradePoint: 4 },
      ], exemptions: [], substitutions: [], transfers: [], equivalencies: [], requirementGroups: [],
      currentCgpa: 4, totalElapsedYears: 4, courseRepeatPolicy: 'REPLACE',
      graduationRequirements: [{ graduationRequirementId: 'g1', requirementType: 'MIN_CREDITS', config: { minCredits: 3 }, isMandatory: true }],
    });
    expect(result.graduationRequirementResults[0]?.satisfied).toBe(true);
    expect(result.graduationRequirementResults[0]?.detail).toContain('institutional 3');
  });

  it('accepts only approved transfer credit', () => {
    const result = computeDegreeAudit({
      attempts: [], exemptions: [], substitutions: [], equivalencies: [], requirementGroups: [],
      transfers: [{ creditTransferId: 't1', creditUnits: 6, approvalStatus: 'PENDING', mappedCourseId: 'c1' }],
      currentCgpa: 3, totalElapsedYears: 4, courseRepeatPolicy: 'REPLACE',
      graduationRequirements: [{ graduationRequirementId: 'g1', requirementType: 'MIN_CREDITS', config: { minCredits: 6 }, isMandatory: true }],
    });
    expect(result.overallStatus).toBe('NOT_ELIGIBLE');
  });

  it('emits structured unmet requirement identifiers for incomplete elective baskets', () => {
    const result = computeDegreeAudit({
      attempts: [baseAttempt],
      exemptions: [], substitutions: [], transfers: [], equivalencies: [],
      requirementGroups: [{
        requirementGroupId: 'electives', name: 'Electives', groupType: 'DEPARTMENTAL_ELECTIVE',
        minCourses: 2, allowDoubleCounting: false,
        requirements: [
          { curriculumRequirementId: 'req-1', courseId: 'c1', isCompulsoryWithinGroup: false },
          { curriculumRequirementId: 'req-2', courseId: 'c2', isCompulsoryWithinGroup: false },
        ],
      }],
      currentCgpa: 3.5, totalElapsedYears: 4, courseRepeatPolicy: 'REPLACE',
      graduationRequirements: [],
    });
    expect(result.requirementGroupResults[0]?.satisfied).toBe(false);
    expect(result.requirementGroupResults[0]?.unmetRequirementIds).toEqual(['req-2']);
  });

  it('fails safe to pending review when overlapping allocation search is bounded', () => {
    const result = computeDegreeAudit({
      attempts: [baseAttempt], exemptions: [], substitutions: [], transfers: [], equivalencies: [],
      requirementGroups: Array.from({ length: 9 }, (_, index) => ({
        requirementGroupId: `overlap-${index}`, name: `Overlap ${index}`, groupType: 'DEPARTMENTAL_ELECTIVE',
        minCourses: 1, allowDoubleCounting: false,
        requirements: [{ curriculumRequirementId: `overlap-req-${index}`, courseId: 'c1', isCompulsoryWithinGroup: false }],
      })),
      currentCgpa: 3.5, totalElapsedYears: 4, courseRepeatPolicy: 'REPLACE', graduationRequirements: [],
    });
    expect(result.overallStatus).toBe('PENDING_REVIEW');
    expect(result.requirementGroupResults.some((group) => group.needsReview && group.unmetReasons.includes('ALLOCATION_SEARCH_LIMIT_REACHED'))).toBe(true);
  });

  it('uses deterministic policy tie-breaking', () => {
    const base = { scope: 'INSTITUTION' as const, scopeId: null, priority: 10, effectiveFrom: '2026-01-01', approvalStatus: 'ACTIVE' as const };
    expect(resolveApplicablePolicyVersion([
      { ...base, id: 'b' }, { ...base, id: 'a' },
    ], {})!.id).toBe('a');
  });

  it('rejects invalid standing policy instead of inventing a decision', () => {
    expect(() => evaluateAcademicStanding(
      { creditUnitsAttempted: 15, creditUnitsEarned: 15, gpa: 3, cgpa: 3, failedCourseCount: 0 },
      [],
      { probationCgpaThreshold: 3, warningCgpaThreshold: 2, consecutiveProbationPeriodsForSuspension: 2 },
    )).toThrow();
  });

  it('validates progression thresholds', () => {
    expect(() => evaluateProgression(
      { creditUnitsAttempted: 15, creditUnitsEarned: 15, gpa: 3, cgpa: 3, failedCourseCount: 0 },
      { minCreditUnitsToProgress: 15, minCgpaForUnconditionalProgress: 2, maxCarryoversForConditionalProgress: -1, conditionalProgressionAction: 'PROMOTE_WITH_CARRYOVER' },
    )).toThrow();
  });
});
