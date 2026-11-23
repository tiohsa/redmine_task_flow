import type {
  BootstrapData,
  BulkCreateErrorResponse,
  BulkCreateRequestPayload,
  BulkCreateSuccessResponse,
} from '../types/flow';

export class SessionExpiredError extends Error {
  constructor(
    message = 'セッションが切れました。ページを再読み込みして再ログインしてください。',
  ) {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export function getCsrfToken(): string {
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta?.getAttribute('content') ?? '';
}

function isJsonResponse(response: Response): boolean {
  const contentType = response.headers.get('content-type') ?? '';
  return contentType.toLowerCase().includes('application/json');
}

async function requestJson<T>(
  url: string,
  options: RequestInit = {},
  forbiddenMessage?: string,
): Promise<{ status: number; data: T }> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  headers.set('X-Requested-With', 'XMLHttpRequest');

  const method = (options.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers.set('X-CSRF-Token', csrfToken);
    }
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  }

  const response = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers,
  });

  if (response.redirected) {
    throw new SessionExpiredError();
  }
  if (forbiddenMessage && response.status === 403) {
    const data = isJsonResponse(response)
      ? await response.json().catch(() => null) as { error?: string } | null
      : null;
    throw new ApiError(403, data?.error || forbiddenMessage, data);
  }
  if (!isJsonResponse(response)) {
    throw new SessionExpiredError();
  }

  const data = (await response.json()) as T;
  return { status: response.status, data };
}

export async function fetchBootstrap(url: string): Promise<BootstrapData> {
  const { status, data } = await requestJson<
    BootstrapData | { error?: string }
  >(url, { method: 'GET' });

  if (status >= 200 && status < 300) {
    return data as BootstrapData;
  }
  const errData = data as { error?: string };
  throw new ApiError(
    status,
    errData.error ?? `初期データの取得に失敗しました (${status})`,
    data,
  );
}

export type BulkCreateApiResult =
  | { ok: true; data: BulkCreateSuccessResponse }
  | { ok: false; status: 422; data: BulkCreateErrorResponse };

export async function postBulkCreate(
  url: string,
  payload: BulkCreateRequestPayload,
): Promise<BulkCreateApiResult> {
  const { status, data } = await requestJson<
    BulkCreateSuccessResponse | BulkCreateErrorResponse | { error?: string }
  >(url, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, '一括登録の権限がありません');

  if (status === 200 || status === 201) {
    return { ok: true, data: data as BulkCreateSuccessResponse };
  }

  if (status === 422) {
    return { ok: false, status: 422, data: data as BulkCreateErrorResponse };
  }

  const errData = data as { error?: string };
  throw new ApiError(
    status,
    errData.error ?? `一括登録に失敗しました (${status})`,
    data,
  );
}
