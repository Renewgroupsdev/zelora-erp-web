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
  template: `
    <svg viewBox="0 0 100 110" role="img" [attr.aria-label]="grade() + ' illustration'">
      <defs>
        <clipPath [attr.id]="clipId"><ellipse cx="50" cy="56" rx="37" ry="47" /></clipPath>
      </defs>
      <!-- ears -->
      <ellipse class="skin" cx="13" cy="62" rx="5" ry="9" />
      <ellipse class="skin" cx="87" cy="62" rx="5" ry="9" />
      <!-- nose tip below the forehead -->
      <path class="skin" d="M44 101 Q50 112 56 101 Z" />
      <!-- the head: hair everywhere, then the bald / thinning areas of this grade -->
      <g [attr.clip-path]="'url(#' + clipId + ')'">
        <ellipse class="hair" cx="50" cy="56" rx="37" ry="47" />
        @if (female()) { <line class="part" x1="50" y1="14" x2="50" y2="100" /> }
        @for (p of patches(); track $index) {
          <ellipse class="skin" [attr.cx]="p.cx" [attr.cy]="p.cy" [attr.rx]="p.rx" [attr.ry]="p.ry" [attr.opacity]="p.opacity ?? 1" />
        }
      </g>
      <ellipse class="outline" cx="50" cy="56" rx="37" ry="47" />
    </svg>
  `,
  styles: [`
    :host { display: inline-block; width: 56px; height: 62px; line-height: 0; }
    svg { width: 100%; height: 100%; }
    .hair { fill: var(--hair-grade-hair, var(--primary-dark, #0b4533)); }
    .skin { fill: var(--hair-grade-skin, #f2d6c1); }
    .part { stroke: var(--hair-grade-skin, #f2d6c1); stroke-width: 1.6; }
    .outline { fill: none; stroke: var(--hair-grade-line, #8a6f5c); stroke-width: 1.4; }
  `],
})
export class HairGradeIcon {
  readonly grade = input.required<string>();

  readonly clipId = `hair-grade-clip-${nextId++}`;
  readonly patches = computed(() => PATCHES[this.grade()] ?? []);
  readonly female = computed(() => this.grade().startsWith('Grade'));
}
