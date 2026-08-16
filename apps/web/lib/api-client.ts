/**
 * Typed API client for UniPortal ERP.
 *
 * Access tokens remain in memory only. Refresh uses the httpOnly cookie and is
 * deliberately isolated from the main request function so a failed refresh
 * cannot recursively trigger another refresh.
 */

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

let _accessToken: string | null = null;
let _isRefreshing = false;
let _refreshQueue: Array<(token: string | null) => void> = [];

export const setAccessToken = (t: string | null): void => { _accessToken = t; };
export const getAccessToken = (): string | null => _accessToken;

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

interface ApiErrorBody { code: string; message: string; details?: Array<{ field: string; message: string }> }
interface ApiSuccess<T> { success: true; data: T }
interface ApiFailure { success: false; error: ApiErrorBody }
type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

async function silentRefresh(baseUrl: string = API_BASE): Promise<string | null> {
  if (_isRefreshing) return new Promise((resolve) => { _refreshQueue.push(resolve); });
  _isRefreshing = true;
  try {
    const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      setAccessToken(null);
      _refreshQueue.forEach((cb) => cb(null));
      _refreshQueue = [];
      return null;
    }
    const data = (await res.json()) as ApiSuccess<{ accessToken: string }>;
    const newToken = data.data.accessToken;
    setAccessToken(newToken);
    _refreshQueue.forEach((cb) => cb(newToken));
    _refreshQueue = [];
    return newToken;
  } catch {
    setAccessToken(null);
    _refreshQueue.forEach((cb) => cb(null));
    _refreshQueue = [];
    return null;
  } finally {
    _isRefreshing = false;
  }
}

async function request<T>(
  method: string,
  path: string,
  options: {
    body?: unknown;
    headers?: Record<string, string>;
    idempotencyKey?: string;
    skipRefresh?: boolean;
    signal?: AbortSignal;
  } = {},
  baseUrl: string = API_BASE,
): Promise<T> {
  const url = `${baseUrl}/api/v1${path}`;
  const requestId = crypto.randomUUID();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-ID': requestId,
    ...options.headers,
  };
  if (_accessToken) headers.Authorization = `Bearer ${_accessToken}`;
  if (options.idempotencyKey) headers['X-Idempotency-Key'] = options.idempotencyKey;

  const res = await fetch(url, {
    method,
    headers,
    credentials: 'include',
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (res.status === 401 && !options.skipRefresh) {
    const newToken = await silentRefresh(baseUrl);
    if (newToken) {
      return request<T>(method, path, {
        ...options,
        headers: { ...options.headers, Authorization: `Bearer ${newToken}` },
        skipRefresh: true,
      }, baseUrl);
    }
    if (typeof window !== 'undefined') window.location.href = '/auth/login?reason=session_expired';
    throw new ApiClientError('AUTH_TOKEN_EXPIRED', 'Session expired. Please log in again.', 401);
  }

  if (res.status === 204) return undefined as T;

  let data: ApiResponse<T>;
  try {
    data = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiClientError('INTERNAL_ERROR', `Server returned non-JSON response (status ${res.status})`, res.status);
  }
  if (!data.success) throw new ApiClientError(data.error.code, data.error.message, res.status, data.error.details);
  return data.data;
}

async function downloadFile(path: string, baseUrl: string = API_BASE): Promise<{ blob: Blob; filename?: string }> {
  const url = `${baseUrl}/api/v1${path}`;
  const requestId = crypto.randomUUID();
  const perform = (token: string | null) => fetch(url, {
    method: 'GET',
    headers: { 'X-Request-ID': requestId, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    credentials: 'include',
  });

  let res = await perform(_accessToken);
  if (res.status === 401) {
    const newToken = await silentRefresh(baseUrl);
    if (!newToken) {
      if (typeof window !== 'undefined') window.location.href = '/auth/login?reason=session_expired';
      throw new ApiClientError('AUTH_TOKEN_EXPIRED', 'Session expired. Please log in again.', 401);
    }
    res = await perform(newToken);
  }

  if (!res.ok) {
    let message = `Request failed (status ${res.status})`;
    let code = 'INTERNAL_ERROR';
    try {
      const data = (await res.json()) as ApiResponse<unknown>;
      if (!data.success) { code = data.error.code; message = data.error.message; }
    } catch { /* Preserve status-based error for non-JSON responses. */ }
    throw new ApiClientError(code, message, res.status);
  }

  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return { blob: await res.blob(), filename: match?.[1] };
}

export const createApiClient = (baseUrl: string = API_BASE) => ({
  get: <T>(path: string, opts?: { signal?: AbortSignal }) => request<T>('GET', path, opts, baseUrl),
  post: <T>(path: string, body?: unknown, opts?: { idempotencyKey?: string; signal?: AbortSignal }) => request<T>('POST', path, { body, ...opts }, baseUrl),
  patch: <T>(path: string, body?: unknown, opts?: { idempotencyKey?: string }) => request<T>('PATCH', path, { body, ...opts }, baseUrl),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }, baseUrl),
  delete: <T>(path: string, body?: unknown) => request<T>('DELETE', path, { body }, baseUrl),
  download: (path: string) => downloadFile(path, baseUrl),
});

export const apiClient = createApiClient();
