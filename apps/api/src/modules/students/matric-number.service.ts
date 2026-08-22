import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { buildAdvisoryLockKey } from '@uniportal/utils';
import { DirectPrismaService } from '../../database/direct-prisma.service';
import {
  DEFAULT_MATRIC_NUMBER_FORMAT,
  renderMatricNumber,
  renderMatricNumberPrefix,
  type MatricNumberFormatValues,
  type MatricNumberSequenceScope,
} from './matric-number-format';

/**
 * Generates institution-configured, unique matriculation numbers.
 *
 * Supported format tokens:
 * {INSTITUTION}, {FACULTY}, {DEPT}, {PROGRAMME}, {YEAR}, {ENTRY_YEAR},
 * and exactly one trailing sequence token: {SEQ} or {SEQ:05}.
 *
 * The generator remains on DirectPrismaService because its advisory lock and
 * cross-student sequence lookup must not be weakened by a transaction-pooled
 * connection or row-level security.
 */
@Injectable()
export class MatricNumberService {
  private readonly logger = new Logger(MatricNumberService.name);

  constructor(private readonly direct: DirectPrismaService) {}

  async generate(
    departmentCode: string,
    admissionYear: string,
    context: Partial<Pick<MatricNumberFormatValues, 'institutionCode' | 'facultyCode' | 'programmeCode'>> = {},
  ): Promise<string> {
    return this.direct.$transaction(async (tx) => {
      const settings = await tx.institutionSettings.findFirst({
        select: {
          institutionCode: true,
          matricNumberFormat: true,
          matricNumberSequenceScope: true,
        },
      });
      const format = settings?.matricNumberFormat?.trim() || DEFAULT_MATRIC_NUMBER_FORMAT;
      const sequenceScope = (settings?.matricNumberSequenceScope ?? 'DEPARTMENT_YEAR') as MatricNumberSequenceScope;
      const values: MatricNumberFormatValues = {
        institutionCode: normalizeCode(context.institutionCode ?? settings?.institutionCode ?? 'UNI'),
        facultyCode: normalizeCode(context.facultyCode ?? 'FAC'),
        departmentCode: normalizeCode(departmentCode),
        programmeCode: normalizeCode(context.programmeCode ?? departmentCode),
        admissionYear: normalizeYear(admissionYear),
      };

      let prefixAndPadding: ReturnType<typeof renderMatricNumberPrefix>;
      try {
        prefixAndPadding = renderMatricNumberPrefix(format, values);
      } catch (error) {
        throw new UnprocessableEntityException({
          code: 'MATRIC_NUMBER_FORMAT_INVALID',
          message: error instanceof Error ? error.message : 'The configured matriculation format is invalid.',
        });
      }

      const lockScope = sequenceScope === 'GLOBAL'
        ? 'GLOBAL'
        : sequenceScope === 'YEAR'
          ? values.admissionYear
          : `${values.departmentCode}/${values.admissionYear}`;
      const lockKey = buildAdvisoryLockKey('matric-number', lockScope);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey}::bigint)`;

      // The sequence token is required to be the final component. That makes
      // the prefix query deterministic while allowing the institution to place
      // its other identifiers in any order before the sequence.
      const existing = await tx.student.findMany({
        where: { matricNo: { startsWith: prefixAndPadding.prefix } },
        select: { matricNo: true },
        orderBy: { matricNo: 'desc' },
        take: 250,
      });
      const sequence = existing.reduce((highest, student) => {
        const suffix = student.matricNo.slice(prefixAndPadding.prefix.length);
        const parsed = /^\d+$/.test(suffix) ? Number(suffix) : 0;
        return Number.isSafeInteger(parsed) ? Math.max(highest, parsed) : highest;
      }, 0) + 1;
      const matricNo = renderMatricNumber(format, values, sequence);
      if (matricNo.length > 80) {
        throw new UnprocessableEntityException({ code: 'MATRIC_NUMBER_TOO_LONG', message: 'The configured matriculation format produces an identifier longer than 80 characters.' });
      }
      this.logger.log(`Generated configured matric number: ${matricNo}`);
      return matricNo;
    });
  }
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 30) || 'X';
}

function normalizeYear(value: string): string {
  const normalized = value.trim();
  if (!/^\d{4}$/.test(normalized)) throw new UnprocessableEntityException('Admission year must be a four-digit year.');
  return normalized;
}
