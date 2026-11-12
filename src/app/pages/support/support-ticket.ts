import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/common-services/toast.service';
import { AutoModuleTabs } from '../../shared/components/module-tabs/auto-module-tabs';
import { saveBlob } from '../../shared/utils/export.util';
import { SupportConfig, TicketAttachment, TicketDetail, priorityTone, statusTone } from './support.model';
import { SupportService } from './support.service';

type Composer = 'reply' | 'note' | 'info';

/** The status moves the support team may make (mirrors config/support.php; the server enforces it). "Resolved" has its own button because it needs a description. */
const MOVES: Record<string, string[]> = {
  new: ['open', 'assigned', 'in_progress', 'waiting_for_user', 'closed'],
  open: ['assigned', 'in_progress', 'waiting_for_user', 'closed'],
  assigned: ['open', 'in_progress', 'waiting_for_user', 'closed'],
  in_progress: ['open', 'assigned', 'waiting_for_user', 'closed'],
  waiting_for_user: ['open', 'assigned', 'in_progress', 'closed'],
  resolved: ['in_progress', 'closed', 'reopened'],
  closed: ['reopened'],
  reopened: ['open', 'assigned', 'in_progress', 'waiting_for_user', 'closed'],
};

/**
 * One ticket. The same screen serves the reporter (route support/tickets/:no) and the support team (route support/admin/tickets/:no,
 * route data `admin`): the team additionally sees internal notes, the reporter and device details and the management panel.
 */
