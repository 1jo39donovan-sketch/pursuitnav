// What the server itself reports about its data and its machine: which
// weekly data release is live (GET /health) and how much memory is in use
// (GET /stats, behind its token), so the server can be sized without logging
// in to it. Nothing here is about officers or their requests.
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** The live data release, from the manifest scripts/fetch-data.sh leaves beside the places file. */
export async function dataRelease(placesFile: string): Promise<{ release: string; built: string } | undefined> {
  try {
    const m = JSON.parse(await readFile(join(dirname(placesFile), "data-release.json"), "utf8"));
    return typeof m.release === "string" ? { release: m.release, built: String(m.built ?? "") } : undefined;
  } catch {
    return undefined;
  }
}

/** The whole machine's memory in MB, from /proc/meminfo (a container sees the host's). */
export async function machineMemory(
  meminfo = "/proc/meminfo",
): Promise<{ totalMB: number; usedMB: number; swapUsedMB: number } | undefined> {
  try {
    const text = await readFile(meminfo, "utf8");
    const kb = (key: string) => Number(new RegExp(`^${key}:\\s+(\\d+)`, "m").exec(text)?.[1] ?? NaN);
    const total = kb("MemTotal");
    const available = kb("MemAvailable");
    const swap = kb("SwapTotal") - kb("SwapFree");
    if (![total, available, swap].every(Number.isFinite)) return undefined;
    return {
      totalMB: Math.round(total / 1024),
      usedMB: Math.round((total - available) / 1024),
      swapUsedMB: Math.round(swap / 1024),
    };
  } catch {
    return undefined;
  }
}
