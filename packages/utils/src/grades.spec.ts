import { computeGradeForSystem } from './grades';
describe('configurable grading systems', () => {
  it('supports Nigerian 5-point', () => expect(computeGradeForSystem(70,'NIGERIAN_5_POINT')).toEqual({grade:'A',gradePoint:5}));
  it('supports US 4-point', () => expect(computeGradeForSystem(93,'US_4_POINT')).toEqual({grade:'A',gradePoint:4}));
  it('rejects invalid scores instead of silently clamping', () => expect(() => computeGradeForSystem(101,'NIGERIAN_5_POINT')).toThrow());
});
