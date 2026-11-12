import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiDataService } from '../../../core/http/api.service';
import { ToastService } from '../../../shared/common-services/toast.service';
import { AutoModuleTabs } from '../../../shared/components/module-tabs/auto-module-tabs';

interface WaTemplate {
  id: number;
  name: string;
  language: string;
  category: 'UTILITY' | 'MARKETING';
  body: string;
  variables: string[];
  status: string;
  rejected_reason: string | null;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string | null;
}
interface WaField { key: string; label: string }

/** The connected WhatsApp Business account (the access token itself never reaches the browser). */
interface WaConnection {
  connected: boolean;
  source: 'settings' | 'env' | null;
  business_account_id: string | null;
  phone_number_id: string | null;
  token_hint: string | null;
  enabled: boolean;
  business_name: string | null;
  display_phone_number: string | null;
  verified_name: string | null;
  quality_rating: string | null;
  verified_at: string | null;
}

const API = 'whatsapp-templates';

/** What a placeholder shows in the live preview. */
const SAMPLES: Record<string, string> = {
  name: 'Priya', mobile: '9876543210', date: '12 Nov 2026', time: '11:00 AM', branch: 'Renew Coimbatore', doctor: 'Dr. Meena',
};

/**
 * Settings -> WhatsApp Templates. A template is written here and submitted to Meta for review; its review status is read back
 * from Meta, and once it is APPROVED it can be made the active template: the one sent as the WhatsApp message of a new appointment.
 */
@Component({
  selector: 'app-whatsapp-templates',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AutoModuleTabs],
  templateUrl: './whatsapp-templates.html',
  styleUrl: './whatsapp-templates.scss',
})
export class WhatsappTemplates implements OnInit {
  private readonly api = inject(ApiDataService);
  private readonly toast = inject(ToastService);

  readonly templates = signal<WaTemplate[]>([]);
  readonly fields = signal<WaField[]>([]);
  readonly configured = signal(true);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly busy = signal<Record<string, boolean>>({});
  readonly showForm = signal(false);
  readonly error = signal<string | null>(null);

  readonly active = computed(() => this.templates().find(t => t.is_active) ?? null);

  readonly languages = [
    { code: 'en', label: 'English' }, { code: 'en_US', label: 'English (US)' }, { code: 'ta', label: 'Tamil' },
    { code: 'hi', label: 'Hindi' }, { code: 'kn', label: 'Kannada' }, { code: 'te', label: 'Telugu' }, { code: 'ml', label: 'Malayalam' },
  ];

  form = this.blankForm();

  ngOnInit(): void {
    this.loadConnection();
    this.load();
  }

  // ---------------------------------------------------------------- business account connection

  readonly connection = signal<WaConnection | null>(null);
  readonly editingConnection = signal(false);
  readonly connSaving = signal(false);
  readonly connError = signal<string | null>(null);
  readonly showToken = signal(false);
  conn = { business_account_id: '', phone_number_id: '', access_token: '', enabled: true };

  loadConnection(): void {
    this.api.GET(`${API}/connection`).subscribe({
      next: (res: any) => {
        const c = res?.data as WaConnection;
        this.connection.set(c);
        this.editingConnection.set(!c?.connected);
      },
      error: () => this.editingConnection.set(true),
    });
  }

  editConnection(): void {
    const c = this.connection();
    this.conn = { business_account_id: c?.business_account_id ?? '', phone_number_id: c?.phone_number_id ?? '', access_token: '', enabled: c?.enabled ?? true };
    this.connError.set(null);
    this.showToken.set(false);
    this.editingConnection.set(true);
  }

  saveConnection(): void {
    this.connError.set(null);
    this.connSaving.set(true);
    this.api.PUT(`${API}/connection`, { ...this.conn, access_token: this.conn.access_token.trim() || null }).subscribe({
      next: (res: any) => {
        this.connSaving.set(false);
        this.connection.set(res?.data);
        this.editingConnection.set(false);
        this.conn.access_token = '';
        this.toast.success(res?.message || 'Connected.');
        this.load();
      },
      error: (err: any) => { this.connSaving.set(false); this.connError.set(this.firstError(err, 'Could not connect the account.')); },
    });
  }

  testConnection(): void {
    this.run('conn-test', this.api.POST(`${API}/connection/test`, {}), 'The connection test failed.', () => this.loadConnection());
  }

  disconnect(): void {
    if (!confirm('Disconnect the WhatsApp Business account? No WhatsApp message will be sent until it is connected again.')) return;
    this.run('conn-off', this.api.Delete(`${API}/connection`, {}), 'Could not disconnect.', () => this.loadConnection());
  }

  private blankForm() {
    return {
      name: 'appointment_confirmation',
      language: 'en',
      category: 'UTILITY' as 'UTILITY' | 'MARKETING',
      body: [
        'RENEW+ HAIR & SKIN CARE',
        '',
        'Dear {{1}},',
        '',
        '✨ Your Appointment Is Confirmed!',
        '',
        'Your appointment at {{2}} has been successfully confirmed.',
        '',
        '📅 Date: {{3}}',
        '⏰ Time: {{4}}',
        '',
        'Please arrive 10 minutes before your scheduled appointment.',
        '',
        'Need to reschedule? Reply to this message, and our team will assist you.',
        '',
        'We look forward to welcoming you!',
        '',
        'RENEW+ HAIR & SKIN CARE',
        'Get Fixed in Time to Shine! ✨',
      ].join('\n'),
      variables: ['name', 'branch', 'date', 'time'] as string[],
    };
  }

