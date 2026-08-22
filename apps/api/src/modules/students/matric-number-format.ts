export type MatricNumberFormatValues = {
  institutionCode: string;
  facultyCode: string;
  departmentCode: string;
  programmeCode: string;
  admissionYear: string;
};

export type MatricNumberSequenceScope = 'GLOBAL' | 'YEAR' | 'DEPARTMENT_YEAR';

const TOKEN_PATTERN = /\{(INSTITUTION|FACULTY|DEPT|PROGRAMME|YEAR|ENTRY_YEAR|SEQ(?::(\d{1,2}))?)\}/g;
const VALID_FORMAT_PATTERN = /^(?=.{5,120}$)(?:[A-Za-z0-9 ._\-/]|\{(?:INSTITUTION|FACULTY|DEPT|PROGRAMME|YEAR|ENTRY_YEAR|SEQ(?::\d{1,2})?)\})+$/;
const SEQUENCE_TOKEN_PATTERN = /\{SEQ(?::(\d{1,2}))?\}$/;

export const DEFAULT_MATRIC_NUMBER_FORMAT = '{DEPT}/{YEAR}/{SEQ:05}';

export function validateMatricNumberFormat(format: string): string | null {
  const normalized = format.trim();
  if (!VALID_FORMAT_PATTERN.test(normalized)) {
    return 'Matriculation format contains unsupported characters or tokens.';
  }
  const sequenceMatches = normalized.match(/\{SEQ(?::\d{1,2})?\}/g) ?? [];
  if (sequenceMatches.length !== 1 || !SEQUENCE_TOKEN_PATTERN.test(normalized)) {
    return 'Matriculation format must contain exactly one {SEQ} token at the end, optionally padded such as {SEQ:05}.';
  }
  const tokenNames = [...normalized.matchAll(TOKEN_PATTERN)].map((match) => match[1]);
  if (new Set(tokenNames).size !== tokenNames.length) {
    return 'Each matriculation token may be used only once.';
  }
  return null;
}

export function renderMatricNumberPrefix(format: string, values: MatricNumberFormatValues): { prefix: string; padding: number } {
  const error = validateMatricNumberFormat(format);
  if (error) throw new Error(error);
  const sequenceToken = format.match(/\{SEQ(?::(\d{1,2}))?\}$/);
  const padding = Math.max(1, Math.min(Number(sequenceToken?.[1] ?? 1), 20));
  const prefixFormat = format.slice(0, format.lastIndexOf('{SEQ'));
  const prefix = prefixFormat.replace(TOKEN_PATTERN, (_whole, token: string) => {
    const lookup: Record<string, string> = {
      INSTITUTION: values.institutionCode,
      FACULTY: values.facultyCode,
      DEPT: values.departmentCode,
      PROGRAMME: values.programmeCode,
      YEAR: values.admissionYear,
      ENTRY_YEAR: values.admissionYear,
    };
    return lookup[token] ?? '';
  });
  return { prefix, padding };
}

export function renderMatricNumber(format: string, values: MatricNumberFormatValues, sequence: number): string {
  const { prefix, padding } = renderMatricNumberPrefix(format, values);
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('Matriculation sequence must be a positive integer.');
  return `${prefix}${String(sequence).padStart(padding, '0')}`;
}
