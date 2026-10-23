// The three exports, from the trips on the phone.
import { store } from "../storage/store";
import { eventsCsv, gpx, tripsCsv } from "./exportFiles";
import { shareFile } from "./share";
import type { TripRecord } from "./trip";

export type ExportKind = "trips" | "events" | "gpx";

export async function exportTrips(trips: TripRecord[], kind: ExportKind, name: string): Promise<void> {
  if (kind === "trips") return shareFile(`${name}.csv`, tripsCsv(trips), "text/csv");
  const withEvents = trips.map((record) => ({ record, events: store.tripEvents(record.header.id) }));
  if (kind === "events") return shareFile(`${name}.csv`, eventsCsv(withEvents), "text/csv");
  return shareFile(`${name}.gpx`, gpx(withEvents), "application/gpx+xml");
}
