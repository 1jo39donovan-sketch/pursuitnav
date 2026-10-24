// Team sessions: everyone on the job shares where they are, and the way they
// drove there, with the rest of the team, while BlueRoute is open.
//
// Shares are sealed on this phone with the team code's key (team/crypto.ts),
// so the server can't read them. The team code, member ID and token are kept
// in settings so a team survives the app being closed; the track is only ever
// in memory.
import { getRandomBytes } from "expo-crypto";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { deleteMember, getMembers, NoTeamError, putMember } from "../api/teams";
import { useLocation } from "../location/LocationProvider";
import { useSession } from "../session/SessionProvider";
import { store } from "../storage/store";
import { formatCode, newTeamCode, normaliseCode, open, randomHex, seal, teamKeys } from "./crypto";
import { addFix, decodeTrack, encodeTrack, type TrackPoint } from "./track";

export interface TeamMember {
  memberId: string;
  callsign: string;
  lat: number;
  lng: number;
  heading: number | null;
  /** When their phone took this position, ms since 1970. */
  at: number;
  /** Where they've driven lately, oldest first, ending where they are. */
  track: { lat: number; lng: number }[];
  me: boolean;
}

// "notfound": no team has this code (yet), so nothing is shared. Joining
// never makes a team: only "Start a team" does.
export type TeamStatus = "off" | "connecting" | "live" | "offline" | "notfound" | "ended";

interface TeamValue {
  /** The team code, formatted for sharing; null when not in a team. */
  code: string | null;
  status: TeamStatus;
  /** Everyone in the team, you included, most recently seen first. */
  members: TeamMember[];
  /** When the team ends, ms since 1970 (a week after it started). */
  expiresAt: number | null;
  /** Colleagues seen in the last half hour, for a map's team prop. */
  mapPoints: GeoJSON.FeatureCollection;
  create: () => void;
  /** Joins with a code as typed. False if it isn't a team code. */
  join: (typed: string) => boolean;
  leave: () => void;
}

const SHARE_EVERY_MS = 15_000;
const random = (n: number) => getRandomBytes(n);

interface Shared {
  v: 1;
  cs: string;
  p: [number, number];
  h: number | null;
  t: number;
  tr: number[];
}

const TeamContext = createContext<TeamValue | null>(null);

export function TeamProvider({ children }: { children: ReactNode }) {
  const { callsign } = useSession();
  const { fix } = useLocation();
  const [code, setCode] = useState(() => normaliseCode(store.getSetting("teamCode") ?? ""));
  const [status, setStatus] = useState<TeamStatus>(code ? "connecting" : "off");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [mapPoints, setMapPoints] = useState<GeoJSON.FeatureCollection>(NO_POINTS);

  // This phone's place in the team; made on joining, kept until leaving.
  const me = useRef({
    memberId: store.getSetting("teamMember") ?? "",
    token: store.getSetting("teamToken") ?? "",
  });
  // Whether this phone started the team. Its shares (re)make the team, so
  // the team comes back if the server restarts; nobody else's can.
  const starter = useRef(store.getSetting("teamStarter") === "1");
  // Whether this team has been seen, so a 404 after that means it ended.
  const seen = useRef(false);
  const track = useRef<TrackPoint[]>([]);
  const latest = useRef({ fix, callsign });
  useEffect(() => {
    latest.current = { fix, callsign };
  }, [fix, callsign]);

  // Record the drive while in a team, so colleagues can follow you in.
  useEffect(() => {
    if (code && fix)
      track.current = addFix(track.current, {
        lat: fix.lat,
        lng: fix.lng,
        at: fix.timestamp,
      });
  }, [code, fix]);

  const enter = useCallback((normalised: string, started: boolean) => {
    starter.current = started;
    seen.current = false;
    store.setSetting("teamStarter", started ? "1" : "");
    me.current = {
      memberId: randomHex(random, 16),
      token: randomHex(random, 24),
    };
    store.setSetting("teamCode", normalised);
    store.setSetting("teamMember", me.current.memberId);
    store.setSetting("teamToken", me.current.token);
    track.current = [];
    setMembers([]);
    setMapPoints(NO_POINTS);
    setExpiresAt(null);
    setStatus("connecting");
    setCode(normalised);
  }, []);

  const create = useCallback(() => enter(normaliseCode(newTeamCode(random))!, true), [enter]);
  const join = useCallback(
    (typed: string) => {
      const normalised = normaliseCode(typed);
      if (!normalised) return false;
      if (normalised !== code) enter(normalised, false);
      return true;
    },
    [code, enter],
  );
  const leave = useCallback(() => {
    if (code) void deleteMember(teamKeys(code).teamId, me.current.memberId, me.current.token);
    store.setSetting("teamCode", "");
    track.current = [];
    setMembers([]);
    setMapPoints(NO_POINTS);
    setExpiresAt(null);
    setStatus("off");
    setCode(null);
  }, [code]);

  // Share and refresh every 15 seconds while the app is open.
  useEffect(() => {
    if (!code) return;
    const { teamId, key } = teamKeys(code);
    let stopped = false;
    const tick = async () => {
      const { fix: f, callsign: cs } = latest.current;
      try {
        if (f) {
          const shared: Shared = {
            v: 1,
            cs: cs || "No callsign",
            p: [f.lat, f.lng],
            h: f.course,
            t: f.timestamp,
            tr: encodeTrack(track.current),
          };
          await putMember(teamId, me.current.memberId, me.current.token, seal(key, shared, random), starter.current);
        }
        const team = await getMembers(teamId);
        if (stopped) return;
        setExpiresAt(team.expiresAt);
        const list = team.members
          .map((m) => toMember(m.memberId, open(key, m.blob), m.memberId === me.current.memberId))
          .filter((m): m is TeamMember => m !== null)
          .sort((a, b) => b.at - a.at);
        setMembers(list);
        setMapPoints(teamPoints(list, Date.now()));
        seen.current = true;
        setStatus("live");
      } catch (err) {
        if (stopped) return;
        if (!(err instanceof NoTeamError)) setStatus("offline");
        // Your new team is made with your first position.
        else if (starter.current) setStatus(f ? "ended" : "connecting");
        // Keep checking: the code may be wrong, or whoever started the team
        // hasn't shared yet. Once it's live, a 404 means it ended.
        else setStatus(seen.current ? "ended" : "notfound");
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), SHARE_EVERY_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [code]);

  const value = useMemo(
    () => ({
      code: code ? formatCode(code) : null,
      status,
      members,
      expiresAt,
      mapPoints,
      create,
      join,
      leave,
    }),
    [code, status, members, expiresAt, mapPoints, create, join, leave],
  );
  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

function toMember(memberId: string, raw: unknown, me: boolean): TeamMember | null {
  const s = raw as Partial<Shared> | null;
  if (!s || s.v !== 1 || !Array.isArray(s.p) || typeof s.t !== "number") return null;
  const [lat, lng] = s.p;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return {
    memberId,
    callsign: String(s.cs ?? "").slice(0, 20),
    lat,
    lng,
    heading: typeof s.h === "number" ? s.h : null,
    at: s.t,
    track: decodeTrack(s.tr),
    me,
  };
}

export function useTeam(): TeamValue {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error("useTeam must be used inside TeamProvider");
  return ctx;
}

const NO_POINTS: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

function teamPoints(members: TeamMember[], now: number): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: members
      .filter((m) => !m.me && now - m.at < 30 * 60_000)
      .map((m) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [m.lng, m.lat] },
        properties: { name: m.callsign },
      })),
  };
}
