export type DoorExitState = "ready" | "open" | "dismissed";

export const DOOR_CLICK_DISTANCE = 1.2;
const APPROACH_DISTANCE = 0.9;
const RESET_DISTANCE = 1.6;

/** A dismissal survives temporary input locks and clears only after walking away. */
export function updateDoorExit(
  state: DoorExitState,
  distance: number,
  enabled: boolean,
  action: "approach" | "click" | "dismiss" = "approach"
): DoorExitState {
  if (distance > RESET_DISTANCE) return "ready";
  if (state === "dismissed") return state;
  if (!enabled) return "ready";
  if (action === "dismiss") return "dismissed";
  const threshold = action === "click" ? DOOR_CLICK_DISTANCE : APPROACH_DISTANCE;
  return distance <= threshold ? "open" : state;
}
