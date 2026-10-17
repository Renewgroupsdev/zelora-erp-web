import { Component, computed, input } from '@angular/core';

/** One bald / thinning area on the top-view head, in the 100 x 110 viewBox (face at the bottom, crown above centre). */
interface Patch {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Thinning (female pattern) is drawn partly see-through; bald areas are solid. */
  opacity?: number;
}

/**
 * Top-view head drawings for the Norwood (male) and Ludwig (female) hair-loss grades, like the
 * printed consultation form: hair in the theme colour, the bald / thinning areas in skin tone.
 * Pure inline SVG - no image files.
 */
const PATCHES: Record<string, Patch[]> = {
  // Norwood: temples recede first, then the front, a crown (vertex) spot opens, the bridge between them thins and goes.
  'Norwood 2': [{ cx: 33, cy: 97, rx: 8, ry: 7 }, { cx: 67, cy: 97, rx: 8, ry: 7 }],
  'Norwood 2A': [{ cx: 50, cy: 100, rx: 24, ry: 9 }, { cx: 33, cy: 96, rx: 8, ry: 8 }, { cx: 67, cy: 96, rx: 8, ry: 8 }],
  'Norwood 3': [{ cx: 32, cy: 91, rx: 10, ry: 13 }, { cx: 68, cy: 91, rx: 10, ry: 13 }, { cx: 50, cy: 101, rx: 18, ry: 6 }],
  'Norwood 3A': [{ cx: 50, cy: 95, rx: 29, ry: 15 }],
  'Norwood 3A Vertex': [{ cx: 32, cy: 91, rx: 10, ry: 13 }, { cx: 68, cy: 91, rx: 10, ry: 13 }, { cx: 50, cy: 101, rx: 18, ry: 6 }, { cx: 50, cy: 42, rx: 8, ry: 8 }],
  'Norwood 4': [{ cx: 50, cy: 92, rx: 27, ry: 18 }, { cx: 50, cy: 40, rx: 11, ry: 11 }],
  'Norwood 4A': [{ cx: 50, cy: 85, rx: 29, ry: 25 }],
  'Norwood 5': [{ cx: 50, cy: 88, rx: 29, ry: 22 }, { cx: 50, cy: 40, rx: 15, ry: 15 }],
  'Norwood 5A': [{ cx: 50, cy: 72, rx: 27, ry: 35 }],
  'Norwood 6': [{ cx: 50, cy: 64, rx: 31, ry: 42 }],
  // Ludwig: thinning widens out from the centre parting while the front hairline stays.
  'Grade 1': [{ cx: 50, cy: 58, rx: 8, ry: 30, opacity: 0.55 }],
  'Grade 2': [{ cx: 50, cy: 57, rx: 16, ry: 33, opacity: 0.75 }],
  'Grade 3': [{ cx: 50, cy: 56, rx: 24, ry: 37, opacity: 0.95 }],
};

let nextId = 0;

@Component({
  selector: 'app-hair-grade-icon',
  standalone: true,
  templateUrl: './hair-grade-icon.html',
  styleUrl: './hair-grade-icon.scss',
})
export class HairGradeIcon {
  readonly grade = input.required<string>();

  readonly clipId = `hair-grade-clip-${nextId++}`;
  readonly patches = computed(() => PATCHES[this.grade()] ?? []);
  readonly female = computed(() => this.grade().startsWith('Grade'));
}
