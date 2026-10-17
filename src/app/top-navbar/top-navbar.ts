import { CommonModule } from '@angular/common';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NavLayoutService } from '../services/nav-layout.service';
import { AppNotification, NotificationService } from '../shared/common-services/notification.service';
import { AuthService } from '../core/auth/auth.service';
import { roleLabel } from '../core/auth/auth.model';
import { BranchContextService, ScopeType } from '../shared/common-services/branch-context.service';
import { BranchOptionsService } from '../shared/common-services/branch-options.service';
import { BranchChat } from '../shared/components/branch-chat/branch-chat';

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
  imports: [CommonModule, BranchChat],
  templateUrl: './top-navbar.html',
  styleUrl: './top-navbar.scss',
})
export class TopNavbar {
  private readonly authService = inject(AuthService);

  readonly branchContext = inject(BranchContextService);
  readonly branchOptions = inject(BranchOptionsService);

  readonly currentUser = this.authService.currentUser;

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
  ) { }

  onNotificationClick(notification: AppNotification): void {
    this.notifications.markRead(notification.id);

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
