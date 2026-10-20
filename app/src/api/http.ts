// Every call to the Blue Route server goes through here, so none can hang:
// a request with no answer within 8 seconds is given up as "no signal", and
// the screen says so instead of waiting for ever.

export const SERVER_TIMEOUT_MS = 8000;

/** The server didn't answer in time, or couldn't be reached at all. */
export class NoSignalError extends Error {
  constructor() {
    super("No signal: can't reach the Blue Route server.");
    this.name = "NoSignalError";
  }
}

export const isNoSignal = (err: unknown): err is NoSignalError => err instanceof NoSignalError;

function abortError(): Error {
  const err = new Error("Aborted");
  err.name = "AbortError";
  return err;
}

export interface RequestOptions {
  timeoutMs?: number;
  /** For tests. */
  fetchFn?: typeof fetch;
  /** Leave out of usage counting (the usage report itself). */
  uncounted?: boolean;
}

/** Set once at start-up (usage/usage.ts): what every request carries, and what it reports. */
export interface ClientHooks {
  /** Headers on every request: the install ID and app version. */
  headers?: () => Record<string, string>;
  /** A request got no answer in time. */
  onNoSignal?: () => void;
  /** A request was answered (a moment to send anything waiting). */
  onAnswer?: () => void;
}

let hooks: ClientHooks = {};
export function setClientHooks(next: ClientHooks) {
  hooks = next;
}

/**
 * fetch, then `read` the answer, all within the timeout. Throws NoSignalError
 * on a timeout or a network failure, and an AbortError if the caller's own
 * signal (init.signal) aborts first. Errors from `read` pass through.
 *
 * The timer runs until `read` finishes, so pass a reader that consumes the
 * body (res.json(), res.text()) for the whole call to be covered. Large
 * downloads that may take longer than the timeout on a slow link pass
 * `(res) => Promise.resolve(res)`: the server then has 8 seconds to start
 * answering, and the body is read afterwards.
 */
export function serverRequest<T>(
  url: string,
  init: RequestInit,
  read: (res: Response) => Promise<T>,
  { timeoutMs = SERVER_TIMEOUT_MS, fetchFn = fetch, uncounted = false }: RequestOptions = {},
): Promise<T> {
  const outer = init.signal ?? undefined;
  if (outer?.aborted) return Promise.reject(abortError());
  const controller = new AbortController();

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      outer?.removeEventListener("abort", onAbort);
      settle();
    };
    const onAbort = () => {
      controller.abort();
      finish(() => reject(abortError()));
    };
    // Settled by the timer even if fetch ignores the abort (some do mid-body).
    const timer = setTimeout(() => {
      controller.abort();
      finish(() => {
        reject(new NoSignalError());
        if (!uncounted) hooks.onNoSignal?.();
      });
    }, timeoutMs);
    outer?.addEventListener("abort", onAbort);

    const headers = { ...(hooks.headers?.() ?? {}), ...((init.headers as Record<string, string> | undefined) ?? {}) };
    fetchFn(url, { ...init, headers, signal: controller.signal })
      .then(read)
      .then(
        (value) =>
          finish(() => {
            resolve(value);
            if (!uncounted) hooks.onAnswer?.();
          }),
        (err: unknown) =>
          finish(() =>
            // fetch rejects with a TypeError when there's no network at all.
            reject(err instanceof TypeError || (err as Error)?.name === "AbortError" ? new NoSignalError() : err),
          ),
      );
  });
}

/** A JSON answer and its status, read within the timeout. The body is null if it isn't JSON. */
export function serverJson<T = unknown>(
  url: string,
  init: RequestInit = {},
  opts?: RequestOptions,
): Promise<{ ok: boolean; status: number; body: T | null }> {
  return serverRequest(
    url,
    init,
    async (res) => ({ ok: res.ok, status: res.status, body: (await res.json().catch(() => null)) as T | null }),
    opts,
  );
}
