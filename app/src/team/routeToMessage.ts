// Route here, from a team message: opens Search with a route to its place,
// as "Route there again" from the Log does.
import { router } from "expo-router";

import type { TeamMessage } from "./messages";

export function routeToMessage(m: TeamMessage) {
  if (!m.place) return;
  router.navigate({
    pathname: "/search",
    params: {
      lat: String(m.place.lat),
      lng: String(m.place.lng),
      title: m.place.label,
      from: `msg-${m.id}`,
      // The sender's note ("rear entrance"), shown with the route and while navigating.
      ...(m.text ? { note: `${m.cs}: ${m.text}` } : {}),
    },
  });
}
