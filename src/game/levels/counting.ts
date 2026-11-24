interface Counting {
  readonly count: number;
  readonly want: number;
  readonly idleHints: number;
  readonly phase: "counting" | "speaking" | "done";
}

type Event = "pick" | "idle" | "ready" | "answer";

export function startCounting(want: number): Counting {
  return { count: 0, want, idleHints: 0, phase: "counting" };
}

export function updateCounting(state: Counting, event: Event): Counting {
  if (state.phase === "counting") {
    if (event === "pick" && state.count < state.want) {
      return { ...state, count: state.count + 1, idleHints: 0 };
    }
    if (event === "idle") return { ...state, idleHints: state.idleHints + 1 };
    if (event === "ready" && state.count === state.want) return { ...state, phase: "speaking" };
  }
  if (state.phase === "speaking" && event === "answer") return { ...state, phase: "done" };
  return state;
}
