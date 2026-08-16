import { randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { ReportFormat } from '@prisma/client';
import { PrivateObjectStorageService } from '../../../common/storage/private-object-storage.service';
import { deflateRawSync } from 'node:zlib';


interface Artifact {
  key: string;
  buffer: Buffer;
  contentType: string;
  extension: string;
}

const LOCAL_ROOT = process.env.REPORT_ARTIFACT_DIR ?? join(process.cwd(), '.artifacts', 'reports');
const PRESIGN_TTL_SECONDS = 30 * 60;

function scalar(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return value as string | number | boolean;
}

function flatten(value: unknown, prefix = '', out: Record<string, string | number | boolean> = {}) {
  if (value === null || value === undefined) {
    out[prefix] = '';
    return out;
  }
  if (value instanceof Date || typeof value !== 'object') {
    out[prefix] = scalar(value);
    return out;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !(child instanceof Date) && !Array.isArray(child)) flatten(child, next, out);
    else out[next] = scalar(child);
  }
  return out;
}

function rowsToMatrix(rows: Record<string, unknown>[]): string[][] {
  const flattened = rows.map((row) => flatten(row));
  const headers = [...new Set(flattened.flatMap((row) => Object.keys(row)))];
  return [headers, ...flattened.map((row) => headers.map((h) => String(row[h] ?? '')))];
}

function csvEscape(input: string): string {
  // Prevent Excel/LibreOffice formula execution for user-controlled values.
  const value = /^[=+\-@]/.test(input) ? `'${input}` : input;
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function renderCsv(rows: Record<string, unknown>[]): Buffer {
  const matrix = rowsToMatrix(rows);
  return Buffer.from(matrix.map((r) => r.map(csvEscape).join(',')).join('\r\n') + '\r\n', 'utf8');
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function renderSheetXml(matrix: string[][]): string {
  const rows = matrix.map((row, ri) => {
    const cells = row.map((value, ci) => {
      const ref = `${columnName(ci + 1)}${ri + 1}`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
    }).join('');
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
}

function columnName(n: number): string {
  let result = '';
  while (n > 0) { const r = (n - 1) % 26; result = String.fromCharCode(65 + r) + result; n = Math.floor((n - 1) / 26); }
  return result;
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return { time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2), date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate() };
}

/** Minimal standards-compliant ZIP writer; XLSX is an OpenXML ZIP container. */
function zip(files: Record<string, Buffer>): Buffer {
  const local: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  const dt = dosDateTime();
  for (const [name, raw] of Object.entries(files)) {
    const nameBuf = Buffer.from(name);
    const compressed = deflateRawSync(raw, { level: 6 });
    const crc = crc32(raw);
    const header = Buffer.alloc(30 + nameBuf.length);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0, 6);
    header.writeUInt16LE(8, 8); header.writeUInt16LE(dt.time, 10); header.writeUInt16LE(dt.date, 12);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(raw.length, 22); header.writeUInt16LE(nameBuf.length, 26); header.writeUInt16LE(0, 28); nameBuf.copy(header, 30);
    local.push(Buffer.concat([header, compressed]));

    const c = Buffer.alloc(46 + nameBuf.length);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0, 8); c.writeUInt16LE(8, 10);
    c.writeUInt16LE(dt.time, 12); c.writeUInt16LE(dt.date, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(compressed.length, 20); c.writeUInt32LE(raw.length, 24);
    c.writeUInt16LE(nameBuf.length, 28); c.writeUInt16LE(0, 30); c.writeUInt16LE(0, 32); c.writeUInt16LE(0, 34); c.writeUInt16LE(0, 36); c.writeUInt32LE(0, 38); c.writeUInt32LE(offset, 42); nameBuf.copy(c, 46);
    central.push(c); offset += header.length + compressed.length;
  }
  const centralBuf = Buffer.concat(central); const localBuf = Buffer.concat(local);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6); eocd.writeUInt16LE(Object.keys(files).length, 8); eocd.writeUInt16LE(Object.keys(files).length, 10); eocd.writeUInt32LE(centralBuf.length, 12); eocd.writeUInt32LE(localBuf.length, 16); eocd.writeUInt16LE(0, 20);
  return Buffer.concat([localBuf, centralBuf, eocd]);
}

function renderXlsx(rows: Record<string, unknown>[]): Buffer {
  const matrix = rowsToMatrix(rows);
  return zip({
    '[Content_Types].xml': Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    '_rels/.rels': Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': Buffer.from('<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': Buffer.from(renderSheetXml(matrix)),
  });
}

function renderPdf(rows: Record<string, unknown>[]): Buffer {
  const matrix = rowsToMatrix(rows);
  const lines = matrix.slice(0, 80).map((r) => r.map((v) => v.replace(/[()\\]/g, '\\$&').slice(0, 100)).join(' | '));
  const content = ['BT', '/F1 8 Tf', '36 780 Td', ...lines.flatMap((line, i) => [i ? '0 -11 Td' : '', `(${line}) Tj`]).filter(Boolean), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n'; const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf); pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`; for (let i = 1; i < offsets.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'binary');
}

@Injectable()
export class ReportArtifactService {
  constructor(private readonly config: ConfigService, private readonly storage: PrivateObjectStorageService) {}

  async build(reportJobId: string, format: ReportFormat, rows: Record<string, unknown>[]): Promise<{ key: string; url: string; expiresAt: Date }> {
    const artifact = this.render(reportJobId, format, rows);
    const bucket = this.config.get<string>('S3_REPORTS_BUCKET');
    const env = this.config.get<string>('NODE_ENV', 'development');
    const expiresAt = new Date(Date.now() + PRESIGN_TTL_SECONDS * 1000);

    if (bucket) {
      await this.storage.putObject(bucket, artifact.key, artifact.buffer, artifact.contentType);
      const signed = await this.storage.presignGet(artifact.key, bucket);
      return { key: artifact.key, url: signed.url, expiresAt };
    }

    if (env === 'production' || env === 'staging') throw new Error('REPORT_STORAGE_NOT_CONFIGURED: S3_REPORTS_BUCKET is required in staging/production');
    await mkdir(LOCAL_ROOT, { recursive: true });
    await writeFile(join(LOCAL_ROOT, artifact.key), artifact.buffer, { mode: 0o600 });
    return { key: artifact.key, url: `/api/v1/reports/jobs/${reportJobId}/download`, expiresAt };
  }

  async readLocal(jobId: string, format: ReportFormat): Promise<Buffer> {
    const ext = format.toLowerCase();
    return readFile(join(LOCAL_ROOT, `${jobId}.${ext}`));
  }

  async deleteLocal(jobId: string, format: ReportFormat): Promise<void> {
    await unlink(join(LOCAL_ROOT, `${jobId}.${format.toLowerCase()}`)).catch(() => undefined);
  }

  private render(jobId: string, format: ReportFormat, rows: Record<string, unknown>[]): Artifact {
    if (format === ReportFormat.CSV) return { key: `${jobId}.csv`, buffer: renderCsv(rows), contentType: 'text/csv; charset=utf-8', extension: 'csv' };
    if (format === ReportFormat.XLSX) return { key: `${jobId}.xlsx`, buffer: renderXlsx(rows), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx' };
    return { key: `${jobId}.pdf`, buffer: renderPdf(rows), contentType: 'application/pdf', extension: 'pdf' };
  }

}
