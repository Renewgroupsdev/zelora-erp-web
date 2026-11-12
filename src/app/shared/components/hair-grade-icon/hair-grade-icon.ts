import { Component, computed, input } from '@angular/core';

/**
 * The Norwood (male) and Ludwig (female) hair-loss grade drawings of the printed consultation form: each Norwood
 * grade is the side profile plus the top view of the head, each Ludwig grade the top view. The artwork is cut
 * from the form itself (ink on transparent PNGs in assets/hair-grades). The PNG is used as a mask over the theme's
 * primary colour, so the heads follow the colour picked in Settings.
 */
@Component({
  selector: 'app-hair-grade-icon',
  standalone: true,
  templateUrl: './hair-grade-icon.html',
  styleUrl: './hair-grade-icon.scss',
  host: { '[class.female]': 'female()', '[style.--hg-src]': "src() ? 'url(' + src() + ')' : 'none'" },
})
export class HairGradeIcon {
  readonly grade = input.required<string>();

  /** "Norwood 3A Vertex" -> norwood-3a-vertex, "Grade 2" -> ludwig-2. */
  readonly src = computed(() => {
    const g = this.grade().trim().toLowerCase();
    if (g.startsWith('grade')) return `assets/hair-grades/ludwig-${g.replace('grade', '').trim()}.png`;
    return g.startsWith('norwood') ? `assets/hair-grades/${g.replace(/\s+/g, '-')}.png` : '';
  });
  readonly female = computed(() => this.grade().trim().toLowerCase().startsWith('grade'));
}
