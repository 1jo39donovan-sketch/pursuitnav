import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { OsPlacesClient } from "./places.js";
import { ValhallaClient } from "./valhalla.js";

const config = loadConfig();
const places = config.osPlacesKey ? new OsPlacesClient(config.osPlacesKey) : undefined;
const valhalla = new ValhallaClient(config.valhallaUrl);
const app = buildApp(config, valhalla, places, valhalla);

app.listen({ port: config.port, host: config.host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    app.close().then(() => process.exit(0));
  });
}