@Component({
  selector: 'app-support-ticket',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AutoModuleTabs],
  templateUrl: './support-ticket.html',
  styleUrl: './support.scss',
})
export class SupportTicketPage implements OnInit, OnDestroy {
  private readonly api = inject(SupportService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly admin = this.route.snapshot.data['admin'] === true;
  readonly no = this.route.snapshot.paramMap.get('no') ?? '';
  readonly statusTone = statusTone;
  readonly priorityTone = priorityTone;
  readonly stars = [1, 2, 3, 4, 5];

  t: TicketDetail | null = null;
  config: SupportConfig | null = null;
  agents: { id: number; name: string }[] = [];
  loading = true;
  error = '';
  busy = false;

  // conversation
  text = '';
  files: File[] = [];
  mode: Composer = 'reply';
  // reporter
  rating = 0;
  ratingComment = '';
  reopenRemarks = '';
  showReopen = false;
  // support team
  assignTo: number | '' = '';
  priority = 'medium';
  statusTo = '';
  statusRemarks = '';
  showResolve = false;
  resolution = '';
  closeRemarks = '';

  thumbs = new Map<number, string>();
  preview: { url: string; name: string } | null = null;

  get backLink(): string {
    return this.admin ? '/app/support/admin' : '/app/support/tickets';
  }
  get canManage(): boolean { return this.admin && this.auth.hasActionAccess('manage-support-tickets'); }
  get canReply(): boolean { return !this.admin || this.auth.hasActionAccess('reply-support-tickets'); }
  get canNote(): boolean { return this.admin && this.auth.hasActionAccess('add-support-internal-note'); }
  get moves(): { value: string; label: string }[] {
    const label = (v: string) => this.config?.statuses.find((s) => s.value === v)?.label ?? v;
    return (MOVES[this.t?.status ?? ''] ?? []).map((v) => ({ value: v, label: label(v) }));
  }

  ngOnInit(): void {
    this.api.config().subscribe({ next: (c) => (this.config = c), error: () => (this.config = null) });
    if (this.admin) {
      this.api.agents().subscribe({ next: (a) => (this.agents = a), error: () => (this.agents = []) });
    }
    this.load();
  }

  ngOnDestroy(): void {
    this.thumbs.forEach((u) => URL.revokeObjectURL(u));
  }

  load(): void {
    this.loading = true;
    this.api.ticket(this.no, this.admin).subscribe({
      next: (t) => { this.apply(t); this.loading = false; },
      error: async (e) => { this.loading = false; this.error = e?.status === 404 ? 'This ticket was not found.' : await this.api.errorMessage(e, 'The ticket could not be loaded.'); },
    });
  }

  private apply(t: TicketDetail): void {
    this.t = t;
    this.assignTo = this.admin ? (t.assigned_to?.id ?? '') : '';
    this.priority = t.priority;
    this.statusTo = '';
    [...t.attachments, ...t.messages.flatMap((m) => m.attachments)].filter((a) => a.is_image).forEach((a) => this.thumb(a));
  }

  private thumb(a: TicketAttachment): void {
    if (this.thumbs.has(a.id)) return;
    this.thumbs.set(a.id, '');
    this.api.blobUrl(a.url).subscribe({ next: (u) => this.thumbs.set(a.id, u), error: () => this.thumbs.delete(a.id) });
  }

  open(a: TicketAttachment): void {
    if (a.is_image) {
      const u = this.thumbs.get(a.id);
      if (u) this.preview = { url: u, name: a.file_name };
    } else {
      this.api.download(a.url).subscribe({ next: (b) => saveBlob(b, a.file_name), error: () => this.toast.error('Could not open the file.') });
    }
  }

  onFiles(input: HTMLInputElement): void {
    const cfg = this.config?.attachments;
    for (const f of Array.from(input.files ?? [])) {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      if (cfg && !cfg.allowed_extensions.includes(ext)) { this.toast.warning('File not allowed', `${f.name}: this file type is not allowed.`); continue; }
      if (cfg && f.size > cfg.max_kb * 1024) { this.toast.warning('File too large', `${f.name} is larger than ${Math.round(cfg.max_kb / 1024)} MB.`); continue; }
      if (cfg && this.files.length >= cfg.max_files) break;
      this.files.push(f);
    }
    input.value = '';
  }

  /** Runs one call, then shows the refreshed ticket and a success message; failures show the server's reason. */
  private run(call: Observable<TicketDetail>, ok: string, then?: () => void): void {
    if (this.busy) return;
    this.busy = true;
    call.subscribe({
      next: (t) => { this.busy = false; this.apply(t); if (ok) this.toast.success(ok); then?.(); },
      error: async (e) => { this.busy = false; this.toast.error('Not done', await this.api.errorMessage(e, 'Something went wrong. Please try again.')); },
    });
  }

  send(): void {
    const message = this.text.trim();
    if (!message) return;
    const form = new FormData();
    form.set('message', message);
    if (this.mode !== 'info') this.files.forEach((f) => form.append('attachments[]', f));
    const done = () => { this.text = ''; this.files = []; };

    if (this.admin && this.mode === 'note') this.run(this.api.act(this.no, 'notes', form), 'Internal note saved. Only the support team can see it.', done);
    else if (this.admin && this.mode === 'info') this.run(this.api.act(this.no, 'request-info', { message }), 'The reporter has been asked for more information.', done);
    else this.run(this.api.sendMessage(this.no, form, this.admin), this.admin ? 'Reply sent.' : 'Your message has been sent to the support team.', done);
  }

  // ---- reporter
  confirm(): void {
    this.run(this.api.confirmResolution(this.no, this.rating || null, this.ratingComment.trim()), 'Thank you. The ticket is closed.');
  }

  reopenAsReporter(): void {
    this.run(this.api.reopen(this.no, this.reopenRemarks.trim()), 'Your support ticket has been reopened for further investigation.', () => { this.showReopen = false; this.reopenRemarks = ''; });
  }

  // ---- support team
  saveAssignment(): void {
    this.run(this.api.act(this.no, 'assign', { assigned_to: this.assignTo === '' ? null : this.assignTo }), 'Assignment saved.');
  }

  savePriority(): void {
    this.run(this.api.act(this.no, 'priority', { priority: this.priority }, 'patch'), 'Priority updated.');
  }

  saveStatus(): void {
    if (!this.statusTo) return;
    this.run(this.api.act(this.no, 'status', { status: this.statusTo, remarks: this.statusRemarks.trim() }, 'patch'), 'Status updated.', () => (this.statusRemarks = ''));
  }

  resolve(): void {
    if (this.resolution.trim().length < 3) { this.toast.warning('Describe the fix', 'Write how the issue was resolved.'); return; }
    this.run(this.api.act(this.no, 'resolve', { resolution: this.resolution.trim() }), 'Marked as resolved. The reporter has been asked to confirm.', () => { this.showResolve = false; this.resolution = ''; });
  }

  closeTicket(): void {
    this.run(this.api.act(this.no, 'close', { remarks: this.closeRemarks.trim() }), 'Ticket closed.', () => (this.closeRemarks = ''));
  }

  reopenAsSupport(): void {
    this.run(this.api.act(this.no, 'reopen', {}), 'Ticket reopened.');
  }

  escalate(): void {
    this.run(this.api.act(this.no, 'escalate', {}), 'Ticket escalated.');
  }

  back(): void {
    this.router.navigate([this.backLink]);
  }
}
