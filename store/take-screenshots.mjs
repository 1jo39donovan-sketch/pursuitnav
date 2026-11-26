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
// The route shots start here: to Bank, the blue-light route is offered at any
// hour (banned turns in the evening, bus-only Bishopsgate and Bank by day).
// From Holloway Road no trip offers it reliably (G1 spots, 26 Nov).
const SHOREDITCH = { latitude: 51.5236, longitude: -0.0776, accuracy: 8 };
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
  for (const b of ["Islington", "Haringey", "City of London"]) await page.getByText(b, exact()).last().click();
  await page.getByText("Next", exact()).last().click();
  await page.getByText("Car", exact()).last().click();
  await page.getByLabel("Callsign", exact()).last().fill(callsign);
  await page.getByText("Next", exact()).last().click();
  await page.getByText("Start", exact()).last().click();
  await page.waitForTimeout(2500);
  // The Driving Focus tip already seen, so it isn't in the navigation shot.
  // The app reads its settings at start, so set it and reload.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("blueroute:settings") ?? "{}");
    s.focusTipSeen = "1";
    localStorage.setItem("blueroute:settings", JSON.stringify(s));
  });
  await page.reload({ waitUntil: "networkidle" });
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
    console.log(`FAIL ${device.name}-${file}: ${e.message.split("\n").slice(0, 4).join(" | ")}`);
    await page.screenshot({ path: `${out}/debug-${device.name}-${file}.png` }).catch(() => {});
  }
}

// A tab: tapped (the app no longer bounces a first tap on Session back to
// Search after a reload, 19 Nov), or opened by its address if covered.
const TAB_PATH = { Session: "", Search: "search", Pursuit: "pursuit" };
const tab = async (page, name) => {
  try {
    await page.getByText(name, exact()).last().click({ timeout: 5_000 });
  } catch (e) {
    // Say what blocked it, for fixing the app if it's the app's fault.
    // The browser's own account, for telling whether the app is at fault.
    console.log(`  (tab ${name} tap blocked: ${e.message.split("\n").slice(-6).join(" | ").slice(0, 600)})`);
    await page.goto(new URL(TAB_PATH[name] ?? "", url).href, { waitUntil: "networkidle" });
    // Reopened on Session with a shift set up, the app goes on to Search (by design): tap back.
    if (name === "Session") {
      await page.waitForTimeout(1500);
      await page.getByText("Session", exact()).last().click({ timeout: 10_000 }).catch(() => {});
    }
  }
  await page.waitForTimeout(1500);
};
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
    await page.context().setGeolocation(SHOREDITCH);
    await page.waitForTimeout(3000);
    await search(page, "Bank station");
    // The result row, not the search box (which holds the same words).
    await page.getByText(/^Bank/).first().click();
    await page.getByLabel("Go on the standard route").last().waitFor({ timeout: 30_000 });
    // Both routes in the picture: wait for the blue-light one too.
    await page.getByText(/Blue light/i).first().waitFor({ timeout: 30_000 }).catch(() => console.log("  (no blue-light route offered)"));
    await page.waitForTimeout(2000);
  });

  await shot(page, device, "4-navigate", async () => {
    await page.getByLabel("Go on the standard route").last().click();
    await page.waitForTimeout(5000);
  });
  // End the route: one tap arms END, the second ends it. Touch taps, as on a
  // phone. The second follows at a person's pace: not within 0.35 s (the app
  // takes that as the same tap), and well inside the 5 s END stays armed.
  // Nothing in between: at the iPhone size this runner draws the map in
  // software so slowly that checks between the taps let END disarm (26 Nov).
  // (Shown in capitals, but the words underneath are "End", so go by the label.)
  await page.getByLabel("End navigation", exact()).last().tap();
  await page.waitForTimeout(800);
  // Straight away (force): waiting for the button to hold still for two drawn
  // frames took longer than END stays armed at the iPhone size here.
  await page.getByLabel("Tap again to end navigation", exact()).last().tap({ force: true });
  await page.waitForURL((u) => !u.pathname.endsWith("/navigate"), { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1000);
  await page.context().setGeolocation(HOLLOWAY);
  // A route kept for "Resume route" should be gone once it's ended: say if not.
  const kept = () =>
    page.evaluate(() => {
      const r = JSON.parse(localStorage.getItem("blueroute:settings") ?? "{}").resumeRoute;
      return r ? JSON.parse(r).destination?.title + " (saved " + new Date(JSON.parse(r).at).toISOString().slice(11, 19) + ")" : "none";
    });
  // At the iPhone size this runner can take longer than END stays armed (5 s)
  // just to draw a frame, so a route kept there says nothing about phones; the
  // Android size is the check that counts (26 Nov).
  console.log(`  ${device.name} route kept after END: ${await kept()}`);

  await shot(page, device, "5-pursuit", async () => {
    // The demo drive, so Pursuit shows a moving car at a legal speed.
    await tab(page, "Session");
    // Testing starts open on the web: a tap would close it, so open it only if shut.
    const blurb = page.getByText(/^Simulates a drive/).last();
    if (!(await blurb.isVisible().catch(() => false))) {
      await page.getByRole("button", { name: /^Testing:/ }).last().click();
    }
    // The switch's label isn't exposed on the web: the switch in the row with the blurb.
    await blurb
      .locator('xpath=ancestor::div[.//*[@role="switch"]][1]')
      .locator('[role="switch"]')
      .first()
      .click();
    await tab(page, "Pursuit");
    await page.waitForTimeout(12_000);
  });

  await shot(page, device, "2-session", async () => {
    await tab(page, "Session");
    // Testing shut (the store build has no test tools), and back to the top: the shift.
    if (await page.getByText(/^Simulates a drive/).last().isVisible().catch(() => false)) {
      await page.getByRole("button", { name: /^Testing:/ }).last().click();
    }
    await page.evaluate(() => {
      for (const el of document.querySelectorAll("*")) if (el.scrollTop > 0) el.scrollTop = 0;
      window.scrollTo(0, 0);
    });
  });

  await shot(page, device, "6-log", async () => {
    await tab(page, "Session");
    await page.getByText("Search log", exact()).last().click();
    await page.waitForTimeout(1500);
  });
  await page.goBack().catch(() => {});

  await shot(page, device, "8-paste-job", async () => {
    await tab(page, "Search");
    console.log(`  ${device.name} route kept before the paste-job shot: ${await kept()}`);
    // Not part of this picture.
    await page.getByText("Not now", exact()).last().click({ timeout: 2_000 }).catch(() => {});
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
    try {
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
    } catch (e) {
      // The desk's own screen: where this shot goes wrong, not the officer's.
      await desk.screenshot({ path: `${out}/debug-${device.name}-7-desk.png` }).catch(() => {});
      throw e;
    } finally {
      await desk.context().close();
    }
    await tab(page, "Search");
    await page.waitForTimeout(18_000);
  });

  await page.context().close();
}
await browser.close();
console.log(failed ? `${failed} shot(s) failed: see debug-*.png` : "All shots taken.");
process.exit(failed ? 1 : 0);
