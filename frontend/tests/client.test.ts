import { describe, expect, it, vi } from 'vitest';
import { postBulkCreate, SessionExpiredError } from '../src/api/client';

describe('api client (UT-FE-19)', () => {
  it('UT-FE-19: attaches X-CSRF-Token and X-Requested-With, and detects HTML/redirect session expiry', async () => {
    document.head.innerHTML = '<meta name="csrf-token" content="secret-token-123" />';

    const fetchMock = vi.fn().mockResolvedValueOnce({
      status: 201,
      redirected: false,
      headers: new Headers({ 'content-type': 'application/json; charset=utf-8' }),
      json: async () => ({ issues: [], relations: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await postBulkCreate('/projects/1/task_flow/bulk_create.json', {
      issues: [],
      relations: [],
    });
    expect(res.ok).toBe(true);

    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Headers;
    expect(headers.get('X-CSRF-Token')).toBe('secret-token-123');
    expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest');
    expect(init.credentials).toBe('same-origin');

    // Now simulate redirected HTML login page (session expiry)
    const expiredMock = vi.fn().mockResolvedValueOnce({
      status: 200,
      redirected: true,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', expiredMock);

    await expect(
      postBulkCreate('/projects/1/task_flow/bulk_create.json', {
        issues: [],
        relations: [],
      }),
    ).rejects.toBeInstanceOf(SessionExpiredError);
  });
});
