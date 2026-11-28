import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { BranchOptionsService, parseUnitKey, unitKey } from '../../../shared/common-services/branch-options.service';
import { FacebookEmbeddedSignupService } from '../facebook-embedded-signup.service';
import { WhatsAppApiService } from '../whatsapp-api.service';
import { WaAccount, WaConnectSession } from '../whatsapp.models';

export interface ConnectDialogData {
  embeddedSignup: boolean;
  /** Reconnecting this account: its WABA is preselected and its branch kept. */
  reconnect?: WaAccount | null;
}

type Step = 'method' | 'pick';

/**
 * Connect (or reconnect) WhatsApp Business Accounts in two steps:
 *   1. get a token onto the server - Embedded Signup popup (code exchanged server side) or a pasted system-user token
 *   2. pick which of the WABAs that token may manage to connect, and the branch / franchise they belong to
 * The token itself never comes back to the browser: step 1 answers with a session id and the WABAs found.
 */
@Component({
  selector: 'app-wa-connect-account-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './connect-account-dialog.html',
  styleUrl: './connect-account-dialog.scss',
})
export class ConnectAccountDialog {
  private readonly api = inject(WhatsAppApiService);
  private readonly fb = inject(FacebookEmbeddedSignupService);
  private readonly ref = inject(MatDialogRef<ConnectAccountDialog, WaAccount[] | null>);
  readonly data = inject<ConnectDialogData>(MAT_DIALOG_DATA);
  readonly branches = inject(BranchOptionsService);

  readonly step = signal<Step>('method');
  readonly busy = signal<'' | 'facebook' | 'token' | 'finish'>('');
  readonly error = signal<string | null>(null);
  readonly session = signal<WaConnectSession | null>(null);
  readonly selected = signal<Record<string, boolean>>({});

  token = '';
  wabaHint = this.data.reconnect?.waba_id ?? '';
  showToken = false;
  branchKey = unitKey(this.data.reconnect?.branch_type, this.data.reconnect?.branch_id);
  restrictAccess = this.data.reconnect?.restrict_access ?? false;
  name = '';

  readonly usable = computed(() => (this.session()?.wabas ?? []).filter(w => !w.error));
  readonly failed = computed(() => (this.session()?.wabas ?? []).filter(w => !!w.error));
  readonly chosen = computed(() => Object.entries(this.selected()).filter(([, v]) => v).map(([k]) => k));

  constructor() {
    this.branches.load().subscribe();
  }

  async connectWithFacebook(): Promise<void> {
    this.error.set(null);
    this.busy.set('facebook');
    try {
      const cfg = await new Promise<any>((resolve, reject) => this.api.connectConfig().subscribe({ next: resolve, error: reject }));
      if (!cfg.enabled) throw new Error('Embedded Signup is not configured on the server.');
      const result = await this.fb.launch(cfg);
      this.api.connectEmbedded({ code: result.code, state: cfg.state, waba_id: result.wabaId, phone_number_id: result.phoneNumberId }).subscribe({
        next: s => this.openPick(s),
        error: err => this.fail(err),
      });
    } catch (err: any) {
      this.fail(err);
    }
  }

  connectWithToken(): void {
    if (this.token.trim().length < 20) {
      this.error.set('Paste the full access token (it is long - usually 150+ characters).');
      return;
    }
    this.error.set(null);
    this.busy.set('token');
    this.api.connectToken({ access_token: this.token.trim(), waba_id: this.wabaHint.trim() || null }).subscribe({
      next: s => {
        this.token = ''; // drop it from the page as soon as the server holds it
        this.openPick(s);
      },
      error: err => this.fail(err),
    });
  }

  toggle(id: string, on: boolean): void {
    this.selected.update(s => ({ ...s, [id]: on }));
  }

  finish(): void {
    const s = this.session();
    if (!s || !this.chosen().length) return;
    const unit = parseUnitKey(this.branchKey);
    this.error.set(null);
    this.busy.set('finish');
    this.api.connectFinish({
      session_id: s.session_id,
      waba_ids: this.chosen(),
      name: this.chosen().length === 1 && this.name.trim() ? this.name.trim() : null,
      branch_type: unit?.type ?? null,
      branch_id: unit?.id ?? null,
      restrict_access: this.restrictAccess,
    }).subscribe({
      next: res => this.ref.close(res.data),
      error: err => this.fail(err),
    });
  }

  back(): void {
    this.step.set('method');
    this.session.set(null);
    this.error.set(null);
  }

  close(): void {
    this.ref.close(null);
  }

  private openPick(s: WaConnectSession): void {
    this.busy.set('');
    this.session.set(s);
    const pre = new Set([...(s.preselected ?? []), ...(this.data.reconnect ? [this.data.reconnect.waba_id] : [])]);
    const usable = s.wabas.filter(w => !w.error);
    const selected: Record<string, boolean> = {};
    usable.forEach(w => (selected[w.id] = pre.size ? pre.has(w.id) : usable.length === 1));
    this.selected.set(selected);
    this.step.set('pick');
  }

  private fail(err: any): void {
    this.busy.set('');
    const errors = err?.error?.errors;
    const first = errors ? (Object.values(errors).flat()[0] as string) : null;
    this.error.set(first || err?.error?.message || err?.message || 'Something went wrong. Try again.');
  }
}
