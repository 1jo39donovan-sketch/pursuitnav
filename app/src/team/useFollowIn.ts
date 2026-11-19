// "Follow in": route to the nearest point of a colleague's recent drive, then
// along it. Used from the team list on Session and a colleague's card on the map.
import { router } from "expo-router";
import { useState } from "react";

import { fetchFollow } from "../api/teams";
import { boroughAt } from "../area/area";
import { routeOrigin, useLocation } from "../location/LocationProvider";
import { useLog } from "../log/LogProvider";
import { useNavigation } from "../navigation/NavigationProvider";
import { useSession } from "../session/SessionProvider";
import type { TeamMember } from "./TeamProvider";

export function useFollowIn() {
  const { fix } = useLocation();
  const { vehicle, roads } = useSession();
  const navigation = useNavigation();
  const log = useLog();
  /** The member ID being worked out. */
  const [following, setFollowing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const follow = async (m: TeamMember) => {
    if (!fix) return setError("Waiting for your GPS position.");
    setError(null);
    setFollowing(m.memberId);
    try {
      const plan = await fetchFollow(routeOrigin(fix), m.track, vehicle, roads);
      const id = log.record({
        query: `Follow ${m.callsign}`,
        chosen: `${m.callsign}'s way in`,
        borough: boroughAt(m.lat, m.lng),
        lat: m.lat,
        lng: m.lng,
      });
      log.setRoute(id, "follow");
      navigation.start(
        "follow",
        { standard: plan.route, police: plan.route },
        { lat: m.lat, lng: m.lng, title: `${m.callsign}'s way in` },
        { callsign: m.callsign, track: m.track },
      );
      router.push("/navigate");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFollowing(null);
    }
  };
  return { follow, following, error };
}
