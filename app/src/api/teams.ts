// Team sessions and follow-in on the server. Team blobs are sealed on the
// phone (team/crypto.ts) before they're sent.
import { API_URL } from "../config";
import type { RoadChoice } from "../session/SessionProvider";
import type { VehicleType } from "../vehicles";
import { RouteError, type PoliceRoute } from "./routes";

export interface SealedMember {
  memberId: string;
  blob: string;
  updatedAt: number;
}

export class NoTeamError extends Error {}

async function call(path: string, init?: RequestInit): Promise<Response> {
  if (!API_URL) throw new RouteError("Team sessions need the Blue Route server, which isn't set up in this build.");
  try {
    return await fetch(`${API_URL}${path}`, {
      ...init,
      headers: init?.body ? { "content-type": "application/json" } : undefined,
    });
  } catch {
    throw new RouteError("Can't reach the Blue Route server. Check your signal.");
  }
}

export async function putMember(teamId: string, memberId: string, token: string, blob: string): Promise<void> {
  const res = await call(`/v1/teams/${teamId}/members/${memberId}`, {
    method: "PUT",
    body: JSON.stringify({ token, blob }),
  });
  if (!res.ok) throw new RouteError(`Couldn't share with the team (${res.status}).`);
}

export async function getMembers(teamId: string): Promise<{ expiresAt: number; members: SealedMember[] }> {
  const res = await call(`/v1/teams/${teamId}`);
  if (res.status === 404) throw new NoTeamError("This team has ended.");
  if (!res.ok) throw new RouteError(`Couldn't load the team (${res.status}).`);
  return (await res.json()) as { expiresAt: number; members: SealedMember[] };
}

export async function deleteMember(teamId: string, memberId: string, token: string): Promise<void> {
  await call(`/v1/teams/${teamId}/members/${memberId}`, { method: "DELETE", body: JSON.stringify({ token }) }).catch(
    () => undefined,
  );
}

export interface FollowPlan {
  route: PoliceRoute;
  joinedAtM: number;
}

/** The way a colleague drove in, from here: to the nearest point of their track, then along it. */
export async function fetchFollow(
  from: { lat: number; lng: number; heading?: number },
  track: { lat: number; lng: number }[],
  vehicle: VehicleType,
  roads: RoadChoice,
  signal?: AbortSignal,
): Promise<FollowPlan> {
  const res = await call("/v1/follow", {
    method: "POST",
    body: JSON.stringify({ from, track: track.map((p) => [p.lng, p.lat]), vehicle, roads }),
    signal,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new RouteError(body.message ?? `Couldn't work out their way in (${res.status}).`);
  }
  return (await res.json()) as FollowPlan;
}
