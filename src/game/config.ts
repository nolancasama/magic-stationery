/**
 * Art mode. "drawing" (default): the child's own drawing is the object in the
 * world (recognition only decides how it moves). "models": the original
 * premade 3D models, kept intact and switchable (e.g. ?models=1).
 */
export type ArtMode = "drawing" | "models";

export function artMode(): ArtMode {
  if (typeof window === "undefined") return "drawing";
  return new URLSearchParams(window.location.search).has("models") ? "models" : "drawing";
}
