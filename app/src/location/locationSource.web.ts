// GPS in a browser (the web version, e.g. Safari on an iPhone). Talks to
// navigator.geolocation directly: expo-location's web version asks for
// low-accuracy positions and drops errors, so a refusal left the app
// waiting for a position forever.
import type { Fix, LocationStatus } from "./LocationProvider";

const OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 };

function toFix(p: GeolocationPosition): Fix {
  const { latitude, longitude, accuracy, speed, heading } = p.coords;
  return {
    lat: latitude,
    lng: longitude,
    accuracy: accuracy != null && accuracy >= 0 ? accuracy : null,
    speed: speed != null && speed >= 0 ? speed : null,
    course: heading != null && heading >= 0 && !Number.isNaN(heading) ? heading : null,
    timestamp: p.timestamp,
  };
}

export async function checkLocation(ask: boolean): Promise<LocationStatus> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return "services-off";
  let state: PermissionState | null = null;
  try {
    state = (await navigator.permissions?.query({ name: "geolocation" }))?.state ?? null;
  } catch {
    // Not every browser can say; asking for a position will find out.
  }
  if (state === "granted") return "granted";
  if (state === "denied") return "denied";
  if (!ask) return "needs-permission";
  // Asking for a position is what makes the browser show its prompt.
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      () => resolve("granted"),
      (err) => resolve(err.code === err.PERMISSION_DENIED ? "denied" : "granted"),
      OPTIONS,
    ),
  );
}

export async function watchLocation(onFix: (fix: Fix) => void, onRefused: () => void): Promise<() => void> {
  const id = navigator.geolocation.watchPosition(
    (p) => onFix(toFix(p)),
    (err) => {
      // A timeout or no signal yet: keep waiting. A refusal: say so.
      if (err.code === err.PERMISSION_DENIED) onRefused();
    },
    OPTIONS,
  );
  return () => navigator.geolocation.clearWatch(id);
}

/**
 * No compass in the web version: Safari only gives it after an extra
 * permission prompt. The map shows the last direction of travel instead.
 */
/**
 * The phone's compass in the browser, so the arrow points the right way
 * before the vehicle moves. iPhones ask first ("motion and orientation"),
 * and only from a tap, so the first tap anywhere asks. Readings come many
 * times a second; passed on only when they turn 3° or more, at most 4 a second.
 */
export async function watchCompass(onHeading: (degrees: number) => void): Promise<() => void> {
  if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return () => {};
  let last: number | null = null;
  let lastAt = 0;
  const pass = (deg: number) => {
    const now = Date.now();
    const turned = last === null ? 360 : Math.abs(((deg - last + 540) % 360) - 180);
    if (turned < 3 || now - lastAt < 250) return;
    last = deg;
    lastAt = now;
    onHeading(deg);
  };
  // iPhone: degrees from north. Others: alpha counts anticlockwise from north, when absolute.
  const onEvent = (e: DeviceOrientationEvent) => {
    const ios = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
    if (typeof ios === "number" && Number.isFinite(ios)) return pass(ios);
    if (e.absolute && typeof e.alpha === "number") pass((360 - e.alpha) % 360);
  };
  const listen = () => {
    window.addEventListener("deviceorientationabsolute", onEvent as EventListener);
    window.addEventListener("deviceorientation", onEvent);
  };
  const ask = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
  let onTap: (() => void) | null = null;
  if (ask) {
    onTap = () => {
      document.removeEventListener("touchend", onTap!);
      document.removeEventListener("click", onTap!);
      ask()
        .then((answer) => answer === "granted" && listen())
        .catch(() => {});
    };
    document.addEventListener("touchend", onTap);
    document.addEventListener("click", onTap);
  } else {
    listen();
  }
  return () => {
    if (onTap) {
      document.removeEventListener("touchend", onTap);
      document.removeEventListener("click", onTap);
    }
    window.removeEventListener("deviceorientationabsolute", onEvent as EventListener);
    window.removeEventListener("deviceorientation", onEvent);
  };
}
