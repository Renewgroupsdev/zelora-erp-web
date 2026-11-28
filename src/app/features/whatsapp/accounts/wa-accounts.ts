import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { BranchOptionsService, parseUnitKey, unitKey } from '../../../shared/common-services/branch-options.service';
import { ToastService } from '../../../shared/common-services/toast.service';
import { WhatsAppApiService } from '../whatsapp-api.service';
import { WhatsAppContextService } from '../whatsapp-context.service';
import { WaAccount, WaAccountsMeta } from '../whatsapp.models';
import { ConnectAccountDialog, ConnectDialogData } from './connect-account-dialog';

/**
 * WhatsApp Business -> Meta Accounts: one card per connected WhatsApp Business Account with its numbers, token health
 * and connection status. Connect / reconnect / refresh / disconnect; branch and access settings per account.
 */
@Component({
  selector: 'app-wa-accounts',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './wa-accounts.html',
  styleUrl: './wa-accounts.scss',
})
export class WaAccounts implements OnInit {
  private readonly api = inject(WhatsAppApiService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(MatDialog);
  private readonly ctx = inject(WhatsAppContextService);
  readonly auth = inject(AuthService);
  readonly branches = inject(BranchOptionsService);

  readonly accounts = signal<WaAccount[]>([]);
  readonly meta = signal<WaAccountsMeta | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly busy = signal<Record<string, boolean>>({});
  readonly editing = signal<number | null>(null);
  readonly filter = signal<'all' | 'attention'>('all');

  editDraft = { name: '', branchKey: '', restrict: false, welcomeEnabled: true, welcomeMessage: '' };

  readonly attention = computed(() => this.accounts().filter(a => (a.status !== 'connected' && a.status !== 'disconnected') || !!a.token?.expiring_soon));
  readonly shown = computed(() => (this.filter() === 'attention' ? this.attention() : this.accounts()));
  readonly totals = computed(() => {
    const rows = this.accounts();
    return {
      connected: rows.filter(a => a.status === 'connected').length,
      numbers: rows.reduce((n, a) => n + (a.phone_numbers?.length ?? 0), 0),
      attention: this.attention().length,
    };
  });

  ngOnInit(): void {
    this.branches.load().subscribe();
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.accounts().subscribe({
      next: r => {
        this.accounts.set(r.data);
        this.meta.set(r.meta);
        this.loading.set(false);
        this.loadError.set(null);
      },
      error: err => {
        this.loading.set(false);
        this.loadError.set(err?.error?.message || 'Could not load the WhatsApp accounts.');
      },
    });
  }

  connect(reconnect: WaAccount | null = null): void {
    const data: ConnectDialogData = { embeddedSignup: !!this.meta()?.embedded_signup, reconnect };
    this.dialog.open(ConnectAccountDialog, { data, maxWidth: '96vw', autoFocus: false, panelClass: 'wa-dialog-panel' })
      .afterClosed().subscribe((connected: WaAccount[] | null) => {
        if (!connected?.length) return;
        this.toast.success(connected.length === 1 ? 'WhatsApp account connected' : `${connected.length} WhatsApp accounts connected`,
          connected.some(a => !a.webhook_subscribed) ? 'Webhook subscription did not succeed - use Refresh on the card to retry.' : undefined);
        this.load();
        this.ctx.load();
      });
  }

  refresh(a: WaAccount): void {
    this.run(`refresh-${a.id}`, this.api.refreshAccount(a.id), res => {
      this.replace(res.data);
      this.toast.success(res.message);
    });
  }

  checkToken(a: WaAccount): void {
    this.run(`token-${a.id}`, this.api.validateToken(a.id), res => {
      this.replace(res.data);
      res.data.token?.status === 'active' ? this.toast.success(res.message) : this.toast.warning('Token problem', res.message);
    });
  }

  async disconnect(a: WaAccount): Promise<void> {
    const ok = await this.toast.confirm(
      `Disconnect ${a.name}?`,
      'Messages can no longer be sent or received for its numbers. Conversation history stays. You can reconnect it later.',
      'Yes, disconnect',
    );
    if (!ok) return;
    this.run(`disconnect-${a.id}`, this.api.disconnect(a.id), res => {
      this.replace(res.data);
      this.ctx.load();
      this.toast.success('Account disconnected', res.message);
    });
  }

  startEdit(a: WaAccount): void {
    this.editDraft = {
      name: a.name, branchKey: unitKey(a.branch_type, a.branch_id), restrict: a.restrict_access,
      welcomeEnabled: a.welcome?.enabled ?? true, welcomeMessage: a.welcome?.message ?? '',
    };
    this.editing.set(a.id);
  }

  saveEdit(a: WaAccount): void {
    const unit = parseUnitKey(this.editDraft.branchKey);
    this.run(`edit-${a.id}`, this.api.updateAccount(a.id, {
      name: this.editDraft.name.trim() || a.name,
      branch_type: unit?.type ?? null,
      branch_id: unit?.id ?? null,
      restrict_access: this.editDraft.restrict,
      settings: { welcome_enabled: this.editDraft.welcomeEnabled, welcome_message: this.editDraft.welcomeMessage.trim() || null },
    }), updated => {
      this.replace(updated);
      this.editing.set(null);
      this.ctx.load();
    });
  }

  copy(text: string): void {
    navigator.clipboard?.writeText(text).then(() => this.toast.success('Copied'), () => undefined);
  }

  isBusy(key: string): boolean {
    return !!this.busy()[key];
  }

  statusLabel(a: WaAccount): { text: string; tone: string } {
    switch (a.status) {
      case 'connected': return a.token?.expiring_soon ? { text: 'Token expiring', tone: 'orange' } : { text: 'Connected', tone: 'green' };
      case 'token_invalid': return { text: 'Token invalid', tone: 'red' };
      case 'permission_missing': return { text: 'Permission missing', tone: 'red' };
      default: return { text: 'Disconnected', tone: '' };
    }
  }

  methodLabel(m: string): string {
    return m === 'embedded_signup' ? 'Embedded Signup' : m === 'manual' ? 'System-user token' : 'Migrated from Settings';
  }

  trackId = (_: number, a: WaAccount) => a.id;

  private replace(updated: WaAccount): void {
    this.accounts.update(rows => rows.map(r => (r.id === updated.id ? updated : r)));
  }

  private run<T>(key: string, obs: import('rxjs').Observable<T>, done: (v: T) => void): void {
    this.busy.update(b => ({ ...b, [key]: true }));
    obs.subscribe({
      next: v => {
        this.busy.update(b => ({ ...b, [key]: false }));
        done(v);
      },
      error: err => {
        this.busy.update(b => ({ ...b, [key]: false }));
        const errors = err?.error?.errors;
        this.toast.error('Could not complete the action', (errors ? (Object.values(errors).flat()[0] as string) : null) || err?.error?.message || 'Try again.');
      },
    });
  }
}
