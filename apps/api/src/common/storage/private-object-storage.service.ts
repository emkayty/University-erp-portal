import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'node:crypto';

interface AwsCredentials { accessKeyId: string; secretAccessKey: string; sessionToken?: string }

export interface PresignedObject {
  key: string;
  url: string;
  expiresAt: Date;
  headers?: Record<string, string>;
}

export interface PresignedUploadPost extends PresignedObject {
  method: 'POST';
  fields: Record<string, string>;
  maxSizeBytes: number;
}

export interface VerifiedObject {
  key: string;
  sizeBytes: number;
  contentType: string | null;
}

type HttpMethod = 'GET' | 'HEAD';

@Injectable()
export class PrivateObjectStorageService {
  private readonly ttlSeconds = 900;
  private readonly metadataTimeoutMs = 5000;

  constructor(private readonly config: ConfigService) {}

  validateObjectKey(key: string): void {
    if (!/^(?!\/)(?!.*\.\.)(?!.*:\/\/)[A-Za-z0-9_./-]+$/.test(key)) {
      throw new BadRequestException('Object key must be a relative opaque storage key.');
    }
  }

  async presignPut(key: string, contentType: string, sizeBytes: number): Promise<PresignedObject> {
    this.validateObjectKey(key);
    const bucket = this.requireBucket();
    this.validateUploadInputs(contentType, sizeBytes);
    const url = await this.sign(bucket, key, 'PUT', this.ttlSeconds);
    return {
      key,
      url,
      expiresAt: new Date(Date.now() + this.ttlSeconds * 1000),
      headers: { 'Content-Type': contentType },
    };
  }

