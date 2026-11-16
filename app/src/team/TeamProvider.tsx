// Team sessions: everyone on the job shares where they are, and the way they
// drove there, with the rest of the team, while BlueRoute is open.
//
// Shares are sealed on this phone with the team code's key (team/crypto.ts),
// so the server can't read them. The team code, member ID and token are kept
// in settings so a team survives the app being closed; the track is only ever
// in memory.
import { getRandomBytes } from "expo-crypto";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { deleteMember, deleteMessage, getMembers, NoTeamError, postMessage, putMember } from "../api/teams";
import { useLocation } from "../location/LocationProvider";
import { useNavigation } from "../navigation/NavigationProvider";
import { say } from "../navigation/speaker";
import { BOROUGHS } from "../search/boroughs";
import { useSearch } from "../search/SearchProvider";
import { useSession } from "../session/SessionProvider";
import { store } from "../storage/store";
import { codeIn, formatCode, newTeamCode, normaliseCode, open, randomHex, seal, teamKeys } from "./crypto";
import {
  cautionsNear,
  MAX_TEXT,
  MESSAGE_KEEP_MS,
  spokenArrival,
  toMessage,
  type MessageBody,
  type MessageKind,
  type MessagePlace,
  type TeamMessage,
} from "./messages";
import { atPoliceStation, shareDecision, type SharePolicy } from "./sharePolicy";
import { addFix, decodeTrack, encodeTrack, type TrackPoint } from "./track";

export interface TeamMember {
  memberId: string;
  callsign: string;
  lat: number;
  lng: number;
  heading: number | null;
  /** When their phone took this position, ms since 1970. */
  at: number;
  /** How far off their position may be, in metres; null if their app doesn't say. */
  accuracy: number | null;
  /** Where they've driven lately, oldest first, ending where they are. */
  track: { lat: number; lng: number }[];
  me: boolean;
}

export interface TeamContact {
  memberId: string;
  callsign: string;
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
  /** Whether this phone is sharing its position now, and why (or why not), for the crew to see. */
  sharing: { share: boolean; why: string };
  /** When to share (Session). */
  policy: SharePolicy;
  setPolicy: (p: SharePolicy) => void;
  /** Shares only while navigating, and less often. */
  batterySaver: boolean;
  setBatterySaver: (on: boolean) => void;
  /** Shares even at a police station (off by default). */
  shareAtPolice: boolean;
  setShareAtPolice: (on: boolean) => void;
  /** Everyone in the team, sharing their position or not (a desk member), to address messages to. */
  contacts: { memberId: string; callsign: string; me: boolean }[];
  /** Team messages this phone can see (sent to everyone, to it, or by it), newest first. */
  messages: TeamMessage[];
  /** Messages from colleagues not yet put away, newest first. */
  unread: TeamMessage[];
  /** Sends a message; throws (with a message for the crew) if it isn't sent. */
  send: (m: { kind: MessageKind; to: TeamContact | null; text: string; place?: MessagePlace }) => Promise<void>;
  /** Withdraws a message this phone sent. */
  withdraw: (id: string) => Promise<void>;
  /** Puts a message away (it stays in the list on Session until it runs out). */
  dismiss: (id: string) => void;
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
  /** Accuracy in metres (newer apps). */
  a?: number;
}

/** Not sharing: no position (so any app, old or new, leaves this member off the map). */
interface Hidden {
  v: 1;
  cs: string;
  t: number;
  hidden: true;
}

/** Standing still, a share is sent at most this often (moving: every 15 s). */
const STILL_SHARE_MS = 60_000;
/** Moved less than this since the last share: standing still. */
const STILL_M = 25;

const TeamContext = createContext<TeamValue | null>(null);

