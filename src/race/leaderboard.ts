const LEADERBOARD_KEY = "neon-ridge.leaderboard";
const GHOST_KEY = "neon-ridge.ghost";
const MAX_ENTRIES = 10;

export interface LeaderboardEntry {
  readonly lapTimeSeconds: number;
  readonly date: string;
}

export function saveGhostFrames(frames: readonly import("./ghostRecorder").GhostFrame[]): void {
  try {
    localStorage.setItem(GHOST_KEY, JSON.stringify(frames));
  } catch {
    // localStorage full — skip
  }
}

export function loadGhostFrames(): readonly import("./ghostRecorder").GhostFrame[] | null {
  try {
    const raw = localStorage.getItem(GHOST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveLeaderboardEntry(lapTimeSeconds: number): void {
  const entries = loadLeaderboard();
  entries.push({ lapTimeSeconds, date: new Date().toLocaleDateString() });
  entries.sort((a, b) => a.lapTimeSeconds - b.lapTimeSeconds);
  const trimmed = entries.slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(trimmed));
  } catch {
    // skip
  }
}

export function loadLeaderboard(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
