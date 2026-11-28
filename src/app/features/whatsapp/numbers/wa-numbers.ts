import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/auth/auth.service';
import { BranchOptionsService, parseUnitKey, unitKey } from '../../../shared/common-services/branch-options.service';
import { ToastService } from '../../../shared/common-services/toast.service';
import { WhatsAppApiService } from '../whatsapp-api.service';
import { WhatsAppContextService } from '../whatsapp-context.service';
import { WaPhoneNumber } from '../whatsapp.models';

/**
 * WhatsApp Business -> WhatsApp Numbers: every business number of the accounts this user may see, with Meta's
 * quality / limit / verification state, its branch (own or inherited from the account) and the default number
 * ERP notifications are sent from.
 */
@Component({
  selector: 'app-wa-numbers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './wa-numbers.html',
  styleUrl: './wa-numbers.scss',
})
export class WaNumbers implements OnInit {
  private readonly api = inject(WhatsAppApiService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  readonly ctx = inject(WhatsAppContextService);
  readonly branches = inject(BranchOptionsService);

  readonly rows = signal<WaPhoneNumber[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly busy = signal<Record<number, boolean>>({});
  readonly search = signal('');

  readonly canManage = computed(() => this.auth.hasActionAccess('manage-whatsapp-numbers') || this.auth.hasActionAccess('manage-whatsapp-accounts'));
  readonly shown = computed(() => {
    const q = this.search().trim().toLowerCase();
    return q ? this.rows().filter(r => `${r.display_phone_number} ${r.verified_name} ${r.account?.name}`.toLowerCase().includes(q)) : this.rows();
  });

  readonly branchDraft: Record<number, string> = {};

  constructor() {
    // follow the header account switcher
    effect(() => {
      this.ctx.accountId();
      this.load();
    });
  }

  ngOnInit(): void {
    this.branches.load().subscribe();
  }

  load(): void {
    this.loading.set(true);
    this.api.phoneNumbers({ account_id: this.ctx.accountId() }).subscribe({
      next: rows => {
        this.rows.set(rows);
        rows.forEach(r => (this.branchDraft[r.id] = r.branch_inherited ? '' : unitKey(r.branch_type, r.branch_id)));
        this.loading.set(false);
        this.loadError.set(null);
      },
      error: err => {
        this.loading.set(false);
        this.loadError.set(err?.error?.message || 'Could not load the numbers.');
      },
    });
  }

  saveBranch(p: WaPhoneNumber): void {
    const unit = parseUnitKey(this.branchDraft[p.id]);
    this.update(p, this.api.updatePhoneNumber(p.id, { branch_type: unit?.type ?? null, branch_id: unit?.id ?? null }));
  }

  toggleEnabled(p: WaPhoneNumber): void {
    this.update(p, this.api.updatePhoneNumber(p.id, { enabled: !p.enabled }));
  }

  async makeDefault(p: WaPhoneNumber): Promise<void> {
    const ok = await this.toast.confirm(
      `Send ERP notifications from ${p.display_phone_number}?`,
      'Purchase orders, HR documents and appointment confirmations will go out from this number.',
      'Yes, make default',
    );
    if (ok) this.update(p, this.api.makeDefault(p.id), true);
  }

  private update(p: WaPhoneNumber, obs: import('rxjs').Observable<{ message: string; data: WaPhoneNumber }>, reload = false): void {
    this.busy.update(b => ({ ...b, [p.id]: true }));
    obs.subscribe({
      next: res => {
        this.busy.update(b => ({ ...b, [p.id]: false }));
        if (reload) {
          this.load();
          this.ctx.load();
        } else {
          this.rows.update(rows => rows.map(r => (r.id === p.id ? res.data : r)));
        }
        this.toast.success(res.message);
      },
      error: err => {
        this.busy.update(b => ({ ...b, [p.id]: false }));
        this.toast.error('Could not update the number', err?.error?.message || 'Try again.');
      },
    });
  }
}
