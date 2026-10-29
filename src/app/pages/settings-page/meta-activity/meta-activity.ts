import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import Swal from 'sweetalert2';
import { CanActionDirective } from '../../../shared/directives/can-action.directive';
import {
  MetaEvent,
  MetaEventStatus,
  MetaEventsPage,
  MetaIntegrationService,
  MetaLogsPage,
} from '../../../shared/common-services/meta-integration.service';
import { ToastService } from '../../../shared/common-services/toast.service';

const STATUS_META: Record<MetaEventStatus, { label: string; tone: string; icon: string }> = {
  received: { label: 'Event received', tone: 'info', icon: 'bi-inbox' },
  processing: { label: 'Processing', tone: 'info', icon: 'bi-hourglass-split' },
  imported: { label: 'Imported', tone: 'ok', icon: 'bi-check-circle-fill' },
  duplicate: { label: 'Duplicate skipped', tone: '', icon: 'bi-files' },
  needs_review: { label: 'Needs manual review', tone: 'warn', icon: 'bi-eye' },
  retry_pending: { label: 'Failed, retry pending', tone: 'warn', icon: 'bi-arrow-repeat' },
  permission_issue: { label: 'Permission / token issue', tone: 'bad', icon: 'bi-shield-exclamation' },
  failed: { label: 'Failed', tone: 'bad', icon: 'bi-x-octagon-fill' },
};

const REASONS: Record<string, string> = {
  page_not_connected: 'Page not connected',
  import_disabled: 'Import disabled for the Page',
  missing_phone: 'Missing / invalid phone number',
  lead_unreadable: 'Meta no longer returns the lead',
  request_rejected: 'Meta rejected the request',
};

/** Settings -> Meta Lead Ads -> Activity: every lead notification and what happened to it, plus the audit / activity log. */
@Component({
  selector: 'app-meta-activity',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, CanActionDirective],
  templateUrl: './meta-activity.html',
  styleUrl: './meta-activity.scss',
})
export class MetaActivity implements OnInit {
  private readonly meta = inject(MetaIntegrationService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  readonly statuses = Object.keys(STATUS_META) as MetaEventStatus[];

  readonly tab = signal<'events' | 'logs'>('events');
  readonly events = signal<MetaEventsPage | null>(null);
  readonly logs = signal<MetaLogsPage | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly busyId = signal<number | null>(null);

  status: MetaEventStatus | '' = '';
  pageId = '';
  search = '';
  level = '';
  page = 1;

  ngOnInit(): void {
    this.pageId = this.route.snapshot.queryParamMap.get('page_id') ?? '';
    this.reload();
  }

  setTab(tab: 'events' | 'logs'): void {
    this.tab.set(tab);
    this.page = 1;
    this.reload();
  }

  filterStatus(status: MetaEventStatus | ''): void {
    this.status = this.status === status ? '' : status;
    this.page = 1;
    this.reload();
  }

  go(page: number): void {
    this.page = page;
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(null);
    const done = () => this.loading.set(false);
    const fail = (err: any) => {
      done();
      this.error.set(err?.error?.message || 'Could not load the activity.');
    };

    if (this.tab() === 'events') {
      this.meta.events({ status: this.status, page_id: this.pageId, search: this.search.trim(), page: this.page }).subscribe({ next: (r) => { this.events.set(r); done(); }, error: fail });
    } else {
      this.meta.logs({ level: this.level, page: this.page }).subscribe({ next: (r) => { this.logs.set(r); done(); }, error: fail });
    }
  }

  retry(e: MetaEvent): void {
    this.busyId.set(e.id);
    this.meta.retry(e.id).subscribe({
      next: () => { this.busyId.set(null); this.toast.success('Queued again', 'The lead will be processed shortly.'); this.reload(); },
      error: (err) => { this.busyId.set(null); this.toast.error('Could not retry', err?.error?.message || 'Please try again.'); },
    });
  }

  async resolve(e: MetaEvent): Promise<void> {
    const answer = await Swal.fire({
      title: 'Enter the phone number',
      text: 'This lead has no usable phone number. Enter the customer\'s 10-digit mobile to import it.',
      input: 'tel',
      inputPlaceholder: '98765 43210',
      showCancelButton: true,
      confirmButtonText: 'Import lead',
      confirmButtonColor: '#6C63FF',
      inputValidator: (v) => (/^\D*(?:\+?91)?\D*[6-9](?:\D*\d){9}\D*$/.test(v) ? undefined : 'Enter a valid 10-digit mobile number.'),
    });
    if (!answer.isConfirmed) return;

    this.busyId.set(e.id);
    this.meta.resolve(e.id, String(answer.value)).subscribe({
      next: () => { this.busyId.set(null); this.toast.success('Lead queued for import'); this.reload(); },
      error: (err) => {
        this.busyId.set(null);
        const first = err?.error?.errors ? (Object.values(err.error.errors)[0] as string[])?.[0] : null;
        this.toast.error('Could not import', first || err?.error?.message || 'Please try again.');
      },
    });
  }

  statusLabel(s: MetaEventStatus): string { return STATUS_META[s]?.label ?? s; }
  statusTone(s: MetaEventStatus): string { return STATUS_META[s]?.tone ?? ''; }
  statusIcon(s: MetaEventStatus): string { return STATUS_META[s]?.icon ?? 'bi-dot'; }
  reason(code: string | null): string { return code ? (REASONS[code] ?? code) : ''; }
  count(s: MetaEventStatus): number { return this.events()?.summary.by_status[s] ?? 0; }
  ctx(row: { context: Record<string, unknown> | null }): string { return row.context ? JSON.stringify(row.context) : ''; }
}
