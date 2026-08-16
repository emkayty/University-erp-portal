import { ReportFormat } from '@prisma/client';
import { ReportArtifactService } from './report-artifact.service';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { PrivateObjectStorageService } from '../../../common/storage/private-object-storage.service';

describe('ReportArtifactService', () => {
  const config = { get: jest.fn((key: string, fallback?: unknown) => {
    const values: Record<string, unknown> = { NODE_ENV: 'test', S3_REPORTS_BUCKET: undefined, AWS_REGION: 'us-east-1' };
    return values[key] ?? fallback;
  }) } as never;
  let service: ReportArtifactService;
  const storage = { putObject: jest.fn(), presignGet: jest.fn() } as unknown as PrivateObjectStorageService;
  const id = '00000000-0000-0000-0000-000000000123';
  const rows = [{ matricNo: 'K6/1', name: 'Ada', nested: { level: 100 } }, { matricNo: 'K6/2', name: 'Bola', nested: { level: 200 } }];

  beforeEach(() => { service = new ReportArtifactService(config, storage); });
  afterEach(async () => { for (const f of ['csv', 'xlsx', 'pdf']) await unlink(join(process.cwd(), '.artifacts/reports', `${id}.${f}`)).catch(() => undefined); });

  it.each([[ReportFormat.CSV, 'text/csv'], [ReportFormat.XLSX, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], [ReportFormat.PDF, 'application/pdf']] as const)('renders %s artifacts', async (format, _contentType) => {
    const result = await service.build(id, format, rows);
    expect(result.url).toBe(`/api/v1/reports/jobs/${id}/download`);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    const data = await service.readLocal(id, format);
    if (format === ReportFormat.CSV) {
      const csv = data.toString();
      expect(csv).toContain('matricNo');
      expect(csv).toContain('K6/1');
      expect(csv).toContain('Ada');
    } else {
      expect(data.length).toBeGreaterThan(100);
    }
    if (format === ReportFormat.XLSX) expect(data.subarray(0, 2).toString('hex')).toBe('504b');
    if (format === ReportFormat.PDF) expect(data.subarray(0, 8).toString()).toBe('%PDF-1.4');
  });
});