export function TeamProvider({ children }: { children: ReactNode }) {
  const { callsign, voice } = useSession();
  const { fix } = useLocation();
  const { active, lastDestination } = useNavigation();
  const { data, places } = useSearch();

  // When to share, kept on the phone.
  const [policy, setPolicyState] = useState<SharePolicy>(() => {
    const p = store.getSetting("teamShare");
    return p === "navigating" || p === "arrived" || p === "never" ? p : "always";
  });
  const [batterySaver, setBatterySaverState] = useState(() => store.getSetting("batterySaver") === "1");
  const [shareAtPolice, setShareAtPoliceState] = useState(() => store.getSetting("teamShareAtPolice") === "1");
  const setPolicy = useCallback((p: SharePolicy) => {
    setPolicyState(p);
    store.setSetting("teamShare", p);
  }, []);
  const setBatterySaver = useCallback((on: boolean) => {
    setBatterySaverState(on);
    store.setSetting("batterySaver", on ? "1" : "");
  }, []);
  const setShareAtPolice = useCallback((on: boolean) => {
    setShareAtPoliceState(on);
    store.setSetting("teamShareAtPolice", on ? "1" : "");
  }, []);

  // Police stations from OpenStreetMap (public: amenity=police, in the weekly
  // places list). Inside one, by default, this phone isn't shown to the team.
  const stations = useMemo(
    () =>
      data.status === "ready" && places.status === "ready"
        ? data.index
            .pointsOfInterestIn(new Set(BOROUGHS), new Set(["emergency"]))
            .filter((p) => p.type === "Police station")
        : [],
    // The places list arrives after the roads.
    [data, places.status],
  );
  const [atPolice, setAtPolice] = useState(false);
  const [atPoliceFixAt, setAtPoliceFixAt] = useState(0);
  if (fix && fix.timestamp !== atPoliceFixAt) {
    setAtPoliceFixAt(fix.timestamp);
    const now = atPoliceStation(atPolice, fix, stations);
    if (now !== atPolice) setAtPolice(now);
  }
  const sharing = shareDecision({
    policy,
    batterySaver,
    shareAtPolice,
    atPolice,
    navigating: active != null,
    destination: active?.destination ?? lastDestination,
    fix,
  });
  const [code, setCode] = useState(() => normaliseCode(store.getSetting("teamCode") ?? ""));
  const [status, setStatus] = useState<TeamStatus>(code ? "connecting" : "off");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [mapPoints, setMapPoints] = useState<GeoJSON.FeatureCollection>(NO_POINTS);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [contacts, setContacts] = useState<TeamContact[]>([]);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  // Messages already announced, and cautions already warned of nearby (this launch).
  const announced = useRef(new Set<string>());
  const warned = useRef(new Set<string>());
  // A share-and-refresh now (after sending), set by the polling effect.
  const refreshNow = useRef<() => void>(() => {});

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
  const latest = useRef({ fix, callsign, share: sharing.share, slow: batterySaver, voice });
  useEffect(() => {
    latest.current = { fix, callsign, share: sharing.share, slow: batterySaver, voice };
  }, [fix, callsign, sharing.share, batterySaver, voice]);

  // Arriving at a police station: the drive there is forgotten, so following
  // it in can't lead a colleague to whoever is inside.
  useEffect(() => {
    if (atPolice && !shareAtPolice) track.current = [];
  }, [atPolice, shareAtPolice]);

  // Record the drive while in a team and sharing, so colleagues can follow you in.
  useEffect(() => {
    if (code && fix && sharing.share)
      track.current = addFix(track.current, {
        lat: fix.lat,
        lng: fix.lng,
        at: fix.timestamp,
      });
  }, [code, fix, sharing.share]);

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
    setMessages([]);
    setContacts([]);
    setDismissed(new Set());
    announced.current = new Set();
    warned.current = new Set();
    setExpiresAt(null);
    setStatus("connecting");
    setCode(normalised);
  }, []);

  const create = useCallback(() => enter(normaliseCode(newTeamCode(random))!, true), [enter]);
  const join = useCallback(
    (typed: string) => {
      const normalised = codeIn(typed);
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
    setMessages([]);
    setDismissed(new Set());
    setExpiresAt(null);
    setStatus("off");
    setCode(null);
  }, [code]);

  // Share and refresh every 15 seconds while the app is open.
  useEffect(() => {
    if (!code) return;
    const { teamId, key } = teamKeys(code);
    let stopped = false;
    // The last share sent, to send less often standing still (battery).
    let last: { at: number; lat: number; lng: number; hidden: boolean } | null = null;
    const tick = async () => {
      const { fix: f, callsign: cs, share, slow, voice: speak } = latest.current;
      const now = Date.now();
      try {
        if (!f || !share) {
          // Not sharing (or no position, as on a desk computer): say so once,
          // taking this phone off colleagues' maps, then now and then to stay
          // in the team, so it can still send and receive messages.
          if (!last?.hidden || now - last.at >= STILL_SHARE_MS) {
            const hidden: Hidden = { v: 1, cs: cs || "No callsign", t: now, hidden: true };
            await putMember(teamId, me.current.memberId, me.current.token, seal(key, hidden, random), starter.current);
            last = { at: now, lat: f?.lat ?? 0, lng: f?.lng ?? 0, hidden: true };
          }
        } else {
          const still =
            last && !last.hidden && Math.hypot((f.lat - last.lat) * 111_320, (f.lng - last.lng) * 69_000) < STILL_M;
          const every = slow || still ? STILL_SHARE_MS : SHARE_EVERY_MS;
          if (last && !last.hidden && now - last.at < every - 1000) {
            // Nothing new worth sending yet.
          } else {
            last = { at: now, lat: f.lat, lng: f.lng, hidden: false };
            const shared: Shared = {
              v: 1,
              cs: cs || "No callsign",
              p: [f.lat, f.lng],
              h: f.course,
              t: f.timestamp,
              tr: encodeTrack(track.current),
              ...(f.accuracy != null ? { a: Math.round(f.accuracy) } : {}),
            };
            await putMember(teamId, me.current.memberId, me.current.token, seal(key, shared, random), starter.current);
          }
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
        setContacts(
          team.members
            .map((m) => {
              const raw = open(key, m.blob) as { cs?: unknown } | null;
              return raw && typeof raw.cs === "string"
                ? { memberId: m.memberId, callsign: raw.cs.slice(0, 20), me: m.memberId === me.current.memberId }
                : null;
            })
            .filter((c): c is TeamContact => c !== null),
        );
        const msgs = team.messages
          .map((m) => toMessage(m, open(key, m.blob), me.current.memberId, Date.now()))
          .filter((m): m is TeamMessage => m !== null)
          .sort((a, b) => b.at - a.at);
        // Said aloud as it arrives (newest only if several came at once);
        // what was there when the team was joined is shown, not read out.
        const fresh = msgs.filter((m) => !m.mine && !announced.current.has(m.id));
        if (seen.current && speak && fresh[0]) say(spokenArrival(fresh[0]), fresh[0].kind === "caution" ? "urgent" : "normal");
        msgs.forEach((m) => announced.current.add(m.id));
        setMessages(msgs);
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
    refreshNow.current = () => void tick();
    const timer = setInterval(() => void tick(), SHARE_EVERY_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [code]);

  // A colleague's caution nearby: said again (and shown again), once a launch.
  useEffect(() => {
    if (!fix) return;
    const near = cautionsNear(messages, fix).filter((m) => !warned.current.has(m.id));
    if (!near.length) return;
    near.forEach((m) => warned.current.add(m.id));
    if (voice) say(`Caution near here. ${near[0]!.text || near[0]!.place?.label || ""}`.trim(), "urgent");
    setDismissed((d) => new Set([...d].filter((id) => !near.some((m) => m.id === id))));
  }, [fix, messages, voice]);

  const send = useCallback(
    async ({ kind, to, text, place }: { kind: MessageKind; to: TeamContact | null; text: string; place?: MessagePlace }) => {
      if (!code) throw new Error("Not in a team.");
      // Messages go out under the sender's own callsign: none, no message.
      const cs = latest.current.callsign.trim();
      if (!cs) throw new Error("Put your callsign in first, so the team knows who it's from.");
      const { teamId, key } = teamKeys(code);
      const body: MessageBody = {
        v: 1,
        kind,
        cs,
        to: to?.memberId ?? null,
        ...(to ? { toCs: to.callsign } : {}),
        text: text.trim().slice(0, MAX_TEXT),
        ...(place ? { place } : {}),
      };
      await postMessage(teamId, me.current.memberId, me.current.token, seal(key, body, random), MESSAGE_KEEP_MS);
      refreshNow.current();
    },
    [code],
  );
  const withdraw = useCallback(
    async (id: string) => {
      if (!code) return;
      await deleteMessage(teamKeys(code).teamId, id, me.current.memberId, me.current.token);
      setMessages((list) => list.filter((m) => m.id !== id));
    },
    [code],
  );
  const dismiss = useCallback((id: string) => setDismissed((d) => new Set(d).add(id)), []);
  const unread = useMemo(() => messages.filter((m) => !m.mine && !dismissed.has(m.id)), [messages, dismissed]);
  // Colleagues' cautions on the maps too, in amber.
  const pointsWithCautions = useMemo(
    () => ({ ...mapPoints, features: [...mapPoints.features, ...cautionPoints(messages)] }),
    [mapPoints, messages],
  );

  const value = useMemo(
    () => ({
      code: code ? formatCode(code) : null,
      sharing: { share: sharing.share, why: sharing.why },
      policy,
      setPolicy,
      batterySaver,
      setBatterySaver,
      shareAtPolice,
      setShareAtPolice,
      status,
      members,
      expiresAt,
      mapPoints: pointsWithCautions,
      contacts,
      messages,
      unread,
      send,
      withdraw,
      dismiss,
      create,
      join,
      leave,
    }),
    [
      contacts,
      pointsWithCautions,
      messages,
      unread,
      send,
      withdraw,
      dismiss,
      code,
      status,
      members,
      expiresAt,
      create,
      join,
      leave,
      sharing.share,
      sharing.why,
      policy,
      setPolicy,
      batterySaver,
      setBatterySaver,
      shareAtPolice,
      setShareAtPolice,
    ],
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
    accuracy: typeof s.a === "number" ? s.a : null,
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
        // A rough position says so on the map, and is drawn faint.
        properties: {
          id: m.memberId,
          name: roughFix(m.accuracy) ? `${m.callsign} ${accuracyText(m.accuracy!)}` : m.callsign,
          rough: roughFix(m.accuracy),
        },
      })),
  };
}

/** Cautions as amber points on the maps, labelled with their note. */
function cautionPoints(messages: readonly TeamMessage[]): GeoJSON.Feature[] {
  return messages
    .filter((m) => m.kind === "caution" && m.place)
    .map((m) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [m.place!.lng, m.place!.lat] },
      properties: { id: `msg:${m.id}`, name: `⚠ ${(m.text || "Caution").slice(0, 28)}`, caution: true },
    }));
}

/** Further off than this, a colleague's position is shown as rough. */
const ROUGH_M = 250;
export const roughFix = (accuracy: number | null) => accuracy != null && accuracy > ROUGH_M;

/** "±40 m", "±13 km". */
export function accuracyText(m: number): string {
  return m < 1000 ? `±${Math.round(m)} m` : `±${Math.round(m / 1000)} km`;
}
