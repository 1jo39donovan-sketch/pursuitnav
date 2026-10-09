// Packs a web export (npm run build:demo) into one self-contained HTML page:
// JS, CSS and fonts inlined, nothing fetched from other hosts. Used to share
// a demo link; not part of the phone app.
//
// Usage: node scripts/build-demo-page.mjs <export-dir> <out.html>
import { copyFileSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const [dir, out] = process.argv.slice(2);
if (!dir || !out) {
  console.error("Usage: node scripts/build-demo-page.mjs <export-dir> <out.html>");
  process.exit(1);
}

const index = readFileSync(join(dir, "index.html"), "utf8");
const read = (url) => readFileSync(join(dir, url.replace(/^\//, "")), "utf8");
const css = [...index.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => read(m[1]));
const js = [...index.matchAll(/<script src="([^"]+)"/g)].map((m) => read(m[1]));

const usedFonts = [
  "BarlowCondensed_500Medium",
  "BarlowCondensed_600SemiBold",
  "BarlowCondensed_700Bold",
  "IBMPlexSans_400Regular",
  "IBMPlexSans_500Medium",
  "IBMPlexSans_600SemiBold",
  "IBMPlexMono_500Medium",
];

// The bundle points each font at its own file under /assets, which a
// single page can't serve. Swap those paths for the font data itself.
const ttfs = [];
(function walk(d) {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".ttf")) ttfs.push(p);
  }
})(join(dir, "assets"));
let bundle = js.join("\n");
let fontsInlined = 0;
bundle = bundle.replace(/"(\/assets\/[^"]+\.ttf)"/g, (whole, url) => {
  const file = join(dir, url.replace(/^\//, ""));
  if (!ttfs.includes(file)) return whole;
  // Only fonts the app actually loads are worth the bytes (see src/theme.ts).
  if (!new RegExp(`/(${usedFonts.join("|")})\\.`).test(url)) return whole;
  fontsInlined++;
  return `"data:font/ttf;base64,${readFileSync(file).toString("base64")}"`;
});
if (fontsInlined !== usedFonts.length) {
  throw new Error(`Expected ${usedFonts.length} fonts in the bundle, inlined ${fontsInlined}`);
}

// Search data is too big to inline: publish it next to the page (as
// roads.dat, postcodes.dat) and point the bundle at it, relative to the page.
const outDir = dirname(out);
const dataFiles = [];
bundle = bundle.replace(/"\/assets\/assets\/data\/([a-z]+)\.[0-9a-f]+\.dat"/g, (whole, name) => {
  const src = join(dir, whole.slice(2, -1));
  copyFileSync(src, join(outDir, `${name}.dat`));
  dataFiles.push(`${name}.dat`);
  return `(window.__blueRouteBase+"${name}.dat")`;
});

// Keep "</script" inside the bundle from closing the inline script tag.
const inlineJs = bundle.replace(/<\/script/gi, "<\\/script");

const page = `<title>Blue Route Demo</title>
<style>
:root{color-scheme:dark}
html,body{height:100%;margin:0;background:#0c1220}
body{overflow:hidden}
#root{display:flex;height:100%;flex:1}
${css.join("\n")}
</style>
<div id="root"></div>
<script>
// Remember where the page lives (data files sit next to it), then start
// Expo Router on the first tab whatever URL the page is served from.
window.__blueRouteBase = new URL(".", location.href).href;
try { history.replaceState(null, "", "/"); } catch (e) {}
</script>
<script>
${inlineJs}
</script>
`;
writeFileSync(out, page);
console.log(`Wrote ${out} (${(page.length / 1024 / 1024).toFixed(1)} MB)`);
if (dataFiles.length) console.log(`Publish alongside it: ${dataFiles.map((f) => basename(f)).join(", ")}`);
