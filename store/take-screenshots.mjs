// Store screenshots from the live web app, at the store sizes (STORE.md).
// Run by .github/workflows/store-screenshots.yml; locally:
//   node store/take-screenshots.mjs https://bluerouteapp.com/app/ store/screenshots
// Made-up callsigns and areas only. Each shot is tried on its own, so one
// that fails (a changed label, a slow answer) doesn't lose the rest.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const url = process.argv[2] ?? "https://bluerouteapp.com/app/";
const out = process.argv[3] ?? "store/screenshots";
mkdirSync(out, { recursive: true });

// CSS size × 3 = the store's pixel size.
const DEVICES = [
  { name: "iphone", width: 440, height: 956 }, // 1320 × 2868
  { name: "android", width: 360, height: 720 }, // 1080 × 2160
];
const HOLLOWAY = { latitude: 51.5532, longitude: -0.1154, accuracy: 8 };
const JOB =
  "Concern for welfare: neighbour reports an elderly male not seen for two days at Flat 3, Smith House, 54 Caledonian Road N7 8LA";
let failed = 0;

const exact = () => ({ exact: true });

async function newPage(browser, device, callsign) {
  const ctx = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: "en-GB",
    timezoneId: "Europe/London",
    geolocation: HOLLOWAY,
    permissions: ["geolocation"],
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "I agree to the terms of use" }).click({ timeout: 30_000 });
  // First-launch set-up: police, London, two boroughs, car, a made-up callsign, blue light on.
  await page.getByText("Police", exact()).last().click();
  await page.getByRole("button", { name: /^London/ }).click();
  for (const b of ["Islington", "Haringey"]) await page.getByText(b, exact()).last().click();
  await page.getByText("Next", exact()).last().click();
  await page.getByText("Car", exact()).last().click();
  await page.getByLabel("Callsign", exact()).last().fill(callsign);
  await page.getByText("Next", exact()).last().click();
  await page.getByText("Start", exact()).last().click();
  await page.waitForTimeout(2500);
  return page;
}

async function shot(page, device, file, steps) {
  try {
    await steps();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/${device.name}-${file}.png` });
    console.log(`ok   ${device.name}-${file}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${device.name}-${file}: ${e.message.split("\n")[0]}`);
    await page.screenshot({ path: `${out}/debug-${device.name}-${file}.png` }).catch(() => {});
  }
}

const tab = (page, name) => page.getByText(name, exact()).last().click();
const search = async (page, text) => {
  const box = page.getByLabel("Address from the control room").last();
  await box.fill("");
  await box.fill(text);
  await page.waitForTimeout(2500);
};

const browser = await chromium.launch();
for (const device of DEVICES) {
  const page = await newPage(browser, device, "NI-31");

  await shot(page, device, "1-search", async () => {
    await tab(page, "Search");
    await search(page, "stroud green rd");
  });

  await shot(page, device, "3-routes", async () => {
    await search(page, "54 Caledonian Road");
    // The result row, not the search box (which holds the same words).
    await page.getByText("54 Caledonian Road", exact()).last().click();
    await page.getByLabel("Go on the standard route").last().waitFor({ timeout: 30_000 });
  });

  await shot(page, device, "4-navigate", async () => {
    await page.getByLabel("Go on the standard route").last().click();
    await page.waitForTimeout(5000);
  });
  // End the route: one tap arms END, the second ends it.
  // (Shown in capitals, but the words underneath are "End", so go by the label.)
  await page.getByLabel("End navigation", exact()).last().click();
  await page.getByLabel("Tap again to end navigation", exact()).last().click();
  await page.waitForTimeout(1500);

  await shot(page, device, "5-pursuit", async () => {
    // The demo drive, so Pursuit shows a moving car at a legal speed.
    await tab(page, "Session");
    await page.getByText("Testing", exact()).last().click();
    // The switch's name isn't exposed on the web, so find it in the row with the words.
    const row = page.locator("div", { has: page.getByText("Demo drive", exact()) });
    await row.locator('[role="switch"], input[type="checkbox"]').last().click();
    await tab(page, "Pursuit");
    await page.waitForTimeout(12_000);
  });

  await shot(page, device, "2-session", async () => {
    await tab(page, "Session");
    await page.mouse.wheel(0, -5000);
  });

  await shot(page, device, "6-log", async () => {
    await tab(page, "Session");
    await page.getByText("Search log", exact()).last().click();
    await page.waitForTimeout(1500);
  });
  await page.goBack().catch(() => {});

  await shot(page, device, "8-paste-job", async () => {
    await tab(page, "Search");
    await search(page, JOB);
  });

  // A team message: a "desk" sends this officer a caution.
  await shot(page, device, "7-team-message", async () => {
    await tab(page, "Search");
    await page.getByLabel("Clear search").last().click().catch(() => {});
    await tab(page, "Session");
    await page.getByText("Team", exact()).last().click();
    await page.getByText("Start a team", exact()).last().click();
    await page.waitForTimeout(4000);
    const code = (await page.getByLabel(/^Team code /).last().getAttribute("aria-label")).replace("Team code ", "");
    const desk = await newPage(browser, device, "CONTROL-2");
    await tab(desk, "Session");
    await desk.getByText("Team", exact()).last().click();
    await desk.getByText("Join with a code", exact()).last().click();
    await desk.getByPlaceholder("Paste the code or the whole message").last().fill(code);
    await desk.getByText("Join", exact()).last().click();
    await desk.waitForTimeout(18_000);
    await tab(desk, "Search");
    await search(desk, "Mayton Street");
    await desk.getByText("Mayton Street", exact()).last().click();
    await desk.getByText("Send this place to the team", exact()).last().click({ timeout: 30_000 });
    await desk.getByText("Caution here", exact()).last().click();
    await desk.getByText("NI-31", exact()).last().click();
    await desk.getByLabel("Message").last().fill("Dog loose in the rear garden. Approach from the front.");
    await desk.getByText("Send", exact()).last().click();
    await desk.waitForTimeout(2500);
    await desk.context().close();
    await tab(page, "Search");
    await page.waitForTimeout(18_000);
  });

  await page.context().close();
}
await browser.close();
console.log(failed ? `${failed} shot(s) failed: see debug-*.png` : "All shots taken.");
process.exit(failed ? 1 : 0);
