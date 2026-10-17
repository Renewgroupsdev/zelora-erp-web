import { Component, effect, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TopNavbar } from '../top-navbar/top-navbar';
import { LeftSideNavbar } from '../left-side-navbar/left-side-navbar';
import { NavLayoutService } from '../services/nav-layout.service';
import { BranchContextService } from '../shared/common-services/branch-context.service';
import { TelephonyDock } from '../features/call-center/telephony-dock/telephony-dock';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, TopNavbar, LeftSideNavbar, TelephonyDock],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
})
export class Layout {
  private readonly branchContext = inject(BranchContextService);

  /** Flips off and on when the header branch / franchise filter changes, so the open page is re-created and refetches. */
  readonly showPage = signal(true);

  constructor(public navLayout: NavLayoutService) {
    let last: string | null = null;
    effect(() => {
      const key = this.branchContext.key();
      if (last === null || last === key) { last = key; return; }
      last = key;
      this.showPage.set(false);
      setTimeout(() => this.showPage.set(true));
    });
  }
}
