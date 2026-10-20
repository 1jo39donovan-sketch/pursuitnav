// Team sessions: officers on the same job see each other on the map, and can
// follow the way a colleague drove in.
//
// Everything a member shares (callsign, position, the track they drove) is
// encrypted on the phone with a key that's in the team code and never sent
// here. The server holds only sealed blobs, in memory, under a team ID that is
// a hash of the code: it can't read them, and a restart forgets them all.
// Teams last a week; a member who stops sharing drops off after a day.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const TEAM_DAYS = 7;
const MEMBER_STALE_MS = 24 * 3600_000;
const MAX_TEAMS = 20_000;
const MAX_MEMBERS = 50;
/** Largest sealed blob a member may store (a track of a few hundred points fits easily). */
export const MAX_BLOB_CHARS = 32_000;

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
   * Stores a member's sealed blob, creating the team on first use. The first
   * write for a member sets its token; later writes must carry the same one,
   * so nobody else in the team can overwrite you.
   */
  put(teamId: string, memberId: string, token: string, blob: string): { expiresAt: number } {
    this.sweep();
    let team = this.teams.get(teamId);
    if (!team || team.expiresAt < this.now()) {
      if (this.teams.size >= MAX_TEAMS) throw new TeamFullError("Too many teams right now.");
      team = { expiresAt: this.now() + TEAM_DAYS * 24 * 3600_000, members: new Map() };
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

  get(teamId: string): { expiresAt: number; members: MemberView[] } {
    this.sweep();
    const team = this.teams.get(teamId);
    if (!team || team.expiresAt < this.now()) throw new NoSuchTeamError("No such team, or it has ended.");
    return {
      expiresAt: team.expiresAt,
      members: [...team.members]
        .filter(([, m]) => this.now() - m.updatedAt <= MEMBER_STALE_MS)
        .map(([memberId, m]) => ({ memberId, blob: m.blob, updatedAt: m.updatedAt })),
    };
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
    }
  }
}

/** For tests: a random ID in the format the app sends. */
export const randomId = () => randomBytes(16).toString("hex");
