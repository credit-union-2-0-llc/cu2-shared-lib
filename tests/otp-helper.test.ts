import { describe, it, expect, vi } from 'vitest';
import { fetchLatestOtp, OtpNotFoundError } from '../src/testing/otp-helper.js';

function makeFetch(responses: Array<{ ok: boolean; body?: unknown; throws?: boolean }>) {
  let call = 0;
  return vi.fn(async (_url: string | URL | Request) => {
    const r = responses[Math.min(call, responses.length - 1)]!;
    call += 1;
    if (r.throws) throw new Error('network');
    return {
      ok: r.ok,
      json: async () => r.body,
    } as unknown as Response;
  });
}

describe('fetchLatestOtp', () => {
  it('returns the code from the first successful response', async () => {
    const fetchImpl = makeFetch([{ ok: true, body: { code: '123456' } }]);
    const code = await fetchLatestOtp({
      apiUrl: 'http://api.test',
      email: 'a@b.com',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(code).toBe('123456');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('encodes email in URL path', async () => {
    const fetchImpl = makeFetch([{ ok: true, body: { code: '000000' } }]);
    await fetchLatestOtp({
      apiUrl: 'http://api.test',
      email: 'a+chromium@b.com',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const called = fetchImpl.mock.calls[0]![0] as string;
    expect(called).toBe('http://api.test/test/last-otp/a%2Bchromium%40b.com');
  });

  it('trims trailing slash on apiUrl', async () => {
    const fetchImpl = makeFetch([{ ok: true, body: { code: '1' } }]);
    await fetchLatestOtp({
      apiUrl: 'http://api.test/',
      email: 'a@b.com',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl.mock.calls[0]![0]).toBe('http://api.test/test/last-otp/a%40b.com');
  });

  it('polls until a code shows up, then returns it', async () => {
    const fetchImpl = makeFetch([
      { ok: true, body: {} },
      { ok: true, body: { code: '' } },
      { ok: true, body: { code: '999999' } },
    ]);
    const code = await fetchLatestOtp({
      apiUrl: 'http://api.test',
      email: 'a@b.com',
      pollIntervalMs: 5,
      timeoutMs: 2000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(code).toBe('999999');
    expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('supports custom responseField and endpoint', async () => {
    const fetchImpl = makeFetch([{ ok: true, body: { otp: 'ABCDEF' } }]);
    const code = await fetchLatestOtp({
      apiUrl: 'http://api.test',
      email: 'a@b.com',
      endpoint: '/qa/otp',
      responseField: 'otp',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(code).toBe('ABCDEF');
    expect(fetchImpl.mock.calls[0]![0]).toBe('http://api.test/qa/otp/a%40b.com');
  });

  it('throws OtpNotFoundError on timeout', async () => {
    const fetchImpl = makeFetch([{ ok: true, body: {} }]);
    await expect(
      fetchLatestOtp({
        apiUrl: 'http://api.test',
        email: 'a@b.com',
        pollIntervalMs: 5,
        timeoutMs: 30,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(OtpNotFoundError);
  });

  it('throws OtpNotFoundError when fetch always throws', async () => {
    const fetchImpl = makeFetch([{ ok: false, throws: true }]);
    await expect(
      fetchLatestOtp({
        apiUrl: 'http://api.test',
        email: 'a@b.com',
        pollIntervalMs: 5,
        timeoutMs: 30,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(OtpNotFoundError);
  });
});
