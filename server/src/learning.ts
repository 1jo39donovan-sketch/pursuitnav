// Opt-in learning: how fast each road is really driven, from crews who turn it
// on. See docs/ROADMAP.md for the rules this follows.
//
// Phones send only "this OpenStreetMap way took this many seconds over this
// many metres, in this time band": no positions, no times, nothing about who.
// Each batch is added into per-road totals (a speed histogram per way and time
// band) and thrown away. A road's learned speed is only used once at least
// MIN_SAMPLES drives have been timed on it.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const BANDS = ["night", "peak", "day"] as const;
export type Band = (typeof BANDS)[number];

export interface Sample {
  /** OpenStreetMap way ID */
  w: number;
  /** seconds taken */
  s: number;
  /** metres driven */
  m: number;
  b: Band;
}

export const MIN_SAMPLES = 5;
const MAX_MPH = 100;
const MPS_TO_MPH = 2.23694;

export class LearningStore {
  /** "way:band" -> count of samples at each whole mph (index = mph). */
  private totals = new Map<string, number[]>();
  private dirty = false;

  constructor(private readonly file?: string) {}

  async load() {
    if (!this.file) return;
    try {
      const saved = JSON.parse(await readFile(this.file, "utf8")) as { v: 1; totals: Record<string, number[]> };
      this.totals = new Map(Object.entries(saved.totals));
    } catch {
      // Nothing learned yet.
    }
  }

  /** Adds a batch into the totals. Returns how many samples were sensible enough to count. */
  add(samples: Sample[]): number {
    let added = 0;
    for (const x of samples) {
      const mph = Math.round((x.m / x.s) * MPS_TO_MPH);
      // A stop at lights on a short stretch, or a GPS jump, isn't a road speed.
      if (mph < 2 || mph > MAX_MPH) continue;
      const key = `${x.w}:${x.b}`;
      const hist = this.totals.get(key) ?? [];
      hist[mph] = (hist[mph] ?? 0) + 1;
      this.totals.set(key, hist);
      added++;
    }
    if (added) this.dirty = true;
    return added;
  }

  /** Median learned speed (mph) for each way timed at least MIN_SAMPLES times, all bands together. */
  speeds(): Map<number, number> {
    const byWay = new Map<number, number[]>();
    for (const [key, hist] of this.totals) {
      const way = Number(key.split(":")[0]);
      const sum = byWay.get(way) ?? [];
      hist.forEach((n, mph) => (sum[mph] = (sum[mph] ?? 0) + (n ?? 0)));
      byWay.set(way, sum);
    }
    const out = new Map<number, number>();
    for (const [way, hist] of byWay) {
      const count = hist.reduce((a, n) => a + (n ?? 0), 0);
      if (count < MIN_SAMPLES) continue;
      let seen = 0;
      for (let mph = 0; mph < hist.length; mph++) {
        seen += hist[mph] ?? 0;
        if (seen * 2 >= count) {
          out.set(way, mph);
          break;
        }
      }
    }
    return out;
  }

  /** Writes the totals (if changed) and the learned-speeds file the weekly map build reads. */
  async save(csvFile?: string) {
    if (!this.file || !this.dirty) return;
    this.dirty = false;
    await writeAtomic(this.file, JSON.stringify({ v: 1, totals: Object.fromEntries(this.totals) }));
    if (csvFile) {
      const rows = [...this.speeds()].map(([way, mph]) => `${way},${mph}`);
      await writeAtomic(csvFile, ["way_id,mph", ...rows].join("\n") + "\n");
    }
  }
}

async function writeAtomic(file: string, text: string) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, text);
  await rename(`${file}.tmp`, file);
}
