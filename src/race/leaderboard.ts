import type { GhostFrame } from "./ghostRecorder";

const LEGACY_LEADERBOARD_KEY = "neon-ridge.leaderboard";
const LEGACY_GHOST_KEY = "neon-ridge.ghost";
const LEADERBOARD_KEY_PREFIX = "neon-ridge.leaderboard.";
const GHOST_KEY_PREFIX = "neon-ridge.ghost.";
const MAX_ENTRIES = 10;

export interface LeaderboardEntry {
  readonly lapTimeSeconds: number;
  readonly date: string;
}

export function saveGhostFrames(trackId: string, frames: readonly GhostFrame[]): void {
  try {
    localStorage.setItem(`${GHOST_KEY_PREFIX}${trackId}`, JSON.stringify(frames));
  } catch {
    // localStorage full — skip
  }
}

export function loadGhostFrames(trackId: string): readonly GhostFrame[] | null {
  try {
    const raw = localStorage.getItem(`${GHOST_KEY_PREFIX}${trackId}`)
      ?? (trackId === "neon-ridge" ? localStorage.getItem(LEGACY_GHOST_KEY) : null);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const frames = parsed.filter(isGhostFrame);
    return frames.length >= 2 ? frames : null;
  } catch {
    return null;
  }
}

export function saveLeaderboardEntry(trackId: string, lapTimeSeconds: number): void {
  const entries = loadLeaderboard(trackId);
  entries.push({ lapTimeSeconds, date: new Date().toLocaleDateString() });
  entries.sort((a, b) => a.lapTimeSeconds - b.lapTimeSeconds);
  const trimmed = entries.slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(`${LEADERBOARD_KEY_PREFIX}${trackId}`, JSON.stringify(trimmed));
  } catch {
    // skip
  }
}

export function loadLeaderboard(trackId: string): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(`${LEADERBOARD_KEY_PREFIX}${trackId}`)
      ?? (trackId === "neon-ridge" ? localStorage.getItem(LEGACY_LEADERBOARD_KEY) : null);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isLeaderboardEntry) : [];
  } catch {
    return [];
  }
}

function isLeaderboardEntry(value: unknown): value is LeaderboardEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<LeaderboardEntry>;
  return typeof entry.lapTimeSeconds === "number"
    && Number.isFinite(entry.lapTimeSeconds)
    && typeof entry.date === "string";
}

function isGhostFrame(value: unknown): value is GhostFrame {
  if (typeof value !== "object" || value === null) return false;
  const frame = value as Partial<GhostFrame>;
  return typeof frame.x === "number" && Number.isFinite(frame.x)
    && typeof frame.y === "number" && Number.isFinite(frame.y)
    && typeof frame.z === "number" && Number.isFinite(frame.z)
    && typeof frame.heading === "number" && Number.isFinite(frame.heading)
    && typeof frame.t === "number" && Number.isFinite(frame.t);
}
