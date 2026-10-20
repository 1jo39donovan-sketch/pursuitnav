import { buildApp } from "./app.js";
import { avoidingClosures, ClosureFeed } from "./closures.js";
import { loadConfig } from "./config.js";
import { LearningStore } from "./learning.js";
import { OsPlacesClient } from "./places.js";
import { ValhallaClient } from "./valhalla.js";

const config = loadConfig();
const places = config.osPlacesKey ? new OsPlacesClient(config.osPlacesKey) : undefined;
const valhalla = new ValhallaClient(config.valhallaUrl);
const closures = config.tflClosures ? new ClosureFeed(undefined, config.tflAppKey) : undefined;
closures?.start();
const router = closures ? avoidingClosures(valhalla, closures) : valhalla;
const learning = config.learning ? new LearningStore(`${config.learnedDir}/totals.json`) : undefined;
await learning?.load();
const learnedCsv = `${config.learnedDir}/practical_speeds.csv`;
setInterval(() => void learning?.save(learnedCsv).catch((err) => app.log.error(err)), 10 * 60_000).unref();
const app = buildApp(config, router, places, valhalla, closures, undefined, learning);

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
