import { computeCgpa, computeGradeForSystem, isPassingResult } from './grades';
describe('configurable grading systems', () => {
  it('supports Nigerian 5-point', () => expect(computeGradeForSystem(70,'NIGERIAN_5_POINT')).toEqual({grade:'A',gradePoint:5}));
  it('supports US 4-point', () => expect(computeGradeForSystem(93,'US_4_POINT')).toEqual({grade:'A',gradePoint:4}));
  it('rejects invalid scores instead of silently clamping', () => expect(() => computeGradeForSystem(101,'NIGERIAN_5_POINT')).toThrow());
  it('treats ABS as non-passing even though it is a published result', () => {
    expect(isPassingResult({ grade: 'ABS', gradePoint: 0 })).toBe(false);
  });
  it('treats any zero-grade-point special outcome as non-passing', () => {
    expect(isPassingResult({ grade: 'W', gradePoint: 0 })).toBe(false);
  });
  it('counts only positive-grade-point outcomes as earned credit units', () => {
    expect(computeCgpa([
      { grade: 'A', gradePoint: 5, creditUnits: 3 },
      { grade: 'ABS', gradePoint: 0, creditUnits: 3 },
    ])).toEqual({ cgpa: 2.5, totalCreditUnitsEarned: 3 });
  });
});
