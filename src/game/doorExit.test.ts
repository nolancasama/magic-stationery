import { describe, expect, it } from "vitest";
import { updateDoorExit } from "./doorExit.ts";

describe("door exit", () => {
  it("opens on approach and stays open until the player walks away", () => {
    expect(updateDoorExit("ready", 0.91, true)).toBe("ready");
    const open = updateDoorExit("ready", 0.9, true);
    expect(open).toBe("open");
    expect(updateDoorExit(open, 0.8, true)).toBe(open);
    expect(updateDoorExit(open, 1.4, true)).toBe(open);
    expect(updateDoorExit(open, 1.61, true)).toBe("ready");
  });

  it("keeps No dismissed until the player leaves the wider radius and returns", () => {
    const dismissed = updateDoorExit("open", 0.8, true, "dismiss");
    expect(dismissed).toBe("dismissed");
    expect(updateDoorExit(dismissed, 0.8, true)).toBe(dismissed);
    expect(updateDoorExit(dismissed, 0.8, true, "click")).toBe(dismissed);
    expect(updateDoorExit(dismissed, 1.6, true)).toBe(dismissed);
    const ready = updateDoorExit(dismissed, 1.61, true);
    expect(ready).toBe("ready");
    expect(updateDoorExit(ready, 0.9, true)).toBe("open");
  });

  it("accepts a click from slightly farther away than a walk-up", () => {
    expect(updateDoorExit("ready", 1.2, true, "click")).toBe("open");
    expect(updateDoorExit("ready", 1.21, true, "click")).toBe("ready");
  });

  it("blocks both triggers when drawing, asking, or locked by a script", () => {
    // All three locks enter the state machine through its enabled flag.
    expect(updateDoorExit("ready", 0.8, false)).toBe("ready");
    expect(updateDoorExit("ready", 0.8, false, "click")).toBe("ready");
    expect(updateDoorExit("open", 0.8, false)).toBe("ready");
    expect(updateDoorExit("dismissed", 0.8, false)).toBe("dismissed");
  });
});
