import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ATTENDANCE_LABELS, TelecallerRow } from '../../../core/telephony/telephony.models';
import { TelephonyService } from '../../../core/telephony/telephony.service';
import { ToastService } from '../../common-services/toast.service';

export interface AssignCallerDialogData {
  leadIds: number[];
  /** One lead: its name; a reassignment of many: e.g. "5 leads of Arun Prasad". */
  subject: string;
  /** Telecaller who has the lead(s) now (offered last, flagged when absent). */
  currentId?: number | null;
  currentName?: string | null;
  /** The lead's branch / franchise key ("branch:9"): its telecallers are listed first. */
  branchKey?: string | null;
}

/**
 * Assign / reassign the telecaller who follows a lead up. Every telecaller shows today's attendance; absent ones
 * (Absent / On Leave / not checked in by the cut-off) cannot be picked, and the dialog warns when the current one is
 * absent - the branch manager hands the lead to someone who is in. Closes with true once saved.
 */
@Component({
  selector: 'app-assign-caller-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  template: `
    <div class="ac-dialog">
      <header class="ac-head">
        <span class="ac-icon"><i class="bi bi-person-gear"></i></span>
        <div>
          <h2>{{ data.currentId ? 'Reassign caller' : 'Assign caller' }}</h2>
          <p>{{ data.subject }}</p>
        </div>
        <button type="button" class="ac-close" (click)="close()" aria-label="Close"><i class="bi bi-x-lg"></i></button>
      </header>

      @if (currentAbsent(); as cur) {
        <div class="ac-alert" role="alert">
          <i class="bi bi-exclamation-triangle-fill"></i>
          <span><b>{{ cur.name }}</b> is {{ label(cur).toLowerCase() }} today. Pick a telecaller who is in to follow this up.</span>
        </div>
      } @else if (data.currentName) {
        <p class="ac-current">Currently followed by <b>{{ data.currentName }}</b></p>
      }

      <label class="ac-search">
        <i class="bi bi-search"></i>
        <input type="search" [(ngModel)]="query" placeholder="Search telecaller" aria-label="Search telecaller" />
      </label>

      <div class="ac-list" role="radiogroup" aria-label="Telecallers">
        @if (loading()) {
          <p class="ac-muted">Loading telecallers…</p>
        } @else {
          @for (t of visible(); track t.id) {
            <button type="button" role="radio" class="ac-row" [attr.aria-checked]="picked() === t.id"
                    [class.is-picked]="picked() === t.id" [class.is-absent]="t.attendance?.absent" [class.is-current]="t.id === data.currentId"
                    [disabled]="t.attendance?.absent || t.id === data.currentId" (click)="picked.set(t.id)">
              <span class="ac-avatar">{{ initials(t.name) }}</span>
              <span class="ac-main">
                <strong>{{ t.name }} @if (t.id === data.currentId) { <em>(current)</em> }</strong>
                <small>{{ t.branch?.name || 'No branch' }} · {{ t.assigned_leads_count }} leads</small>
              </span>
              <span class="ac-badge" [class]="'att-' + (t.attendance?.state || 'no_employee')">{{ label(t) }}</span>
              <span class="ac-dot" [class]="'st-' + t.status" [title]="'Call status: ' + t.status"></span>
            </button>
          } @empty {
            <p class="ac-muted">No telecallers match.</p>
          }
        }
      </div>

      <footer class="ac-foot">
        <button type="button" class="ac-btn ghost" (click)="close()">Cancel</button>
        <button type="button" class="ac-btn" [disabled]="!picked() || saving()" (click)="save()">
          {{ saving() ? 'Saving…' : (data.leadIds.length > 1 ? 'Reassign ' + data.leadIds.length + ' leads' : 'Assign') }}
        </button>
      </footer>
    </div>
  `,
  styles: [`
    .ac-dialog { display: flex; flex-direction: column; gap: 12px; padding: 18px 20px; max-height: 88vh; color: var(--text-dark); }
    .ac-head { display: flex; align-items: center; gap: 12px;
      h2 { margin: 0; font-size: 17px; font-weight: 700; }
      p { margin: 2px 0 0; font-size: 12.5px; color: var(--text-muted); } }
    .ac-icon { width: 40px; height: 40px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 12px; font-size: 18px;
      background: var(--status-orange-bg); color: var(--status-orange-text); }
    .ac-close { margin-left: auto; border: 0; background: transparent; color: var(--text-muted); font-size: 16px; cursor: pointer; }
    .ac-alert { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 12px; font-size: 12.5px;
      background: var(--status-red-bg); color: var(--status-red-text); i { margin-top: 1px; } }
    .ac-current { margin: 0; font-size: 12.5px; color: var(--text-muted); }
    .ac-search { display: flex; align-items: center; gap: 8px; padding: 0 12px; height: 38px; border-radius: 10px;
      border: 1px solid var(--border-soft); i { color: var(--text-muted); }
      input { flex: 1; border: 0; outline: 0; background: transparent; font-size: 13px; color: inherit; } }
    .ac-list { display: flex; flex-direction: column; gap: 6px; overflow-y: auto; min-height: 120px; max-height: 50vh; padding-right: 2px; }
    .ac-row { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; text-align: left; cursor: pointer;
      border-radius: 12px; border: 1px solid var(--border-soft); background: var(--app-surface-solid); color: inherit; transition: border-color .15s, background .15s;
      &:hover:not(:disabled) { border-color: var(--primary); }
      &.is-picked { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 7%, var(--app-surface-solid)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 12%, transparent); }
      &:disabled { cursor: not-allowed; opacity: .55; }
      &.is-absent { background: color-mix(in srgb, var(--status-gray-bg) 60%, var(--app-surface-solid)); } }
    .ac-avatar { width: 34px; height: 34px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 50%; font-size: 11.5px; font-weight: 700;
      background: var(--primary-soft); color: var(--primary); }
    .ac-main { flex: 1; min-width: 0; display: flex; flex-direction: column;
      strong { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; em { font-weight: 500; color: var(--text-muted); } }
      small { font-size: 11.5px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } }
    .ac-badge { flex: 0 0 auto; padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 600; background: var(--status-gray-bg); color: var(--status-gray-text);
      &.att-on_duty { background: var(--status-green-bg); color: var(--status-green-text); }
      &.att-absent, &.att-on_leave { background: var(--status-red-bg); color: var(--status-red-text); }
      &.att-not_checked_in { background: var(--status-orange-bg); color: var(--status-orange-text); } }
    .ac-dot { width: 8px; height: 8px; flex: 0 0 auto; border-radius: 50%; background: var(--status-gray-text);
      &.st-available { background: #18a865; } &.st-on_call { background: #ea4d5f; } &.st-break, &.st-busy, &.st-away { background: #f39a1d; } }
    .ac-muted { margin: 12px 0; text-align: center; font-size: 12.5px; color: var(--text-muted); }
    .ac-foot { display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px; }
    .ac-btn { border: 0; border-radius: 10px; padding: 9px 18px; font-size: 13px; font-weight: 600; cursor: pointer; background: var(--primary); color: #fff;
      &:disabled { opacity: .5; cursor: not-allowed; }
      &.ghost { background: transparent; color: var(--text-dark); border: 1px solid var(--border-soft); } }
    @media (max-width: 480px) { .ac-dialog { padding: 14px; } .ac-dot { display: none; } }
  `],
})
export class AssignCallerDialog {
  readonly data = inject<AssignCallerDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<AssignCallerDialog, boolean>);
  private readonly telephony = inject(TelephonyService);
  private readonly toast = inject(ToastService);

  readonly telecallers = signal<TelecallerRow[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly picked = signal<number | null>(null);
  readonly search = signal('');

  get query(): string { return this.search(); }
  set query(v: string) { this.search.set(v); }

  /** Present first, the lead's own branch / franchise first among them, then by name. */
  readonly visible = computed(() => {
    const q = this.search().trim().toLowerCase();
    const rank = (t: TelecallerRow) => (t.attendance?.absent ? 2 : 0) + (this.data.branchKey && t.branch?.key !== this.data.branchKey ? 1 : 0);
    return this.telecallers()
      .filter(t => !q || t.name.toLowerCase().includes(q) || (t.branch?.name ?? '').toLowerCase().includes(q))
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  });
  readonly currentAbsent = computed(() => this.telecallers().find(t => t.id === this.data.currentId && t.attendance?.absent) ?? null);

  constructor() {
    this.telephony.telecallers().subscribe({
      next: rows => { this.telecallers.set(rows); this.loading.set(false); },
      error: () => { this.loading.set(false); this.toast.error('Could not load telecallers.'); },
    });
  }

  label(t: TelecallerRow): string {
    return ATTENDANCE_LABELS[t.attendance?.state ?? 'no_employee'];
  }

  initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  }

  close(): void {
    this.ref.close(false);
  }

  save(): void {
    const id = this.picked();
    if (!id || this.saving()) return;
    this.saving.set(true);
    this.telephony.assignLeads(this.data.leadIds, id).subscribe({
      next: (res: any) => {
        this.toast.success(res?.message || 'Telecaller assigned.');
        this.ref.close(true);
      },
      error: (err: any) => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || 'Could not assign the telecaller.');
      },
    });
  }
}

export function openAssignCaller(dialog: MatDialog, data: AssignCallerDialogData): MatDialogRef<AssignCallerDialog, boolean> {
  return dialog.open(AssignCallerDialog, {
    width: '520px',
    maxWidth: 'calc(100vw - 24px)',
    autoFocus: false,
    panelClass: 'assign-caller-dialog',
    data,
  });
}
