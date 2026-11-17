// Photographs the live web app's map at known places, close in, so changes
// to what the map draws (stations and lines, police and A&E badges, the
// satellite look) can be seen without a phone. Run by
// .github/workflows/map-check.yml, which keeps the pictures as a download
// (not committed). Locally:
//   node tools/map-check.mjs https://bluerouteapp.com/app/ map-check
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const url = process.argv[2] ?? "https://bluerouteapp.com/app/";
const out = process.argv[3] ?? "map-check";
mkdirSync(out, { recursive: true });
const exact = () => ({ exact: true });

// [file name, where, zoom-in taps from the search map's start]
const SPOTS = [
  ["highbury-islington", { latitude: 51.5462, longitude: -0.1040 }, 3],
  ["kings-cross", { latitude: 51.5308, longitude: -0.1238 }, 2],
  ["islington-police", { latitude: 51.5337, longitude: -0.1100 }, 3],
  ["whittington-ae", { latitude: 51.5658, longitude: -0.1383 }, 3],
  ["stratford", { latitude: 51.5416, longitude: -0.0035 }, 2],
];
let failed = 0;

async function setUp(browser, where, viewport = { width: 440, height: 956 }) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "en-GB",
    timezoneId: "Europe/London",
    geolocation: { ...where, accuracy: 8 },
    permissions: ["geolocation"],
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "I agree to the terms of use" }).click({ timeout: 30_000 });
  await page.getByText("Police", exact()).last().click();
  await page.getByRole("button", { name: /^London/ }).click();
  await page.getByText("Islington", exact()).last().click();
  await page.getByText("Next", exact()).last().click();
  await page.getByText("Car", exact()).last().click();
  await page.getByLabel("Callsign", exact()).last().fill("TEST1");
  await page.getByText("Next", exact()).last().click();
  await page.getByText("Start", exact()).last().click();
  await page.waitForTimeout(2000);
  return { ctx, page };
}

async function shoot(page, name, zoomTaps) {
  await page.getByText("Search", exact()).last().click();
  await page.waitForTimeout(3000);
  // The Search map has no + button: zoom with the wheel over its middle.
  const box = page.viewportSize();
  await page.mouse.move(box.width / 2, box.height / 2);
  for (let i = 0; i < zoomTaps; i++) {
    await page.mouse.wheel(0, -500);
    await page.waitForTimeout(700);
  }
  // Tiles, the places file and the lines file in.
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(`ok   ${name}`);
}

const browser = await chromium.launch();
for (const [name, where, taps] of SPOTS) {
  let page;
  try {
    const made = await setUp(browser, where);
    page = made.page;
    const ctx = made.ctx;
    await shoot(page, name, taps);
    if (name === "highbury-islington") {
      // The satellite look, chosen on Session.
      await page.getByText("Session", exact()).last().click();
      await page.getByRole("button", { name: /^Map and voice:/ }).last().click();
      await page.getByText("Satellite", exact()).last().click();
      await shoot(page, `${name}-satellite`, 0);
    }
    await ctx.close();
  } catch (e) {
    failed++;
    await page?.screenshot({ path: `${out}/debug-${name}.png` }).catch(() => {});
    console.log(`FAIL ${name}: ${e.message.split("\n").slice(0, 3).join(" | ")}`);
  }
}
// Navigation with the phone on its side (PM round 4: the turn list was
// clipped): a large iPhone and a small Android, on a route from Holloway.
const HOLLOWAY = { latitude: 51.5532, longitude: -0.1154 };
for (const [name, viewport] of [
  ["navigate-landscape-iphone", { width: 956, height: 440 }],
  ["navigate-landscape-android", { width: 720, height: 360 }],
]) {
  let page;
  try {
    const made = await setUp(browser, HOLLOWAY, viewport);
    page = made.page;
    await page.getByText("Search", exact()).last().click();
    const box = page.getByLabel("Address from the control room").last();
    await box.fill("54 Caledonian Road");
    await page.waitForTimeout(2500);
    await page.getByText("54 Caledonian Road", exact()).last().click();
    await page.getByLabel("Go on the standard route").last().click({ timeout: 30_000 });
    await page.waitForTimeout(8000);
    await page.screenshot({ path: `${out}/${name}.png` });
    console.log(`ok   ${name}`);
    await made.ctx.close();
  } catch (e) {
    failed++;
    await page?.screenshot({ path: `${out}/debug-${name}.png` }).catch(() => {});
    console.log(`FAIL ${name}: ${e.message.split("\n").slice(0, 3).join(" | ")}`);
  }
}

// Pursuit with the phone on its side (the spec: portrait and landscape), and
// the map in night colours, for the stations, lines and badges.
for (const [name, viewport] of [
  ["pursuit-landscape-iphone", { width: 956, height: 440 }],
  ["pursuit-landscape-android", { width: 720, height: 360 }],
  ["stratford-night", { width: 440, height: 956 }],
]) {
  let page;
  try {
    const where = name.startsWith("stratford") ? { latitude: 51.5416, longitude: -0.0035 } : HOLLOWAY;
    const made = await setUp(browser, where, viewport);
    page = made.page;
    if (name.endsWith("night")) {
      await page.getByText("Session", exact()).last().click();
      await page.getByRole("button", { name: /^Map and voice:/ }).last().click();
      await page.getByText("☾ Night", exact()).last().click();
      await shoot(page, name, 2);
    } else {
      // The demo drive, so the speed, road and heading have values to fit.
      await page.getByText("Session", exact()).last().click();
      const blurb = page.getByText(/^Simulates a drive/).last();
      if (!(await blurb.isVisible().catch(() => false))) {
        await page.getByRole("button", { name: /^Testing:/ }).last().click();
      }
      await blurb
        .locator('xpath=ancestor::div[.//*[@role="switch"]][1]')
        .locator('[role="switch"]')
        .first()
        .click();
      await page.getByText("Pursuit", exact()).last().click();
      await page.waitForTimeout(10_000);
      await page.screenshot({ path: `${out}/${name}.png` });
      console.log(`ok   ${name}`);
    }
    await made.ctx.close();
  } catch (e) {
    failed++;
    await page?.screenshot({ path: `${out}/debug-${name}.png` }).catch(() => {});
    console.log(`FAIL ${name}: ${e.message.split("\n").slice(0, 3).join(" | ")}`);
  }
}

await browser.close();
if (failed) {
  console.log(`${failed} spot(s) failed`);
  process.exit(1);
}
