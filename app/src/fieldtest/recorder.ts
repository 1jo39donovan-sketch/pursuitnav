// Collects what happens on a trip while field-test recording is on, and
// writes it to the phone's storage in batches (every few seconds, never on
// the screen's render path). Off by default; when off, every call is a
// no-op. One trip per destination picked; picking another ends the last.
//
// The screens call it directly (recorder.event(...)), so recording adds no
// work to navigation beyond pushing an object onto a list.
import {
  MAX_BYTES,
  MAX_TRIPS,
  storageState,
  summarise,
  TRIP_FORMAT,
  type MarkTag,
  type OtherEtas,
  type TripEnd,
  type TripEvent,
  type TripHeader,
  type TripRecord,
} from "./trip";

/** Where trips are kept: the app's store (storage/store.ts), or a fake in tests. */
export interface TripSink {
  saveTrip(record: TripRecord): void;
  addTripEvents(id: string, events: TripEvent[]): void;
  tripStorage(): { trips: number; bytes: number };
}

/** Events with their time added by the recorder. */
type NewEvent = TripEvent extends infer E ? (E extends TripEvent ? Omit<E, "t"> : never) : never;

const FIX_EVERY_MS = 1000;

interface Live {
  record: TripRecord;
  events: TripEvent[];
  pending: TripEvent[];
  lastFixAt: number;
  signal: "online" | "no-signal" | "no-answer";
  lastPos: { lat: number; lng: number } | null;
  ended: boolean;
}

export class Recorder {
  private live: Live | null = null;
  private on = false;
  private listeners = new Set<() => void>();
  /** Why the last trip wasn't recorded, if it wasn't: storage full. */
  full = false;

  constructor(
    private sink: TripSink,
    private now: () => number = () => Date.now(),
  ) {}

  get enabled(): boolean {
    return this.on;
  }

  setEnabled(on: boolean): void {
    if (!on) this.finish();
    this.on = on;
    this.notify();
  }

  /** The trip being recorded, if any. */
  get current(): TripRecord | null {
    return this.live && !this.live.ended ? this.live.record : null;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    for (const fn of this.listeners) fn();
  }

  /** A destination was picked: a new trip (the last one, if open, ends as "new-destination"). */
  begin(header: Omit<TripHeader, "id" | "format" | "startedAt">): string | null {
    if (!this.on) return null;
    if (this.live && !this.live.ended) this.end("new-destination");
    this.flush();
    const { trips, bytes } = this.sink.tripStorage();
    // Never deletes to make room: stops, and says so (Log, Field trips).
    this.full = storageState(trips, bytes) === "full";
    if (this.full) {
      this.live = null;
      this.notify();
      return null;
    }
    const startedAt = this.now();
    const id = `${new Date(startedAt).toISOString().slice(0, 19).replace(/[-:T]/g, "")}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    this.live = {
      record: {
        header: { ...header, id, format: TRIP_FORMAT, startedAt },
        others: { blueLightMaps: null, googleApple: null },
        notes: {},
        summary: summarise([]),
      },
      events: [],
      pending: [],
      lastFixAt: 0,
      signal: "online",
      lastPos: null,
      ended: false,
    };
    this.notify();
    return id;
  }

  /** ms since the trip began: for plan latencies. */
  sinceStart(): number {
    return this.live ? this.now() - this.live.record.header.startedAt : 0;
  }

  event(e: NewEvent): void {
    const live = this.live;
    if (!this.on || !live || live.ended) return;
    const t = this.now();
    if (e.type === "fix") {
      // Breadcrumbs: one a second.
      if (t - live.lastFixAt < FIX_EVERY_MS) return;
      live.lastFixAt = t;
      live.lastPos = { lat: e.lat, lng: e.lng };
    }
    if (e.type === "signal") {
      if (e.state === live.signal) return;
      live.signal = e.state;
    }
    const full = { ...e, t } as TripEvent;
    live.events.push(full);
    live.pending.push(full);
  }

  /** One tap: a mark where the vehicle is now. */
  mark(tag: MarkTag): boolean {
    const live = this.live;
    if (!this.on || !live || live.ended || !live.lastPos) return false;
    this.event({ type: "mark", tag, ...live.lastPos });
    this.flush();
    return true;
  }

  setOthers(others: OtherEtas): void {
    if (!this.live) return;
    this.live.record = { ...this.live.record, others };
    this.flush();
  }

  end(reason: TripEnd): void {
    if (!this.live || this.live.ended) return;
    this.event({ type: "end", reason });
    this.live.ended = true;
    this.flush();
    this.notify();
  }

  /** Writes what's waiting. Called every few seconds, and at the end of a trip. */
  flush(): void {
    const live = this.live;
    if (!live) return;
    const pending = live.pending;
    if (pending.length === 0 && live.record.summary.fixes === live.events.filter((e) => e.type === "fix").length) {
      // Nothing new since the last write, apart from (maybe) the quotes.
      this.sink.saveTrip(live.record);
      return;
    }
    live.pending = [];
    live.record = { ...live.record, summary: summarise(live.events) };
    if (pending.length) this.sink.addTripEvents(live.record.header.id, pending);
    this.sink.saveTrip(live.record);
  }

  private finish() {
    this.flush();
    this.live = null;
  }
}

export { MAX_BYTES, MAX_TRIPS };
