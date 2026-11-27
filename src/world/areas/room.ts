/**
 * What every level room (the shop, the classroom, ...) offers the game
 * controller: a diorama scene with a walkable floor, display slots the child
 * restores by drawing, a door on the right wall, and a restoration level.
 */
import * as THREE from "three";
import type { Made } from "../../objects/made.ts";
import type { WordId } from "../../recognition/vocab.ts";
import type { NavMap, Rect } from "../nav.ts";

export interface Anchor {
  p: THREE.Vector3;
  r: THREE.Euler;
  /** Display scale (small things are shown a little bigger so they read from the camera). */
  s?: number;
}

export interface View {
  pos: THREE.Vector3;
  look: THREE.Vector3;
}

/** Something the child clicks to work on (a display slot, a clock number, a letter card). */
export interface Spot {
  id: string;
  hotspot: THREE.Mesh;
  /** Where the objective star floats. */
  marker: THREE.Vector3;
  /** Where the player stands to draw for it. */
  stand: { x: number; z: number };
  view: View;
}

/** A display the child restores by drawing one thing; the magic fills its other anchors. */
export interface Slot extends Spot {
  word: WordId;
  anchors: Anchor[];
  ghosts: THREE.Object3D[];
  items: Made[];
}

/** A spot that is not a slot: where the player faces when standing there. */
export interface WriteSpot extends Spot {
  face: THREE.Vector3;
}

/** People come in through a door in the right (+x) wall. */
export interface Door {
  x: number;
  z: number;
  outsideX: number;
}

/** Where a character gets back onto the nav map after crossing the threshold. */
export function doorInsideX(door: Door): number {
  return door.x - 0.7;
}

/** Pick the opening even while the leaf is swung or slid out of the way. */
export function createDoorHotspot() {
  return new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 2.5, 1.4),
    new THREE.MeshBasicMaterial({ visible: false })
  );
}

/** Place the shared hotspot in the right wall, above the door's nav point. */
export function positionDoorHotspot(hotspot: THREE.Mesh, door: Door): THREE.Vector3 {
  hotspot.position.set(door.x + 0.35, 1.25, door.z);
  hotspot.updateMatrixWorld(true);
  return hotspot.position.clone().setY(2.6);
}

export interface RoomArea {
  readonly scene: THREE.Scene;
  readonly nav: NavMap;
  readonly slots: Record<string, Slot>;
  /** Other clickable spots (writing places in the classroom). */
  readonly spots: Record<string, WriteSpot>;
  readonly floor: THREE.Mesh;
  /** Walls and furniture (for camera line-of-sight checks). */
  readonly solids: THREE.Object3D[];
  readonly bounds: Rect;
  readonly door: Door;
  readonly views: { overview: View; door: View } & Record<string, View>;
  readonly follow?: { up: number; back: number; lookUp: number; lookAhead: number; look: Rect };
  /** Where the room's host (Ms. Penny, Ms. Mori) stands. */
  readonly hostSpot: { x: number; z: number; facing: number };
  /** Places people wander to when the room is alive: x, z, slot they look at. */
  readonly ambientSpots: [number, number, string | null][];
  /** Everything the child can click (slot hotspots and more). */
  readonly pickables: THREE.Object3D[];
  /** 0..1 restoration of the room's own decor. */
  setLevel(level: number): void;
  update(t: number): void;
  /** Open or close the door (0 = shut, 1 = open). */
  setDoor(open: number): void;
}
