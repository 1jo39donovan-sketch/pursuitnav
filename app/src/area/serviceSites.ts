// What a place OpenStreetMap calls a police, fire or ambulance station really
// is. Police: what a place OpenStreetMap calls a police station really is, from its name
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

/**
 * A mapped fire or ambulance station: one of the county's or London's own
 * ("service"), someone else's that keeps its badge ("other", with who runs
 * it: an airport, the RAF, Eurotunnel, St John Ambulance), or not a station
 * to send anyone to ("none": a former station, a depot, a mislabelled A&E).
 * Only "service" is offered as the nearest station.
 */
export type ServiceSite = { site: "service" } | { site: "other"; operator: string } | { site: "none" };

export function fireSite(name: string): ServiceSite {
  if (/\b(old|former)\b/i.test(name)) return { site: "none" };
  if (/\braf\b/i.test(name)) return { site: "other", operator: "RAF fire service" };
  if (/airport|airfield|\blcy\b|stansted/i.test(name)) return { site: "other", operator: "Airport fire service" };
  if (/\bfemc\b|eurotunnel/i.test(name)) return { site: "other", operator: "Eurotunnel fire service" };
  if (/wethersfield/i.test(name)) return { site: "other", operator: "MoD fire service" };
  return { site: "service" };
}

export function ambulanceSite(name: string): ServiceSite {
  if (/a&e|accident|vehicle logistics|annexe|\bold\b|former/i.test(name)) return { site: "none" };
  if (/st\.? john'?s? am(b)?ulance/i.test(name)) return { site: "other", operator: "St John Ambulance: a volunteer first-aid charity, not the NHS ambulance service" };
  return { site: "service" };
}

/**
 * Whether a police, fire or ambulance station is one to offer as "nearest" or
 * in a station list: a police station with a front counter, the brigade's or
 * the NHS service's own. Other kinds of place pass unchanged.
 */
export function offeredStation(p: { type: string; name: string }): boolean {
  if (p.type === "Police station") return policeSite(p.name) === "station";
  if (p.type === "Fire station") return fireSite(p.name).site === "service";
  if (p.type === "Ambulance station") return ambulanceSite(p.name).site === "service";
  return true;
}
