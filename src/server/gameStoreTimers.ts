import { type RoomState, type RoomTimerSettings } from "./gameStoreTypes";

const DEFAULT_MOVE_PHASE_SECONDS = 3 * 60;
const DEFAULT_ACTION_PHASE_SECONDS = 2 * 60;

const movePhaseSeconds = getPositiveEnvNumber("MOVE_PHASE_SECONDS", DEFAULT_MOVE_PHASE_SECONDS);
const actionPhaseSeconds = getPositiveEnvNumber(
  "ACTION_PHASE_SECONDS",
  DEFAULT_ACTION_PHASE_SECONDS
);

export function startPhaseTimer(room: RoomState, durationSeconds: number) {
  const now = Date.now();
  room.phaseStartedAt = now;
  room.phaseDurationSeconds = durationSeconds;
  room.phaseDeadlineAt = now + durationSeconds * 1000;
}

export function clearPhaseTimer(room: RoomState) {
  delete room.phaseStartedAt;
  delete room.phaseDeadlineAt;
  delete room.phaseDurationSeconds;
}

export function getDefaultTimerSettings(): RoomTimerSettings {
  return {
    movePhaseSeconds,
    actionPhaseSeconds,
  };
}

export function getRoomTimerSettings(room: RoomState): RoomTimerSettings {
  return {
    ...getDefaultTimerSettings(),
    ...room.timerSettings,
  };
}

export function sanitizeDurationSeconds(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const durationSeconds = value ?? fallback;
  return Math.min(Math.max(Math.round(durationSeconds), 10), 3 * 60 * 60);
}

function getPositiveEnvNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
