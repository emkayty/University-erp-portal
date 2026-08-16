import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { PrivateObjectStorageService } from './private-object-storage.service';

describe('PrivateObjectStorageService', () => {
  const config = { get: jest.fn() };
  let service: PrivateObjectStorageService;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AWS_ACCESS_KEY_ID = 'test-access';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
    config.get.mockImplementation((key: string, fallback?: string) => {
      if (key === 'S3_UPLOADS_BUCKET') return 'private-uploads';
      if (key === 'AWS_REGION') return 'us-east-1';
      if (key === 'NODE_ENV') return 'test';
      return fallback;
    });
    service = new PrivateObjectStorageService(config as any);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('rejects absolute, traversal, and public-url keys', () => {
    expect(() => service.validateObjectKey('/absolute/file.pdf')).toThrow(BadRequestException);
    expect(() => service.validateObjectKey('../private/file.pdf')).toThrow(BadRequestException);
    expect(() => service.validateObjectKey('https://example.test/file.pdf')).toThrow(BadRequestException);
  });

  it('creates a short-lived presigned PUT with the supplied content type', async () => {
    const result = await service.presignPut('lms/submissions/student/content/file.pdf', 'application/pdf', 1024);
    expect(result.key).toBe('lms/submissions/student/content/file.pdf');
    expect(result.url).toMatch(/^https:\/\/private-uploads\.s3\.us-east-1\.amazonaws\.com\/lms\/submissions\/student\/content\/file\.pdf\?/);
    expect(result.headers).toEqual({ 'Content-Type': 'application/pdf' });
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('creates a constrained presigned POST policy with a content-length range', async () => {
    const result = await service.presignPost('lms/submissions/student/content/file.pdf', 'application/pdf', 1024);
    expect(result.method).toBe('POST');
    expect(result.fields['Content-Type']).toBe('application/pdf');
    expect(result.fields['X-Amz-Signature']).toMatch(/^[a-f0-9]{64}$/);
    const policy = JSON.parse(Buffer.from(result.fields.Policy, 'base64').toString('utf8')) as { conditions: unknown[] };
    expect(policy.conditions).toContainEqual(['content-length-range', 1, 1024]);
  });

  it('verifies uploaded object size and content type through a signed HEAD request', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-length': '1024', 'content-type': 'application/pdf' }),
    } as Response);
    await expect(service.verifyObject('lms/submissions/student/content/file.pdf', 1024, 'application/pdf')).resolves.toEqual({ key: 'lms/submissions/student/content/file.pdf', sizeBytes: 1024, contentType: 'application/pdf' });
    fetchMock.mockRestore();
  });

  it('rejects metadata that does not match the uploaded object', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-length': '2048', 'content-type': 'application/pdf' }),
    } as Response);
    await expect(service.verifyObject('lms/submissions/student/content/file.pdf', 1024, 'application/pdf')).rejects.toBeInstanceOf(BadRequestException);
    fetchMock.mockRestore();
  });

  it('creates a presigned GET and fails when the bucket is absent', async () => {
    await expect(service.presignGet('lms/submissions/student/content/file.pdf')).resolves.toEqual(expect.objectContaining({ key: 'lms/submissions/student/content/file.pdf' }));
    config.get.mockImplementation((key: string, fallback?: string) => key === 'NODE_ENV' ? 'production' : fallback);
    await expect(service.presignGet('lms/submissions/student/content/file.pdf')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
