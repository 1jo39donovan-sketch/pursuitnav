// What a place OpenStreetMap calls a police station really is, from its name
// (17 Nov 2026 audit of the 167 in London, Kent and Essex): a station, a
// base with no public counter (ward and neighbourhood-team offices, patrol
// bases, garages, the boat yard), or not somewhere to send anyone (a former
// station, another agency, an office or a lab). Bases still show on the map,
// marked as such; neither bases nor the rest are offered as the nearest
// police station.
export type PoliceSite = "station" | "base" | "not-police";

const NOT_POLICE =
  /\b(former|old police house|museum)\b|aux fronti[eè]res|douane|national crime agency|\braf police\b|\bmdp\b|ministry of defence|forensic|records office|overseas visitors/i;
const BASE =
  /\bward(s)?\b|safer neighbourhood|neighbourhood (policing|safety)|community (policing|police)|patrol base|police office|\bgarage\b|boat ?yard|marine unit|traffic (base|police)|\bheadquarters\b|\bhq\b|custody (base|centre)|\bbase\b/i;

export function policeSite(name: string): PoliceSite {
  if (NOT_POLICE.test(name)) return "not-police";
  // A custody base or centre is where the custody suite is: a station for custody, not a front counter.
  if (BASE.test(name)) return "base";
  return "station";
}