  load(): void {
    this.loading.set(true);
    this.api.GET(API).subscribe({
      next: (res: any) => {
        this.templates.set(res?.data ?? []);
        this.fields.set(res?.meta?.fields ?? []);
        this.configured.set(!!res?.meta?.configured);
        this.loading.set(false);
      },
      error: (err: any) => { this.loading.set(false); this.toast.error(err?.error?.message || 'Could not load the templates.'); },
    });
  }

  // ---------------------------------------------------------------- form

  /** {{1}} .. {{n}} found in the message body. */
  get placeholderCount(): number {
    const nums = new Set((this.form.body.match(/\{\{(\d+)\}\}/g) ?? []).map(m => Number(m.replace(/\D/g, ''))));
    return nums.size;
  }

  get slots(): number[] {
    return Array.from({ length: this.placeholderCount }, (_, i) => i);
  }

  /** The message as the customer will see it, with sample data. */
  get preview(): string {
    return this.form.body.replace(/\{\{(\d+)\}\}/g, (_m, n) => SAMPLES[this.form.variables[Number(n) - 1]] ?? `{{${n}}}`);
  }

  onBodyChange(): void {
    const n = this.placeholderCount;
    const defaults = ['name', 'branch', 'date', 'time', 'doctor', 'mobile'];
    while (this.form.variables.length < n) this.form.variables.push(defaults[this.form.variables.length] ?? 'name');
    this.form.variables.length = n;
  }

  addPlaceholder(): void {
    this.form.body = `${this.form.body} {{${this.placeholderCount + 1}}}`;
    this.onBodyChange();
  }

  openForm(): void {
    this.form = this.blankForm();
    this.error.set(null);
    this.showForm.set(true);
  }

  submit(): void {
    this.error.set(null);
    this.saving.set(true);
    this.api.POST(API, { ...this.form, variables: this.form.variables.slice(0, this.placeholderCount) }).subscribe({
      next: (res: any) => {
        this.saving.set(false);
        this.showForm.set(false);
        this.toast.success(res?.message || 'Template submitted to Meta.');
        this.load();
      },
      error: (err: any) => { this.saving.set(false); this.error.set(this.firstError(err, 'Could not submit the template.')); },
    });
  }

  // ---------------------------------------------------------------- row actions

  isBusy(key: string): boolean { return !!this.busy()[key]; }

  private run(key: string, call: any, fallback: string, after?: () => void): void {
    this.busy.update(b => ({ ...b, [key]: true }));
    call.subscribe({
      next: (res: any) => { this.busy.update(b => ({ ...b, [key]: false })); this.toast.success(res?.message || 'Done.'); after?.(); this.load(); },
      error: (err: any) => { this.busy.update(b => ({ ...b, [key]: false })); this.toast.error(this.firstError(err, fallback)); after?.(); this.load(); },
    });
  }

  checkStatus(t: WaTemplate): void { this.run(`sync-${t.id}`, this.api.POST(`${API}/${t.id}/sync`, {}), 'Could not read the status from Meta.'); }
  checkAll(): void { this.run('sync-all', this.api.POST(`${API}/sync-all`, {}), 'Could not read the statuses from Meta.'); }

  toggleActive(t: WaTemplate): void {
    if (t.is_active) this.run(`act-${t.id}`, this.api.POST(`${API}/${t.id}/deactivate`, {}), 'Could not deactivate the template.');
    else this.run(`act-${t.id}`, this.api.POST(`${API}/${t.id}/activate`, {}), 'Could not activate the template.');
  }

  remove(t: WaTemplate): void {
    if (!confirm(`Delete the template "${t.name}"? It is also removed from Meta.`)) return;
    this.run(`del-${t.id}`, this.api.Delete(`${API}/${t.id}`, {}), 'Could not delete the template.');
  }

  // ---------------------------------------------------------------- view helpers

  statusClass(status: string): string {
    return status === 'APPROVED' ? 'ok' : status === 'REJECTED' || status === 'DISABLED' || status === 'NOT_FOUND' ? 'bad' : status === 'PENDING' || status === 'IN_APPEAL' ? 'warn' : 'info';
  }

  statusLabel(status: string): string {
    return ({ APPROVED: 'Approved', PENDING: 'In review', REJECTED: 'Rejected', PAUSED: 'Paused', DISABLED: 'Disabled', IN_APPEAL: 'In appeal', NOT_FOUND: 'Not found at Meta' } as Record<string, string>)[status] ?? status;
  }

  fieldLabel(key: string): string {
    return this.fields().find(f => f.key === key)?.label ?? key;
  }

  render(t: WaTemplate): string {
    return t.body.replace(/\{\{(\d+)\}\}/g, (_m, n) => `[${this.fieldLabel(t.variables[Number(n) - 1] ?? '')}]`);
  }

  formatDateTime(iso: string | null): string {
    if (!iso) return 'never';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' });
  }

  private firstError(err: any, fallback: string): string {
    const first = err?.error?.errors ? (Object.values(err.error.errors)[0] as string[])?.[0] : null;
    return first || err?.error?.message || fallback;
  }
}
