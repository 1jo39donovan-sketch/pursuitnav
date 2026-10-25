// Who is waiting on a route request, for the calls it makes to Valhalla.
// Valhalla works on only a couple of requests at once (server_threads), so:
// - urgent: the standard route a crew is waiting on goes ahead of the slow
//   blue-light checks (dozens of small calls) of other plans;
// - signal: when the phone gives up on a request (a search typed further, a
//   new destination), its remaining calls are dropped rather than run for
//   nobody, holding up everyone else's.
// Carried with AsyncLocalStorage, so the routing code needn't pass it along.
import { AsyncLocalStorage } from "node:async_hooks";

export interface PlanContext {
  urgent: boolean;
  signal?: AbortSignal;
}

export const planContext = new AsyncLocalStorage<PlanContext>();

/** The request was given up by the phone: nothing more to work out for it. */
export class AbandonedError extends Error {
  constructor() {
    super("The request was given up");
  }
}

export function throwIfAbandoned(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw new AbandonedError();
}

/** At most `slots` calls at once; waiting urgent calls go first, then the rest in turn. */
export class Lanes {
  private busy = 0;
  private readonly urgent: (() => void)[] = [];
  private readonly normal: (() => void)[] = [];

  constructor(private readonly slots: number) {}

  async run<T>(urgent: boolean, fn: () => Promise<T>): Promise<T> {
    if (this.busy >= this.slots) {
      await new Promise<void>((go) => (urgent ? this.urgent : this.normal).push(go));
    } else {
      this.busy++;
    }
    try {
      return await fn();
    } finally {
      const next = this.urgent.shift() ?? this.normal.shift();
      // The slot passes straight to the next call waiting; otherwise it's free.
      if (next) next();
      else this.busy--;
    }
  }

  get waiting() {
    return this.urgent.length + this.normal.length;
  }
}
