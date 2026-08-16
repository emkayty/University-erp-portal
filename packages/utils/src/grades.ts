export type GradingSystem = 'NIGERIAN_5_POINT' | 'US_4_POINT';
export interface GradeResult { grade: string; gradePoint: number }

export function computeGrade(score: number, absentFromExam = false): GradeResult {
  return computeGradeForSystem(score, 'NIGERIAN_5_POINT', absentFromExam);
}

export function computeGradeForSystem(score: number, system: GradingSystem, absentFromExam = false): GradeResult {
  if (!Number.isFinite(score) || score < 0 || score > 100) throw new RangeError('Score must be a finite number between 0 and 100');
  if (absentFromExam) return { grade: 'ABS', gradePoint: 0 };
  if (system === 'NIGERIAN_5_POINT') {
    if (score >= 70) return { grade: 'A', gradePoint: 5 };
    if (score >= 60) return { grade: 'B', gradePoint: 4 };
    if (score >= 50) return { grade: 'C', gradePoint: 3 };
    if (score >= 45) return { grade: 'D', gradePoint: 2 };
    if (score >= 40) return { grade: 'E', gradePoint: 1 };
    return { grade: 'F', gradePoint: 0 };
  }
  // Institutional default US-style scale. Score boundaries remain policy-driven at the API layer.
  if (score >= 93) return { grade: 'A', gradePoint: 4.0 };
  if (score >= 90) return { grade: 'A-', gradePoint: 3.7 };
  if (score >= 87) return { grade: 'B+', gradePoint: 3.3 };
  if (score >= 83) return { grade: 'B', gradePoint: 3.0 };
  if (score >= 80) return { grade: 'B-', gradePoint: 2.7 };
  if (score >= 77) return { grade: 'C+', gradePoint: 2.3 };
  if (score >= 73) return { grade: 'C', gradePoint: 2.0 };
  if (score >= 70) return { grade: 'C-', gradePoint: 1.7 };
  if (score >= 67) return { grade: 'D+', gradePoint: 1.3 };
  if (score >= 63) return { grade: 'D', gradePoint: 1.0 };
  if (score >= 60) return { grade: 'D-', gradePoint: 0.7 };
  return { grade: 'F', gradePoint: 0 };
}

export type CourseRepeatPolicy = 'REPLACE' | 'INCLUDE' | 'BEST';
export interface ResultForCgpa { courseOfferingId: string; courseId?: string; semesterId?: string; gradePoint: number; creditUnits: number; grade: string; senatePublishedAt?: Date; attemptNumber?: number; }
type NumericGradePoint = number | { toNumber(): number };
export function applyRepeatPolicy(results: ResultForCgpa[], policy: CourseRepeatPolicy): ResultForCgpa[] {
  if (policy === 'INCLUDE' || results.length === 0) return results;
  const grouped = new Map<string, ResultForCgpa[]>();
  for (const r of results) { const key = r.courseId ?? r.courseOfferingId; if (!grouped.has(key)) grouped.set(key, []); grouped.get(key)!.push(r); }
  const filtered: ResultForCgpa[] = [];
  for (const rs of grouped.values()) {
    if (rs.length === 1) { filtered.push(rs[0]); continue; }
    filtered.push([...rs].sort((a,b) => policy === 'BEST' ? (b.gradePoint-a.gradePoint) || ((b.attemptNumber??0)-(a.attemptNumber??0)) : ((b.attemptNumber??0)-(a.attemptNumber??0)))[0]);
  }
  return filtered;
}
export function computeCgpa(results: Array<{ gradePoint: NumericGradePoint; creditUnits: number; grade: string }>): { cgpa: number; totalCreditUnitsEarned: number } {
  if (!results.length) return { cgpa: 0, totalCreditUnitsEarned: 0 };
  let weighted=0,total=0,earned=0;
  for (const r of results) {
    const gp = typeof r.gradePoint === 'number' ? r.gradePoint : r.gradePoint.toNumber();
    weighted += gp * r.creditUnits;
    total += r.creditUnits;
    if (r.grade !== 'F' && r.grade !== 'ABS') earned += r.creditUnits;
  }
  return { cgpa: total ? Math.round((weighted/total)*100)/100 : 0, totalCreditUnitsEarned: earned };
}
export function getDegreeClass(cgpa: number): string { return getDegreeClassForSystem(cgpa, 'NIGERIAN_5_POINT'); }
export function getDegreeClassForSystem(cgpa: number, system: GradingSystem): string {
  if (system === 'US_4_POINT') {
    if (cgpa >= 3.70) return 'Summa Cum Laude / First-Class Equivalent';
    if (cgpa >= 3.30) return 'Magna Cum Laude / Upper Second Equivalent';
    if (cgpa >= 3.00) return 'Cum Laude / Second-Class Equivalent';
    if (cgpa >= 2.00) return 'Pass / Satisfactory';
    return 'Academic Deficiency';
  }
  if (cgpa >= 4.5) return 'First Class Honours';
  if (cgpa >= 3.5) return 'Second Class Upper (2:1)';
  if (cgpa >= 2.4) return 'Second Class Lower (2:2)';
  if (cgpa >= 1.5) return 'Third Class';
  if (cgpa >= 1) return 'Pass';
  return 'Fail';
}
