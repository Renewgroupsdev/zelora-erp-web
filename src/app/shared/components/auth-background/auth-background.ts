import { Component, Input, OnDestroy } from '@angular/core';

/** Full-page hair and skin care scene. It also publishes --stage-k, the factor that scales the 1680x944
 *  layout used on every screen so that it lines up with the picture exactly (same maths as `cover`). */
@Component({
  selector: 'app-auth-background',
  standalone: true,
  templateUrl: './auth-background.html',
  styleUrl: './auth-background.scss',
})
export class AuthBackground implements OnDestroy {
  /** Splash, 404 and forgot password use a picture whose blurred patch is cut to that page's card height. */
  @Input() variant: '' | 'splash' | 'notfound' | 'forgot' = '';

  private readonly update = () => {
    const root = document.documentElement.style;
    // wide screens (900px+): the picture covers the full width and is anchored at the top, so the clipboard stays whole;
    // the scale is capped so the card (it ends at 830px of the 944px layout) is never cut off at the bottom
    const wide = window.innerWidth >= 900;
    const cover = Math.max(window.innerWidth / 1680, window.innerHeight / 944);
    const kc = wide ? Math.min(cover, window.innerHeight / 830) : cover;
    root.setProperty('--stage-k', String(kc));
    root.setProperty('--fade-x', '0px');
    root.setProperty('--fade-y', kc * 944 < window.innerHeight - 1 ? '40px' : '0px');
    // on ultra-wide screens the picture is stretched a little sideways to reach both edges
    root.setProperty('--stage-w', String(wide ? Math.max(1680 * kc, window.innerWidth) : 1680 * kc) + 'px');
    root.setProperty('--stage-h', String(944 * kc) + 'px');
    // small screens show only the card: fit it (and its logo badge) inside the window
    // part of the 1680px layout that is visible (the picture is `cover`-cropped); fit the side panels inside it
    const k = kc;
    const visL = Math.max(0, (1680 - window.innerWidth / k) / 2);
    const visR = 1680 - visL;
    const zb = Math.min(0.95, (609 - (visL + 24)) / 340);
    const zf = Math.min(1.16, (visR - 24 - 1075) / 330);
    root.setProperty('--bz', String(zb));
    root.setProperty('--bl', String(Math.max(136, visL + 24) / zb));
    root.setProperty('--bt', String(285 / zb));
    root.setProperty('--fz', String(zf));
    root.setProperty('--fl', String(Math.min(1180, visR - 24 - 330 * zf) / zf));
    root.setProperty('--ft', String(195 / zf));
    document.documentElement.classList.toggle('auth-narrow', zb < 0.55 || zf < 0.55);
    // compact pages also show the benefit cards under the card, so they need the full 944px height
    root.setProperty('--card-kc', String(Math.min(1, (window.innerWidth - 24) / 450, (window.innerHeight - 8) / 944)));
    root.setProperty('--card-k', String(Math.min(1, (window.innerWidth - 24) / 450, (window.innerHeight - 24) / 690)));
  };

  constructor() {
    this.update();
    window.addEventListener('resize', this.update);
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.update);
  }
}
