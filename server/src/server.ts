import { buildApp } from "./app.js";
import { avoidingClosures, ClosureFeed } from "./closures.js";
import { loadConfig } from "./config.js";
import { LearningStore } from "./learning.js";
import { UsageStore } from "./usage.js";
import { AddressSearch, type Provider } from "./addressSearch.js";
import { BoroughLookup } from "./boroughArea.js";
import { cachedNearestDoor, NominatimClient } from "./nominatim.js";
import { OsNamesClient } from "./osNames.js";
import { OsPlacesClient } from "./places.js";
import { ValhallaClient } from "./valhalla.js";

const config = loadConfig();
// Address search: whatever this server has. With none, /v1/addresses says it isn't set up.
const boroughs = BoroughLookup.fromFile();
const providers: Provider[] = [];
if (config.osNamesKey)
  providers.push({ source: "os-names", client: new OsNamesClient(config.osNamesKey, boroughs), cacheable: true });
const nominatim = config.nominatimUrl ? new NominatimClient(config.nominatimUrl, boroughs) : undefined;
if (nominatim) providers.push({ source: "osm", client: nominatim, cacheable: true });
if (config.osPlacesKey)
  providers.push({ source: "os-places", client: new OsPlacesClient(config.osPlacesKey), cacheable: false });
const places = providers.length ? new AddressSearch(providers) : undefined;
const valhalla = new ValhallaClient(config.valhallaUrl);
const closures = config.tflClosures ? new ClosureFeed(undefined, config.tflAppKey) : undefined;
closures?.start();
const router = closures ? avoidingClosures(valhalla, closures) : valhalla;
const learning = config.learning ? new LearningStore(`${config.learnedDir}/totals.json`) : undefined;
await learning?.load();
const learnedCsv = `${config.learnedDir}/practical_speeds.csv`;
setInterval(() => void learning?.save(learnedCsv).catch((err) => app.log.error(err)), 10 * 60_000).unref();
const usage = openUsage(config.usageDb);
setInterval(() => {
  try {
    usage?.rollup();
  } catch (err) {
    app.log.error(err);
  }
}, 60 * 60_000).unref();
const nearestDoor = nominatim ? cachedNearestDoor((lat, lng) => nominatim.nearestDoor(lat, lng)) : undefined;
const app = buildApp(config, router, places, valhalla, closures, undefined, learning, usage, nearestDoor);

/** The usage database; routing carries on without counts if it can't be opened. */
function openUsage(file: string | undefined): UsageStore | undefined {
  if (!file) return undefined;
  try {
    return new UsageStore(file);
  } catch (err) {
    console.error(`Usage counts are off: can't open ${file}: ${(err as Error).message}`);
    return undefined;
  }
}

app.listen({ port: config.port, host: config.host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    app
      .close()
      .then(() => learning?.save(learnedCsv))
      .finally(() => process.exit(0));
  });
}
