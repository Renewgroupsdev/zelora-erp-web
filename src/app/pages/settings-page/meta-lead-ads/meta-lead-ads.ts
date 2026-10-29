import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiDataService } from '../../../core/http/api.service';
import { BranchOptionsService, parseUnitKey } from '../../../shared/common-services/branch-options.service';
import {
  MetaAvailablePage,
  MetaConnection,
  MetaHealth,
  MetaIntegrationService,
  MetaMapping,
  MetaOverview,
  MetaTestResult,
} from '../../../shared/common-services/meta-integration.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../shared/common-services/toast.service';

interface SourceOption { id: number; source_name: string; }

/** What the administrator is editing for one Page / one Page that is about to be connected. */
interface MappingDraft { branchKey: string; sourceId: number | null; adAccountId: string; }

/**
 * Settings -> Meta Lead Ads. Connects Facebook Pages (Facebook login, server-side token storage), maps each Page /
 * Instant Form to an ERP branch and lead source, shows token / permission / webhook health that Meta itself confirmed,
 * and links to the activity log. The browser never receives a Meta access token.
 */
@Component({
  selector: 'app-meta-lead-ads',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './meta-lead-ads.html',
  styleUrl: './meta-lead-ads.scss',
})
export class MetaLeadAds implements OnInit {
  private readonly meta = inject(MetaIntegrationService);
  private readonly api = inject(ApiDataService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly branchOptions = inject(BranchOptionsService);

  readonly overview = signal<MetaOverview | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly sources = signal<SourceOption[]>([]);

  /** Pages the authorised Facebook account may manage (null = the picker is closed). */
  readonly pickerAccount = signal<string | null>(null);
  readonly pickerPages = signal<MetaAvailablePage[] | null>(null);
  readonly pickerLoading = signal(false);

  readonly busy = signal<Record<string, boolean>>({});
  readonly testResults = signal<Record<number, MetaTestResult>>({});
  readonly expanded = signal<Record<number, boolean>>({});

  /** Draft mapping per connection id, and per Page id while picking. */
  readonly drafts: Record<number, MappingDraft> = {};
  readonly pickDrafts: Record<string, MappingDraft> = {};
  readonly formDrafts: Record<number, MappingDraft> = {};

  ngOnInit(): void {
    this.branchOptions.load().subscribe();
    this.api.GET(`${ApiRoutesConstants.Source_List_Options}?per_page=200`).subscribe({
      next: (res: any) => this.sources.set((res?.data?.data ?? res?.data ?? []) as SourceOption[]),
    });
    this.handleReturnFromFacebook();
    this.load();
  }

  // ---- loading ----

  load(): void {
    this.loading.set(true);
    this.meta.overview().subscribe({
      next: (o) => {
        this.setOverview(o);
        this.loading.set(false);
        this.loadError.set(null);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(err?.error?.message || 'Could not load the Meta integration status.');
      },
    });
  }

  private setOverview(o: MetaOverview): void {
    this.overview.set(o);
    o.connections.forEach((c) => this.seedDraft(c));
  }

  private replaceConnection(updated: MetaConnection): void {
    const o = this.overview();
    if (!o) return;
    this.overview.set({ ...o, connections: o.connections.map((c) => (c.id === updated.id ? updated : c)) });
    this.seedDraft(updated);
  }

  private seedDraft(c: MetaConnection): void {
    this.drafts[c.id] = { branchKey: c.branch?.key ?? '', sourceId: c.source_id, adAccountId: c.ad_account_id ?? '' };
    c.forms.forEach((f) => (this.formDrafts[f.id] = { branchKey: f.branch?.key ?? '', sourceId: f.source_id, adAccountId: '' }));
  }

  /** Facebook sends the browser back here with ?meta=authorized|error. */
  private handleReturnFromFacebook(): void {
    const q = this.route.snapshot.queryParamMap;
    const result = q.get('meta');
    if (!result) return;

    if (result === 'authorized') {
      this.toast.success('Facebook account authorised', 'Now choose the Page to connect.');
      this.openPicker();
    } else {
      this.toast.error('Facebook sign-in failed', q.get('message') || 'Access was not granted.');
    }
    this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  // ---- authorisation + Page picker ----

  connectAccount(): void {
    this.setBusy('auth', true);
    this.meta.startAuthorization().subscribe({
      next: (url) => (window.location.href = url),
      error: (err) => {
        this.setBusy('auth', false);
        this.toast.error('Cannot start Meta sign-in', err?.error?.message || 'Please try again.');
      },
    });
  }

  /** Empty Page list: Meta reuses the saved (empty) grant on "Continue", so drop it first, then sign in again. */
  resetAndSignIn(): void {
    this.setBusy('auth', true);
    this.meta.resetAuthorization().subscribe({
      next: () => {
        this.setBusy('auth', false);
        this.closePicker();
        this.connectAccount();
      },
      error: (err) => {
        this.setBusy('auth', false);
        this.toast.error('Cannot reset the Facebook sign-in', err?.error?.message || 'Please try again.');
      },
    });
  }

  openPicker(): void {
    this.pickerLoading.set(true);
    this.pickerPages.set(null);
    this.meta.availablePages().subscribe({
      next: (res) => {
        this.pickerLoading.set(false);
        this.pickerAccount.set(res.account ?? 'Facebook account');
        this.pickerPages.set(res.pages);
        res.pages.forEach((p) => (this.pickDrafts[p.page_id] ??= { branchKey: '', sourceId: null, adAccountId: '' }));
      },
      error: (err) => {
        this.pickerLoading.set(false);
        this.toast.error('Cannot list Pages', err?.error?.message || 'Authorise with Facebook again.');
      },
    });
  }

  closePicker(): void {
    this.pickerAccount.set(null);
    this.pickerPages.set(null);
  }

  connectPage(page: MetaAvailablePage): void {
    const draft = this.pickDrafts[page.page_id];
    this.setBusy('connect:' + page.page_id, true);
    this.meta.connect(page.page_id, this.toMapping(draft)).subscribe({
      next: ({ connection, warnings }) => {
        this.setBusy('connect:' + page.page_id, false);
        warnings.length
          ? this.toast.warning(`${connection.page_name} connected with warnings`, warnings.join('\n'))
          : this.toast.success(`${connection.page_name} connected`);
        this.load();
        this.openPicker();
      },
      error: (err) => {
        this.setBusy('connect:' + page.page_id, false);
        this.toast.error('Could not connect the Page', this.errorText(err));
      },
    });
  }

  // ---- per-Page actions ----

  toggleImport(c: MetaConnection): void {
    this.setBusy('import:' + c.id, true);
    this.meta.update(c.id, { import_enabled: !c.import_enabled }).subscribe({
      next: (u) => { this.setBusy('import:' + c.id, false); this.replaceConnection(u); },
      error: (err) => { this.setBusy('import:' + c.id, false); this.toast.error('Could not change import', this.errorText(err)); },
    });
  }

  saveMapping(c: MetaConnection): void {
    this.setBusy('save:' + c.id, true);
    const d = this.drafts[c.id];
    this.meta.update(c.id, { ...this.toMapping(d), ad_account_id: d.adAccountId.trim() || null }).subscribe({
      next: (u) => { this.setBusy('save:' + c.id, false); this.replaceConnection(u); this.toast.success('Mapping saved'); },
      error: (err) => { this.setBusy('save:' + c.id, false); this.toast.error('Could not save', this.errorText(err)); },
    });
  }

  saveFormMapping(c: MetaConnection, formId: number): void {
    this.setBusy('form:' + formId, true);
    this.meta.updateForm(c.id, formId, this.toMapping(this.formDrafts[formId])).subscribe({
      next: (u) => { this.setBusy('form:' + formId, false); this.replaceConnection(u); this.toast.success('Form mapping saved'); },
      error: (err) => { this.setBusy('form:' + formId, false); this.toast.error('Could not save', this.errorText(err)); },
    });
  }

  testConnection(c: MetaConnection): void {
    this.setBusy('test:' + c.id, true);
    this.meta.test(c.id).subscribe({
      next: (result) => {
        this.setBusy('test:' + c.id, false);
        this.testResults.update((r) => ({ ...r, [c.id]: result }));
        this.replaceConnection(result.connection);
      },
      error: (err) => { this.setBusy('test:' + c.id, false); this.toast.error('Test failed', this.errorText(err)); },
    });
  }

  refreshForms(c: MetaConnection): void {
    this.setBusy('forms:' + c.id, true);
    this.meta.refreshForms(c.id).subscribe({
      next: ({ connection, message }) => { this.setBusy('forms:' + c.id, false); this.replaceConnection(connection); this.toast.info('Forms', message); },
      error: (err) => { this.setBusy('forms:' + c.id, false); this.toast.error('Could not refresh forms', this.errorText(err)); },
    });
  }

  async disconnect(c: MetaConnection): Promise<void> {
    const ok = await this.toast.confirm(
      `Disconnect ${c.page_name}?`,
      'Lead import stops for this Page and its stored access token is deleted. Imported leads are kept. You can reconnect it later.',
      'Yes, disconnect',
    );
    if (!ok) return;

    this.setBusy('disc:' + c.id, true);
    this.meta.disconnect(c.id).subscribe({
      next: (u) => { this.setBusy('disc:' + c.id, false); this.replaceConnection(u); this.toast.success('Page disconnected'); },
      error: (err) => { this.setBusy('disc:' + c.id, false); this.toast.error('Could not disconnect', this.errorText(err)); },
    });
  }

  toggleExpanded(c: MetaConnection): void {
    this.expanded.update((e) => ({ ...e, [c.id]: !e[c.id] }));
  }

  copy(text: string | null | undefined): void {
    if (text) navigator.clipboard?.writeText(text).then(() => this.toast.info('Copied'), () => undefined);
  }

  // ---- view helpers ----

  isBusy(key: string): boolean { return !!this.busy()[key]; }

  healthLabel(h: MetaHealth): string {
    return { healthy: 'Healthy', attention: 'Needs verification', error: 'Problem', disconnected: 'Disconnected' }[h];
  }

  healthClass(h: MetaHealth): string {
    return { healthy: 'ok', attention: 'warn', error: 'bad', disconnected: '' }[h];
  }

  tokenLabel(c: MetaConnection): string {
    return { unknown: 'Not verified yet', active: 'Valid', invalid: 'Invalid / revoked', permission_missing: 'Permission missing' }[c.token_status];
  }

  tokenClass(c: MetaConnection): string {
    return { unknown: 'warn', active: 'ok', invalid: 'bad', permission_missing: 'bad' }[c.token_status];
  }

  eventCount(c: MetaConnection, ...statuses: string[]): number {
    return statuses.reduce((n, s) => n + ((c.events as Record<string, number>)[s] ?? 0), 0);
  }

  needsAttention(c: MetaConnection): number {
    return this.eventCount(c, 'needs_review', 'permission_issue', 'failed', 'retry_pending');
  }

  units() { return this.branchOptions.options(); }

  private toMapping(d: MappingDraft): MetaMapping {
    const unit = parseUnitKey(d.branchKey);

    return { branch_type: unit?.type ?? null, branch_id: unit?.id ?? null, source_id: d.sourceId ? Number(d.sourceId) : null };
  }

  private setBusy(key: string, value: boolean): void {
    this.busy.update((b) => ({ ...b, [key]: value }));
  }

  private errorText(err: any): string {
    const errors = err?.error?.errors;
    const first = errors ? (Object.values(errors)[0] as string[] | undefined)?.[0] : null;

    return first || err?.error?.message || 'Please try again.';
  }
}
