// Makes the web version installable as a full-screen app: "Add to Home
// Screen" on an iPhone (or "Install app" on Android Chrome) then opens Blue
// Route without the browser's address and tool bars, which take a good part
// of a phone screen. Run on a web export (web.yml does).
//
// Usage: node scripts/web-app-shell.mjs <export-dir> <base path, e.g. /pursuitnav>
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [dir, base = ""] = process.argv.slice(2);
if (!dir) {
  console.error("Usage: node scripts/web-app-shell.mjs <export-dir> [base path]");
  process.exit(1);
}
const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const prefix = base.replace(/\/+$/, "");
const BG = "#0c1220";

copyFileSync(join(app, "assets", "icon.png"), join(dir, "icon.png"));
writeFileSync(
  join(dir, "manifest.json"),
  JSON.stringify(
    {
      name: "BlueRoute",
      short_name: "BlueRoute",
      start_url: `${prefix}/`,
      scope: `${prefix}/`,
      display: "standalone",
      orientation: "any",
      background_color: BG,
      theme_color: BG,
      icons: [{ src: `${prefix}/icon.png`, sizes: "1024x1024", type: "image/png", purpose: "any" }],
    },
    null,
    2,
  ),
);

const tags = [
  // The page runs edge to edge, under the iPhone's status bar; the app's own
  // safe-area padding keeps text clear of it.
  `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />`,
  `<meta name="apple-mobile-web-app-capable" content="yes" />`,
  `<meta name="mobile-web-app-capable" content="yes" />`,
  `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />`,
  `<meta name="apple-mobile-web-app-title" content="BlueRoute" />`,
  `<meta name="theme-color" content="${BG}" />`,
  `<link rel="manifest" href="${prefix}/manifest.json" />`,
  `<link rel="apple-touch-icon" href="${prefix}/icon.png" />`,
].join("\n");

for (const page of ["index.html", "404.html"]) {
  let html;
  try {
    html = readFileSync(join(dir, page), "utf8");
  } catch {
    continue;
  }
  html = html.replace(/<meta name="viewport"[^>]*>/, "");
  html = html.replace("</head>", `${tags}\n</head>`);
  writeFileSync(join(dir, page), html);
}
console.log(`Web app shell added (start ${prefix}/)`);
