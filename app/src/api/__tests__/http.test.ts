import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NoSignalError, SERVER_TIMEOUT_MS, serverJson, serverRequest } from "../http";

/** A fetch that never answers, like a phone in a dead spot. */
const hangs = (() => new Promise<Response>(() => {})) as unknown as typeof fetch;
const answers = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("serverRequest", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("times out at 8 seconds as no signal instead of hanging", async () => {
    expect(SERVER_TIMEOUT_MS).toBe(8000);
    const result = serverJson("https://x/v1/routes", {}, { fetchFn: hangs });
    const caught = result.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(7999);
    let settled = false;
    void result.then(
      () => (settled = true),
      () => (settled = true),
    );
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await caught).toBeInstanceOf(NoSignalError);
  });

  it("times out even when the answer starts but the body never finishes", async () => {
    const stalls = (async () => ({
      ok: true,
      status: 200,
      json: () => new Promise(() => {}),
    })) as unknown as typeof fetch;
    const caught = serverJson("https://x", {}, { fetchFn: stalls }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(SERVER_TIMEOUT_MS);
    expect(await caught).toBeInstanceOf(NoSignalError);
  });

  it("treats no network at all as no signal", async () => {
    const offline = (async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    await expect(serverJson("https://x", {}, { fetchFn: offline })).rejects.toBeInstanceOf(NoSignalError);
  });

  it("says aborted, not no signal, when the caller cancels", async () => {
    const controller = new AbortController();
    const caught = serverJson("https://x", { signal: controller.signal }, { fetchFn: hangs }).catch((e: unknown) => e);
    controller.abort();
    const err = (await caught) as Error;
    expect(err.name).toBe("AbortError");
    expect(err).not.toBeInstanceOf(NoSignalError);
  });

  it("returns the answer, with errors from the server as a status", async () => {
    vi.useRealTimers();
    await expect(serverJson("https://x", {}, { fetchFn: answers({ a: 1 }) })).resolves.toEqual({
      ok: true,
      status: 200,
      body: { a: 1 },
    });
    await expect(serverJson("https://x", {}, { fetchFn: answers({ error: "no-route" }, 422) })).resolves.toMatchObject({
      ok: false,
      status: 422,
    });
  });

  it("lets a download start within the timeout and finish after it", async () => {
    const res = await serverRequest("https://x", {}, async (r) => r, { fetchFn: answers("big file") });
    await vi.advanceTimersByTimeAsync(SERVER_TIMEOUT_MS * 2);
    expect(await res.text()).toBe('"big file"');
  });
});
