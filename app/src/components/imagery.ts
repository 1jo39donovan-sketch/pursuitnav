// Whether the server can draw satellite photos (it has an imagery key): asked
// once a launch, and remembered on the phone so the map doesn't flick from
// standard to satellite while the answer comes. No server, no satellite.
import { useEffect, useState } from "react";

import { serverJson } from "../api/http";
import { API_URL } from "../config";
import { store } from "../storage/store";

const KEY = "imageryOffered";
let asked: Promise<boolean> | null = null;

function ask(): Promise<boolean> {
  if (!API_URL) return Promise.resolve(false);
  asked ??= serverJson<{ imagery?: boolean }>(`${API_URL}/health`)
    .then((res) => {
      if (!res.ok) throw new Error("health");
      const on = res.body?.imagery === true;
      store.setSetting(KEY, on ? "1" : "0");
      return on;
    })
    .catch(() => {
      asked = null;
      return store.getSetting(KEY) === "1";
    });
  return asked;
}

/** Satellite photos can be drawn (the last answer until this launch's comes). */
export function useImageryOffered(): boolean {
  const [on, setOn] = useState(() => !!API_URL && store.getSetting(KEY) === "1");
  useEffect(() => {
    let live = true;
    ask().then((v) => live && setOn(v));
    return () => {
      live = false;
    };
  }, []);
  return on;
}
