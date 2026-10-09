import { Asset } from "expo-asset";

/** Reads a bundled text asset in the browser. */
export async function loadText(moduleId: number): Promise<string> {
  const res = await fetch(Asset.fromModule(moduleId).uri);
  if (!res.ok) throw new Error(`Couldn't load search data (${res.status})`);
  return res.text();
}
