import { renderMatricNumber, renderMatricNumberPrefix, validateMatricNumberFormat } from './matric-number-format';

describe('matric-number-format', () => {
  const values = {
    institutionCode: 'UNI',
    facultyCode: 'SCI',
    departmentCode: 'CSC',
    programmeCode: 'CSC-BSC',
    admissionYear: '2026',
  };

  it('renders a configured hierarchy format with padded sequence', () => {
    expect(renderMatricNumber('{INSTITUTION}/{YEAR}/{DEPT}/{SEQ:05}', values, 12)).toBe('UNI/2026/CSC/00012');
  });

  it('requires exactly one sequence token at the end', () => {
    expect(validateMatricNumberFormat('{DEPT}/{YEAR}')).toContain('exactly one');
    expect(validateMatricNumberFormat('{SEQ}/{DEPT}')).toContain('at the end');
    expect(validateMatricNumberFormat('{DEPT}/{SEQ}/{SEQ:05}')).toContain('exactly one');
  });

  it('rejects unsupported tokens and duplicate tokens', () => {
    expect(validateMatricNumberFormat('{COLLEGE}/{SEQ:05}')).toContain('unsupported');
    expect(validateMatricNumberFormat('{DEPT}/{DEPT}/{SEQ:05}')).toContain('only once');
  });

  it('returns the stable search prefix and configured padding', () => {
    expect(renderMatricNumberPrefix('{DEPT}/{YEAR}/{SEQ:06}', values)).toEqual({ prefix: 'CSC/2026/', padding: 6 });
  });
});
