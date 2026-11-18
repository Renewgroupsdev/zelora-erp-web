import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiDataService } from '../../../core/http/api.service';
import { ToastService } from '../../../shared/common-services/toast.service';
import { AutoModuleTabs } from '../../../shared/components/module-tabs/auto-module-tabs';

/** The Google account used to create the Meet link of a "Video call" interview (secrets never reach the browser). */
interface GoogleConnection {
  connected: boolean;
  source: 'settings' | 'env' | null;
  client_id: string | null;
  secret_saved: boolean;
  calendar_id: string;
  google_email: string | null;
  enabled: boolean;
  verified_at: string | null;
  redirect_uri: string;
}

const API = 'google-connection';

/**
 * Settings -> Google Meet. Save the Google OAuth Client ID and Secret, then "Connect with Google" signs the HR account in. From then on
 * scheduling a Video call interview creates a Google Meet link and emails it to the candidate.
 */
@Component({
  selector: 'app-google-meet',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AutoModuleTabs],
  templateUrl: './google-meet.html',
  styleUrl: './google-meet.scss',
})
export class GoogleMeet implements OnInit {
  private readonly api = inject(ApiDataService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly connection = signal<GoogleConnection | null>(null);
  readonly editing = signal(false);
  readonly saving = signal(false);
  readonly busy = signal<Record<string, boolean>>({});
  readonly error = signal<string | null>(null);
  readonly showSecret = signal(false);
  form = { client_id: '', client_secret: '', calendar_id: 'primary', refresh_token: '' };

  ngOnInit(): void {
    this.load();
    this.readOutcome();
  }

  /** Google sends the browser back here with ?google=connected|error. */
  private readOutcome(): void {
    const q = this.route.snapshot.queryParamMap;
    const outcome = q.get('google');
    if (!outcome) return;
    if (outcome === 'connected') this.toast.success(`Google connected${q.get('account') ? ' as ' + q.get('account') : ''}.`);
    else this.toast.error(q.get('message') || 'Google sign-in failed.');
    this.router.navigate([], { queryParams: { google: null, account: null, message: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  load(): void {
    this.api.GET(API).subscribe({
      next: (res: any) => {
        const c = res?.data as GoogleConnection;
        this.connection.set(c);
        this.editing.set(!c?.client_id);
        if (c?.client_id) this.form = { client_id: c.client_id, client_secret: '', calendar_id: c.calendar_id, refresh_token: '' };
      },
      error: () => this.editing.set(true),
    });
  }

  edit(): void {
    const c = this.connection();
    this.form = { client_id: c?.client_id ?? '', client_secret: '', calendar_id: c?.calendar_id ?? 'primary', refresh_token: '' };
    this.error.set(null);
    this.showSecret.set(false);
    this.editing.set(true);
  }

  save(): void {
    this.error.set(null);
    this.saving.set(true);
    const body = { client_id: this.form.client_id.trim(), client_secret: this.form.client_secret.trim() || null, calendar_id: this.form.calendar_id.trim() || 'primary', refresh_token: this.form.refresh_token.trim() || null };
    this.api.PUT(API, body).subscribe({
      next: (res: any) => {
        this.saving.set(false);
        this.connection.set(res?.data);
        this.editing.set(false);
        this.form.client_secret = '';
        this.form.refresh_token = '';
        this.toast.success(res?.message || 'Saved.');
      },
      error: (err: any) => { this.saving.set(false); this.error.set(this.firstError(err, 'Could not save the Google settings.')); },
    });
  }

  /** Opens Google's sign-in page; Google returns to the API, which sends the browser back to this page. */
  connect(): void {
    this.setBusy('connect', true);
    this.api.POST(`${API}/authorize`, { return_url: `${window.location.origin}/app/settings/google-meet` }).subscribe({
      next: (res: any) => { window.location.href = res?.data?.url; },
      error: (err: any) => { this.setBusy('connect', false); this.toast.error(this.firstError(err, 'Could not start the Google sign-in.')); },
    });
  }

  test(): void {
    this.run('test', this.api.POST(`${API}/test`, {}), 'The Google test failed.');
  }

  disconnect(): void {
    if (!confirm('Disconnect the Google account? Video call interviews will be scheduled without a Meet link until it is connected again.')) return;
    this.run('off', this.api.Delete(API, {}), 'Could not disconnect.');
  }

  copy(text: string): void {
    navigator.clipboard?.writeText(text).then(() => this.toast.success('Copied.'), () => undefined);
  }

  isBusy(key: string): boolean { return !!this.busy()[key]; }

  private setBusy(key: string, on: boolean): void { this.busy.update(b => ({ ...b, [key]: on })); }

  private run(key: string, call: any, fallback: string): void {
    this.setBusy(key, true);
    call.subscribe({
      next: (res: any) => { this.setBusy(key, false); this.toast.success(res?.message || 'Done.'); this.load(); },
      error: (err: any) => { this.setBusy(key, false); this.toast.error(this.firstError(err, fallback)); this.load(); },
    });
  }

  formatDateTime(iso: string | null): string {
    if (!iso) return 'never';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  private firstError(err: any, fallback: string): string {
    const first = err?.error?.errors ? (Object.values(err.error.errors)[0] as string[])?.[0] : null;
    return first || err?.error?.message || fallback;
  }
}
