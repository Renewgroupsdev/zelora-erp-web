import { CommonModule } from '@angular/common';
import { Component, DestroyRef, ElementRef, HostListener, afterNextRender, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { ModuleActivity } from '../shared/components/module-activity/module-activity';
import { currentModule } from '../shared/utils/current-module.util';
import { MatDialog } from '@angular/material/dialog';
import { NavLayoutService } from '../services/nav-layout.service';
import { AppNotification, NotificationService } from '../shared/common-services/notification.service';
import { AuthService } from '../core/auth/auth.service';
import { roleLabel } from '../core/auth/auth.model';
import { BranchContextService, ScopeType } from '../shared/common-services/branch-context.service';
import { BranchOptionsService } from '../shared/common-services/branch-options.service';
import { BranchChat } from '../shared/components/branch-chat/branch-chat';
import { DiscountRequestsService } from '../shared/common-services/discount-requests.service';
import { AbsentTelecallersService } from '../shared/common-services/absent-telecallers.service';
import { openAssignCaller } from '../shared/components/lead-dialogs/assign-caller-dialog';
import { DiscountReviewDialog } from '../shared/components/discount-review-dialog/discount-review-dialog';

interface ScopeTypeInfo {
  value: ScopeType;
  label: string;
  plural: string;
  icon: string;
  hint: string;
}

@Component({
  selector: 'app-top-navbar',
  standalone: true,
  imports: [CommonModule, BranchChat, ModuleActivity],
  templateUrl: './top-navbar.html',
  styleUrl: './top-navbar.scss',
})
export class TopNavbar {
  private readonly authService = inject(AuthService);

  readonly branchContext = inject(BranchContextService);
  readonly branchOptions = inject(BranchOptionsService);

  readonly currentUser = this.authService.currentUser;

  private readonly navRouter = inject(Router);
  private readonly routeUrl = toSignal(this.navRouter.events.pipe(filter(e => e instanceof NavigationEnd), map(() => this.navRouter.url)), { initialValue: this.navRouter.url });

  /** The module of the page being viewed, for the "Activity" button (roles without view-module-activity never see it). */
  readonly activityModule = computed(() =>
    this.authService.hasActionAccess('view-module-activity') ? currentModule(this.authService.menus(), this.routeUrl()) : null);
  readonly activityOpen = signal(false);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Publishes the live header height (it is two rows on phones) so the mobile sidebar and dropdowns sit right below it. */
  private readonly trackHeight = (() => {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const bar = this.host.nativeElement.querySelector('.top-navbar') as HTMLElement | null;
      if (!bar || typeof ResizeObserver === 'undefined') return;
      const publish = () => document.documentElement.style.setProperty('--topnavbar-height', bar.offsetHeight + 'px');
      const observer = new ResizeObserver(publish);
      observer.observe(bar);
      publish();
      destroyRef.onDestroy(() => observer.disconnect());
    });
  })();

  /** Units offered by the second header dropdown for the picked type. */
  readonly scopeUnits = computed(() => {
    const type = this.branchContext.selection().type;
    return type === 'branch' ? this.branchOptions.branches() : type === 'franchise' ? this.branchOptions.franchises() : [];
  });

  readonly scopeTypes: ScopeTypeInfo[] = [
    { value: 'all', label: 'All', plural: 'All', icon: 'bi-globe2', hint: 'Every branch and franchise' },
    { value: 'branch', label: 'Branch', plural: 'Branches', icon: 'bi-diagram-3', hint: 'Company-owned branches' },
    { value: 'franchise', label: 'Franchise', plural: 'Franchises', icon: 'bi-shop', hint: 'Franchise partner outlets' },
  ];

  /**
   * Choices of the first header dropdown. A login with every-unit access gets all three; a login with several own
   * branches / franchises only the types it has, and "All" means all of its own.
   */
  readonly availableScopeTypes = computed<ScopeTypeInfo[]>(() => {
    if (this.branchContext.allAccess()) return this.scopeTypes;
    const has = { branch: this.branchOptions.branches().length > 0, franchise: this.branchOptions.franchises().length > 0 };
    return this.scopeTypes
      .filter(t => t.value === 'all' || has[t.value as 'branch' | 'franchise'])
      .map(t => (t.value === 'all' ? { ...t, hint: 'All your branches and franchises' } : t));
  });

  /** Which header filter menu is open. */
  readonly scopeMenu = signal<'type' | 'unit' | null>(null);
  readonly scopeSearch = signal('');

  readonly filteredScopeUnits = computed(() => {
    const term = this.scopeSearch().trim().toLowerCase();
    const units = this.scopeUnits();
    return term ? units.filter(u => u.shortName.toLowerCase().includes(term) || u.code.toLowerCase().includes(term)) : units;
  });

  readonly scopeUnitLabel = computed(() => {
    const s = this.branchContext.selection();
    if (s.id === null) return `All ${this.scopeTypeInfo(s.type).plural}`;
    return this.branchOptions.byRef(s.type, s.id)?.shortName ?? this.scopeTypeInfo(s.type).label;
  });

  scopeTypeInfo(type: ScopeType): ScopeTypeInfo {
    return this.scopeTypes.find(t => t.value === type) ?? this.scopeTypes[0];
  }

  toggleScopeMenu(menu: 'type' | 'unit'): void {
    this.scopeSearch.set('');
    this.scopeMenu.update(open => (open === menu ? null : menu));
  }

  closeScopeMenu(): void {
    this.scopeMenu.set(null);
    this.scopeSearch.set('');
  }

  pickScopeType(type: ScopeType): void {
    this.branchContext.setType(type);
    // Branch / Franchise: go straight on to choosing which one.
    if (type === 'all') this.closeScopeMenu();
    else { this.scopeSearch.set(''); this.scopeMenu.set('unit'); }
  }

  pickScopeUnit(id: number | null): void {
    this.branchContext.setUnit(id);
    this.closeScopeMenu();
  }

  initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.scopeMenu()) this.closeScopeMenu();
  }

  /** Profile photo of the signed-in user / employee / customer; falls back to the icon if it fails to load. */
  readonly failedAvatarUrl = signal<string | null>(null);
  readonly avatarUrl = computed(() => {
    const url = this.currentUser()?.profile_photo_url;
    return url && url !== this.failedAvatarUrl() ? url : null;
  });
  readonly currentUserRole = computed(() => {
    const user = this.currentUser();
    return user?.role_name || user?.role?.name || roleLabel(user?.role_id);
  });

  constructor(
    public navLayout: NavLayoutService,
    public notifications: NotificationService,
    private router: Router,
    private dialog: MatDialog,
    private discounts: DiscountRequestsService,
    private absentTelecallers: AbsentTelecallersService,
  ) {
    // Branch managers / approvers: discount requests of their branch show up here as notifications.
    this.discounts.start();
    // Branch managers: telecallers absent today with leads to follow up (click to reassign).
    this.absentTelecallers.start();
  }

  onNotificationClick(notification: AppNotification): void {
    this.notifications.markRead(notification.id);

    if (notification.action?.kind === 'discount-review') {
      this.navLayout.closeNotifications();
      this.dialog
        .open(DiscountReviewDialog, { width: '640px', maxWidth: 'calc(100vw - 32px)', maxHeight: '92vh', autoFocus: false, restoreFocus: true, data: { id: notification.action.id } })
        .afterClosed()
        .subscribe(() => this.discounts.refresh(true)); // a decided request leaves the bell at once
      return;
    }

    if (notification.action?.kind === 'reassign-leads') {
      const a = notification.action;
      this.navLayout.closeNotifications();
      openAssignCaller(this.dialog, {
        leadIds: a.leadIds,
        subject: `${a.leadIds.length} lead${a.leadIds.length === 1 ? '' : 's'} of ${a.telecallerName} (absent today)`,
        currentId: a.telecallerId,
        currentName: a.telecallerName,
      }).afterClosed().subscribe(saved => saved && this.absentTelecallers.refresh(true)); // reassigned: the alert clears
      return;
    }

    if (notification.link) {
      this.navLayout.closeNotifications();
      this.router.navigate([notification.link]);
    }
  }

  markAllRead(): void {
    this.notifications.markAllRead();
  }

  /** 3-bar icon: collapsed (icons only) by default, expands to show link names. */
  onToggleSidebar(): void {
    this.navLayout.toggleSidebar();
  }

  goToDashboard(): void {
    this.router.navigate(['/app/dashboard']);
  }

  onToggleSettingsMenu(): void {
    this.navLayout.toggleSettingsMenu();
  }

  onToggleNotifications(): void {
    this.navLayout.toggleNotifications();
  }

  /** Phones only: the View / Branch pickers stay hidden until picked from the three-dot menu. */
  readonly scopeRowOpen = signal(false);

  toggleScopeRow(): void {
    this.scopeRowOpen.update(open => !open);
    this.scopeMenu.set(null);
    this.navLayout.closeSettingsMenu();
  }

  /** Every staff role holds view-my-activity by default; an admin can still switch it off per role. */
  readonly canSeeMyActivity = computed(() => this.authService.hasActionAccess('view-my-activity'));

  goToMyActivity(): void {
    this.navLayout.closeSettingsMenu();
    this.router.navigate(['/app/audit/me']);
  }

  goToSettings(): void {
    this.navLayout.closeSettingsMenu();
    this.router.navigate(['/app/settings']);
  }

  readonly signingOut = signal(false);

  /** Revokes the session on the API, then clears it locally and goes to the login page. */
  logout(): void {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    this.authService.signOut().subscribe({
      complete: () => {
        this.signingOut.set(false);
        this.navLayout.closeSettingsMenu();
      },
    });
  }
}
