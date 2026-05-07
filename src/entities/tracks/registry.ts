import { loadLeaderboard } from "../../race/leaderboard";
import type { TrackConfig } from "../../types";
import { canyonRunConfig } from "./canyonRun";
import { neonRidgeConfig } from "./neonRidge";

export const TRACK_SELECTION_KEY = "neon-ridge.selected-track";

export const TRACK_CONFIGS: readonly TrackConfig[] = [
  neonRidgeConfig,
  canyonRunConfig,
];

export function getTrackConfig(trackId: string | null): TrackConfig | null {
  if (!trackId) return null;
  return TRACK_CONFIGS.find((track) => track.id === trackId) ?? null;
}

export function isTrackUnlocked(track: TrackConfig): boolean {
  if (track.unlockCondition === "always") return true;
  return loadLeaderboard(neonRidgeConfig.id).length > 0;
}

export function resolveTrackConfig(trackId: string | null): TrackConfig {
  const selected = getTrackConfig(trackId);
  if (selected && isTrackUnlocked(selected)) return selected;
  return neonRidgeConfig;
}

export function readSelectedTrackId(): string | null {
  return localStorage.getItem(TRACK_SELECTION_KEY);
}

export function writeSelectedTrackId(trackId: string): void {
  if (trackId === neonRidgeConfig.id) {
    localStorage.removeItem(TRACK_SELECTION_KEY);
    return;
  }
  localStorage.setItem(TRACK_SELECTION_KEY, trackId);
}