  /**
   * SigV4 POST policies enforce the content-length range at the storage edge.
   * This is stronger than validating the requested size while signing a PUT,
   * because a caller cannot reuse the form policy for a larger body.
   */
  async presignPost(key: string, contentType: string, sizeBytes: number): Promise<PresignedUploadPost> {
    this.validateObjectKey(key);
    const bucket = this.requireBucket();
    this.validateUploadInputs(contentType, sizeBytes);
    const credentials = await this.resolveAwsCredentials();
    const endpoint = this.resolveEndpoint(bucket);
    const now = new Date();
    const amzDate = this.toAmzDate(now);
    const date = amzDate.slice(0, 8);
    const scope = `${date}/${endpoint.region}/s3/aws4_request`;
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1000);
    const fields: Record<string, string> = {
      key,
      'Content-Type': contentType,
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${credentials.accessKeyId}/${scope}`,
      'X-Amz-Date': amzDate,
    };
    if (credentials.sessionToken) fields['X-Amz-Security-Token'] = credentials.sessionToken;

    const conditions: unknown[] = [
      { key },
      { 'Content-Type': contentType },
      ['content-length-range', 1, sizeBytes],
      { 'X-Amz-Algorithm': fields['X-Amz-Algorithm'] },
      { 'X-Amz-Credential': fields['X-Amz-Credential'] },
      { 'X-Amz-Date': fields['X-Amz-Date'] },
    ];
    if (credentials.sessionToken) conditions.push({ 'X-Amz-Security-Token': credentials.sessionToken });
    const policy = Buffer.from(JSON.stringify({ expiration: expiresAt.toISOString(), conditions })).toString('base64');
    const signingKey = this.deriveSigningKey(credentials.secretAccessKey, date, endpoint.region);
    fields.Policy = policy;
    fields['X-Amz-Signature'] = createHmac('sha256', signingKey).update(policy).digest('hex');

    return {
      key,
      url: endpoint.url,
      expiresAt,
      method: 'POST',
      fields,
      maxSizeBytes: sizeBytes,
    };
  }

  async presignGet(key: string, bucketName?: string): Promise<PresignedObject> {
    this.validateObjectKey(key);
    const bucket = bucketName?.trim() || this.requireBucket();
    const url = await this.sign(bucket, key, 'GET', this.ttlSeconds);
    return { key, url, expiresAt: new Date(Date.now() + this.ttlSeconds * 1000) };
  }

  async putObject(bucketName: string, key: string, body: Buffer, contentType: string, extraHeaders: Record<string, string> = {}): Promise<void> {
    this.validateObjectKey(key);
    if (!bucketName.trim()) throw new ServiceUnavailableException('Object storage bucket is not configured.');
    if (!contentType.trim() || contentType.length > 255) throw new BadRequestException('Object content type is required and must be at most 255 characters.');
    const credentials = await this.resolveAwsCredentials();
    const endpoint = this.resolveEndpoint(bucketName.trim());
    const amzDate = this.toAmzDate(new Date());
    const date = amzDate.slice(0, 8);
    const payloadHash = createHash('sha256').update(body).digest('hex');
    const headers: Record<string, string> = {
      host: endpoint.host,
      'content-type': contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      ...Object.fromEntries(Object.entries(extraHeaders).map(([name, value]) => [name.toLowerCase(), value])),
    };
    if (credentials.sessionToken) headers['x-amz-security-token'] = credentials.sessionToken;
    const signedHeaders = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaders.map((name) => `${name}:${headers[name].trim()}\n`).join('');
    const canonicalUri = endpoint.objectPath(key);
    const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders.join(';')}\n${payloadHash}`;
    const scope = `${date}/${endpoint.region}/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${createHash('sha256').update(canonicalRequest).digest('hex')}`;
    const signingKey = this.deriveSigningKey(credentials.secretAccessKey, date, endpoint.region);
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    const authorization = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders.join(';')}, Signature=${signature}`;
    const requestHeaders = { ...headers, Authorization: authorization };
    try {
      const response = await fetch(`${endpoint.protocol}//${endpoint.host}${canonicalUri}`, { method: 'PUT', headers: requestHeaders, body, signal: AbortSignal.timeout(this.metadataTimeoutMs) });
      if (!response.ok) throw new ServiceUnavailableException(`Object storage upload failed with status ${response.status}.`);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Object storage upload could not be completed.');
    }
  }

  /** Verify the object that was uploaded before accepting its metadata in a submission. */
  async verifyImageObject(key: string, expectedSizeBytes: number, expectedContentType: 'image/jpeg' | 'image/png'): Promise<VerifiedObject> {
    const verified = await this.verifyObject(key, expectedSizeBytes, expectedContentType);
    const bucket = this.requireBucket();
    const url = await this.sign(bucket, key, 'GET', 60);
    let response: Response;
    try {
      response = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-15' }, signal: AbortSignal.timeout(this.metadataTimeoutMs) });
    } catch {
      throw new ServiceUnavailableException('Image storage could not be reached for signature verification.');
    }
    if (!response.ok && response.status !== 206) throw new BadRequestException('Image content could not be verified.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const png = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
    if ((expectedContentType === 'image/jpeg' && !jpeg) || (expectedContentType === 'image/png' && !png)) throw new BadRequestException('The uploaded file is not a valid JPEG or PNG image.');
    return verified;
  }

  async verifyObject(key: string, expectedSizeBytes: number, expectedContentType: string): Promise<VerifiedObject> {
    this.validateObjectKey(key);
    if (!Number.isInteger(expectedSizeBytes) || expectedSizeBytes < 1 || expectedSizeBytes > 10 * 1024 * 1024) {
      throw new BadRequestException('Attachment size must be between 1 byte and 10 MiB.');
    }
    this.validateContentType(expectedContentType);
    const bucket = this.requireBucket();
    const url = await this.sign(bucket, key, 'HEAD', 60);
    let response: Response;
    try {
      response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(this.metadataTimeoutMs) });
    } catch {
      throw new ServiceUnavailableException('Attachment storage could not be reached for verification.');
    }
    if (!response.ok) throw new BadRequestException('Attachment was not found in private object storage.');
    const actualSize = Number(response.headers.get('content-length'));
    if (!Number.isInteger(actualSize) || actualSize !== expectedSizeBytes) {
      throw new BadRequestException('Attachment size does not match the presigned upload contract.');
    }
    const actualContentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim() || null;
    if (actualContentType && actualContentType !== expectedContentType) {
      throw new BadRequestException('Attachment MIME type does not match the presigned upload contract.');
    }
    return { key, sizeBytes: actualSize, contentType: actualContentType };
  }

  private validateUploadInputs(contentType: string, sizeBytes: number): void {
    this.validateContentType(contentType);
    if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 10 * 1024 * 1024) {
      throw new BadRequestException('Attachment size must be between 1 byte and 10 MiB.');
    }
  }

  private validateContentType(contentType: string): void {
    if (!/^(application\/pdf|text\/plain|image\/(jpeg|png)|application\/zip)$/.test(contentType)) {
      throw new BadRequestException('Attachment MIME type is not permitted.');
    }
  }

  private requireBucket(): string {
    const bucket = this.config.get<string>('S3_UPLOADS_BUCKET')?.trim();
    if (!bucket) throw new ServiceUnavailableException('LMS object storage is not configured.');
    return bucket;
  }

  private async sign(bucket: string, key: string, method: HttpMethod | 'PUT', expires: number): Promise<string> {
    const credentials = await this.resolveAwsCredentials();
    const endpoint = this.resolveEndpoint(bucket);
    const now = new Date();
    const amzDate = this.toAmzDate(now);
    const date = amzDate.slice(0, 8);
    const scope = `${date}/${endpoint.region}/s3/aws4_request`;
    const canonicalUri = endpoint.objectPath(key);
    const params = new URLSearchParams({
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${credentials.accessKeyId}/${scope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(expires),
      'X-Amz-SignedHeaders': 'host',
    });
    if (credentials.sessionToken) params.set('X-Amz-Security-Token', credentials.sessionToken);
    const canonicalQuery = this.canonicalQuery(params);
    const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQuery}\nhost:${endpoint.host}\n\nhost\nUNSIGNED-PAYLOAD`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${createHash('sha256').update(canonicalRequest).digest('hex')}`;
    const signingKey = this.deriveSigningKey(credentials.secretAccessKey, date, endpoint.region);
    params.set('X-Amz-Signature', createHmac('sha256', signingKey).update(stringToSign).digest('hex'));
    return `${endpoint.protocol}//${endpoint.host}${canonicalUri}?${this.canonicalQuery(params)}`;
  }

  private resolveEndpoint(bucket: string): { protocol: string; host: string; region: string; url: string; objectPath: (key: string) => string } {
    const region = this.config.get<string>('AWS_REGION', 'us-east-1');
    const configured = this.config.get<string>('S3_ENDPOINT_URL')?.trim();
    if (!configured) {
      const host = `${bucket}.s3.${region}.amazonaws.com`;
      return { protocol: 'https:', host, region, url: `https://${host}/`, objectPath: (key) => `/${this.encodeKey(key)}` };
    }
    let parsed: URL;
    try { parsed = new URL(configured); } catch { throw new ServiceUnavailableException('S3_ENDPOINT_URL is invalid.'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new ServiceUnavailableException('S3_ENDPOINT_URL must use HTTP or HTTPS.');
    const forcePathStyle = this.config.get<boolean>('S3_FORCE_PATH_STYLE', true);
    const basePath = parsed.pathname.replace(/\/+$/, '');
    const prefix = forcePathStyle ? `${basePath}/${encodeURIComponent(bucket)}` : basePath;
    const objectPath = (key: string) => `${prefix}/${this.encodeKey(key)}`.replace(/\/\/+/g, '/');
    return { protocol: parsed.protocol, host: parsed.host, region, url: `${parsed.protocol}//${parsed.host}${prefix || '/'}`, objectPath };
  }

  private encodeKey(key: string): string {
    return key.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  }

  private canonicalQuery(params: URLSearchParams): string {
    return [...params.entries()]
      .sort(([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue))
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
  }

  private toAmzDate(value: Date): string {
    return value.toISOString().replace(/[:-]|\.\d{3}/g, '');
  }

  private deriveSigningKey(secret: string, date: string, region: string): Buffer {
    const kDate = createHmac('sha256', `AWS4${secret}`).update(date).digest();
    const kRegion = createHmac('sha256', kDate).update(region).digest();
    const kService = createHmac('sha256', kRegion).update('s3').digest();
    return createHmac('sha256', kService).update('aws4_request').digest();
  }

  private async resolveAwsCredentials(): Promise<AwsCredentials> {
    const envCredentials = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, sessionToken: process.env.AWS_SESSION_TOKEN }
      : undefined;
    if (envCredentials) return envCredentials;

    const relative = process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI;
    const full = process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI;
    const endpoint = full ?? (relative ? `http://169.254.170.2${relative}` : undefined);
    if (endpoint) {
      try {
        const response = await fetch(endpoint, {
          headers: process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN ? { Authorization: process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN } : undefined,
          signal: AbortSignal.timeout(this.metadataTimeoutMs),
        });
        if (response.ok) {
          const data = await response.json() as { AccessKeyId?: string; SecretAccessKey?: string; Token?: string };
          if (data.AccessKeyId && data.SecretAccessKey) return { accessKeyId: data.AccessKeyId, secretAccessKey: data.SecretAccessKey, sessionToken: data.Token };
        }
      } catch { /* Workload metadata is intentionally best-effort. */ }
    }

    try {
      const tokenResponse = await fetch('http://169.254.169.254/latest/api/token', { method: 'PUT', headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '21600' }, signal: AbortSignal.timeout(this.metadataTimeoutMs) });
      if (tokenResponse.ok) {
        const token = await tokenResponse.text();
        const roleResponse = await fetch('http://169.254.169.254/latest/meta-data/iam/security-credentials/', { headers: { 'X-aws-ec2-metadata-token': token }, signal: AbortSignal.timeout(this.metadataTimeoutMs) });
        if (roleResponse.ok) {
          const role = (await roleResponse.text()).trim();
          const credentialResponse = await fetch(`http://169.254.169.254/latest/meta-data/iam/security-credentials/${encodeURIComponent(role)}`, { headers: { 'X-aws-ec2-metadata-token': token }, signal: AbortSignal.timeout(this.metadataTimeoutMs) });
          if (credentialResponse.ok) {
            const data = await credentialResponse.json() as { AccessKeyId?: string; SecretAccessKey?: string; Token?: string };
            if (data.AccessKeyId && data.SecretAccessKey) return { accessKeyId: data.AccessKeyId, secretAccessKey: data.SecretAccessKey, sessionToken: data.Token };
          }
        }
      }
    } catch { /* Workload metadata is intentionally best-effort. */ }

    throw new ServiceUnavailableException('LMS object-storage credentials are unavailable.');
  }
}
