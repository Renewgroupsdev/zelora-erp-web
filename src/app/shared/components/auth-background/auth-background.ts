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
    // Wide screens (900px+): the 1680x944 design is stretched to fill the window exactly - width and height scaled
    // separately - so the whole design (picture, card, brand, benefit cards) is always visible at full width, with no
    // scrollbar, whatever the window's shape (e.g. DevTools docked at the bottom). Picture and layout use the same
    // factors, so the glass patch stays behind the card.
    const kx = wide ? window.innerWidth / 1680 : cover;
    const ky = wide ? window.innerHeight / 944 : cover;
    const kc = wide ? Math.min(kx, ky) : cover;
    root.setProperty('--stage-k', String(kc));
    root.setProperty('--stage-kx', String(kx));
    root.setProperty('--stage-ky', String(ky));
    root.setProperty('--stage-y', '0px');
    root.setProperty('--fade-x', '0px');
    root.setProperty('--fade-y', '0px');
    root.setProperty('--stage-w', String(1680 * kx) + 'px');
    root.setProperty('--stage-h', String(944 * ky) + 'px');
    // small screens show only the card: fit it (and its logo badge) inside the window
    // part of the 1680px layout that is visible (the picture is `cover`-cropped); fit the side panels inside it
    const k = kc;
    const visL = Math.max(0, (1680 - window.innerWidth / k) / 2);
    const visR = 1680 - visL;
    const zb = Math.min(0.95, (609 - (visL + 24)) / 340);
    const zf = Math.min(1.16, (visR - 24 - 1075) / 370);
    root.setProperty('--bz', String(zb));
    root.setProperty('--bl', String(Math.max(136, visL + 24) / zb));
    root.setProperty('--bt', String(285 / zb));
    root.setProperty('--fz', String(zf));
    root.setProperty('--fl', String(Math.min(1180, visR - 24 - 370 * zf) / zf));
    root.setProperty('--ft', String(195 / zf));
    document.documentElement.classList.toggle('auth-narrow', zb < 0.55 || zf < 0.55);
    // Below 900px only the card is shown. When the card fits the window at the picture's own (cover) scale - tablets,
    // small laptops, landscape phones - the stage is scaled exactly like the picture, so the glass patch drawn in the
    // picture sits right behind the card (no "ghost box" around it). Otherwise (narrow phones) the card is fitted to the
    // window width and centred on it.
    const w = window.innerWidth;
    const h = window.innerHeight;
    // the card is 450 wide; its logo badge starts at 146 and the tallest content (login card / benefit cards) ends near 900
    const fits = !wide && cover * 450 <= w - 24 && h / cover >= 2 * (472 - 146) && h / cover >= 2 * (900 - 472);
    document.documentElement.classList.toggle('auth-fit', fits);
    if (fits) {
      root.setProperty('--card-kc', String(cover));
      root.setProperty('--card-k', String(cover));
      // the three benefit cards sit in one row under the card: as wide as the visible part of the stage allows
      root.setProperty('--feat-row-w', Math.round(Math.min(640, w / cover - 40)) + 'px');
    } else {
      // compact pages also show the benefit cards under the card, so they need the full 944px height
      root.setProperty('--card-kc', String(Math.min(1, (w - 24) / 450, (h - 8) / 944)));
      root.setProperty('--card-k', String(Math.min(1, (w - 24) / 450, (h - 24) / 690)));
    }
  };

  constructor() {
    this.update();
    window.addEventListener('resize', this.update);
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.update);
  }
}
