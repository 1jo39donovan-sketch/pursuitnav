// Team sessions: officers on the same job see each other on the map, and can
// follow the way a colleague drove in.
//
// Everything a member shares (callsign, position, the track they drove) is
// encrypted on the phone with a key that's in the team code and never sent
// here. The server holds only sealed blobs, in memory, under a team ID that is
// a hash of the code: it can't read them, and a restart forgets them all.
// Teams last a week; a member who stops sharing drops off after a day.
//
// Team messages (an address to go to, a caution, a note) are sealed the same
// way. Only a member of the team can post one, only its sender can withdraw
// it, and each is deleted after its time is up: 12 hours at most, whatever
// the phone asks for.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const TEAM_DAYS = 7;
const MEMBER_STALE_MS = 24 * 3600_000;
const MAX_TEAMS = 20_000;
const MAX_MEMBERS = 50;
/** Largest sealed blob a member may store (a track of a few hundred points fits easily). */
export const MAX_BLOB_CHARS = 32_000;

/** The longest a team message is kept, whatever the sender asks. */
export const MESSAGE_MAX_MS = 12 * 3600_000;
/** Largest sealed message (a note of a few hundred characters and a place fit easily). */
export const MAX_MESSAGE_CHARS = 4_000;
/** Messages kept per team at once; the oldest goes first. */
const MAX_MESSAGES = 100;

export interface MessageView {
  id: string;
  /** The member who sent it (their phone's random ID, not who they are). */
  from: string;
  blob: string;
  /** Server time it arrived, and when it's deleted, ms since 1970. */
  at: number;
  expiresAt: number;
}

export interface MemberView {
  memberId: string;
  blob: string;
  /** Server time of the member's last share, ms since 1970. */
  updatedAt: number;
}

interface Member {
  tokenHash: Buffer;
  blob: string;
  updatedAt: number;
}

interface Team {
  expiresAt: number;
  members: Map<string, Member>;
  messages: MessageView[];
}

export class TeamFullError extends Error {}
export class TeamTokenError extends Error {}
export class NoSuchTeamError extends Error {}

const hash = (s: string) => createHash("sha256").update(s).digest();

export class TeamStore {
  private teams = new Map<string, Team>();
  private sweptAt = 0;

  constructor(private readonly now = () => Date.now()) {}

  /**
   * Stores a member's sealed blob. A team is only made when its starter asks
   * (`create`): a code typed wrong, or made up, is refused, rather than
   * quietly starting a team nobody else is in. The first write for a member
   * sets its token; later writes must carry the same one, so nobody else in
   * the team can overwrite you.
   */
  put(teamId: string, memberId: string, token: string, blob: string, create = false): { expiresAt: number } {
    this.sweep();
    let team = this.teams.get(teamId);
    if (!team || team.expiresAt < this.now()) {
      if (!create) throw new NoSuchTeamError("No such team, or it has ended.");
      if (this.teams.size >= MAX_TEAMS) throw new TeamFullError("Too many teams right now.");
      team = { expiresAt: this.now() + TEAM_DAYS * 24 * 3600_000, members: new Map(), messages: [] };
      this.teams.set(teamId, team);
    }
    const existing = team.members.get(memberId);
    const tokenHash = hash(token);
    if (existing) {
      if (!timingSafeEqual(existing.tokenHash, tokenHash)) throw new TeamTokenError("Not your entry.");
    } else if (team.members.size >= MAX_MEMBERS) {
      throw new TeamFullError("This team is full.");
    }
    team.members.set(memberId, { tokenHash, blob, updatedAt: this.now() });
    return { expiresAt: team.expiresAt };
  }

  get(teamId: string): { expiresAt: number; members: MemberView[]; messages: MessageView[] } {
    this.sweep();
    const team = this.live(teamId);
    const now = this.now();
    team.messages = team.messages.filter((m) => m.expiresAt > now);
    return {
      expiresAt: team.expiresAt,
      members: [...team.members]
        .filter(([, m]) => now - m.updatedAt <= MEMBER_STALE_MS)
        .map(([memberId, m]) => ({ memberId, blob: m.blob, updatedAt: m.updatedAt })),
      messages: [...team.messages],
    };
  }

  /**
   * Posts a sealed message from a member (checked by their token). Kept for
   * `keepMs`, never more than MESSAGE_MAX_MS, and never past the team's end.
   */
  postMessage(teamId: string, memberId: string, token: string, blob: string, keepMs = MESSAGE_MAX_MS): MessageView {
    this.sweep();
    const team = this.live(teamId);
    this.checkToken(team, memberId, token);
    const now = this.now();
    const keep = Math.max(60_000, Math.min(MESSAGE_MAX_MS, Number.isFinite(keepMs) ? keepMs : MESSAGE_MAX_MS));
    const message: MessageView = {
      id: randomBytes(12).toString("hex"),
      from: memberId,
      blob,
      at: now,
      expiresAt: Math.min(now + keep, team.expiresAt),
    };
    team.messages = [...team.messages.filter((m) => m.expiresAt > now), message].slice(-MAX_MESSAGES);
    return message;
  }

  /** Withdraws a message: only its sender can. */
  deleteMessage(teamId: string, messageId: string, memberId: string, token: string) {
    const team = this.live(teamId);
    this.checkToken(team, memberId, token);
    const m = team.messages.find((x) => x.id === messageId);
    if (!m) return;
    if (m.from !== memberId) throw new TeamTokenError("Not your message.");
    team.messages = team.messages.filter((x) => x.id !== messageId);
  }

  private live(teamId: string): Team {
    const team = this.teams.get(teamId);
    if (!team || team.expiresAt < this.now()) throw new NoSuchTeamError("No such team, or it has ended.");
    return team;
  }

  /** Only someone in the team (holding their member token) may post or withdraw. */
  private checkToken(team: Team, memberId: string, token: string) {
    const m = team.members.get(memberId);
    if (!m || !timingSafeEqual(m.tokenHash, hash(token))) throw new TeamTokenError("Not in this team.");
  }

  /** Leaves the team: the member's entry is deleted. */
  remove(teamId: string, memberId: string, token: string) {
    const m = this.teams.get(teamId)?.members.get(memberId);
    if (!m) return;
    if (!timingSafeEqual(m.tokenHash, hash(token))) throw new TeamTokenError("Not your entry.");
    this.teams.get(teamId)!.members.delete(memberId);
  }

  private sweep() {
    const now = this.now();
    if (now - this.sweptAt < 60_000) return;
    this.sweptAt = now;
    for (const [id, team] of this.teams) {
      if (team.expiresAt < now) {
        this.teams.delete(id);
        continue;
      }
      for (const [mid, m] of team.members) if (now - m.updatedAt > MEMBER_STALE_MS) team.members.delete(mid);
      team.messages = team.messages.filter((m) => m.expiresAt > now);
    }
  }
}

/** For tests: a random ID in the format the app sends. */
export const randomId = () => randomBytes(16).toString("hex");
