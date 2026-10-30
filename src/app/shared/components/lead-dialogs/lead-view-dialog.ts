import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { CallerLogEntry } from '../../models/common-components.model';

export interface LeadViewData {
  id: number;
  name: string;
  /** Label / value pairs shown in the details grid, in order; empty values show as "-". */
  fields: { label: string; value: string | number | null | undefined; icon?: string }[];
  /** Shown when another telecaller holds the lead ("Ravi is on a call with this lead"). */
  lockedLabel?: string;
  callLog?: CallerLogEntry[];
}

/** Read-only view of a lead: its details and recent call notes. Nothing here can change the lead. */
@Component({
  selector: 'app-lead-view-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  template: `
    <div class="lv-dialog">
      <header class="lv-head">
        <span class="lv-icon"><i class="bi bi-person-vcard"></i></span>
        <div>
          <h2>{{ data.name }}</h2>
          <p>LD-{{ pad(data.id) }}</p>
        </div>
        <button type="button" class="lv-close" (click)="ref.close()" aria-label="Close"><i class="bi bi-x-lg"></i></button>
      </header>

      <div class="lv-body">
        @if (data.lockedLabel) {
          <p class="lv-lock"><i class="bi bi-headset"></i> {{ data.lockedLabel }}</p>
        }

        <dl class="lv-grid">
          @for (f of data.fields; track f.label) {
            <div class="lv-field">
              <dt>@if (f.icon) {<i class="bi" [class]="f.icon"></i>} {{ f.label }}</dt>
              <dd>{{ f.value === null || f.value === undefined || f.value === '' ? '-' : f.value }}</dd>
            </div>
          }
        </dl>

        <h3>Recent call notes</h3>
        @for (c of data.callLog ?? []; track $index) {
          <div class="lv-note">
            <div class="lv-note-top"><strong>{{ c.telecallerName }}</strong><time>{{ c.dateTime }}</time></div>
            <p>{{ c.notes || 'No note' }}</p>
          </div>
        } @empty {
          <p class="lv-muted">No calls logged yet.</p>
        }
      </div>
    </div>
  `,
  styles: [`
    .lv-dialog { display: flex; flex-direction: column; max-height: 86vh; color: var(--text-dark); }
    .lv-head { display: flex; align-items: center; gap: 12px; padding: 18px 20px 12px; border-bottom: 1px solid var(--border-soft);
      h2 { margin: 0; font-size: 17px; font-weight: 700; } p { margin: 2px 0 0; font-size: 12.5px; color: var(--text-muted); } }
    .lv-icon { width: 40px; height: 40px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 12px; font-size: 18px;
      background: var(--status-blue-bg); color: var(--status-blue-text); }
    .lv-close { margin-left: auto; border: 0; background: transparent; color: var(--text-muted); font-size: 16px; cursor: pointer; }
    .lv-body { overflow-y: auto; padding: 14px 20px 18px;
      h3 { margin: 18px 0 8px; font-size: 13px; font-weight: 700; } }
    .lv-lock { display: flex; align-items: center; gap: 6px; margin: 0 0 12px; padding: 8px 12px; border-radius: 10px; font-size: 12.5px;
      font-weight: 600; background: var(--status-gray-bg); color: var(--status-gray-text); }
    .lv-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 0; }
    .lv-field { padding: 8px 12px; border-radius: 12px; border: 1px solid var(--border-soft); min-width: 0;
      dt { font-size: 11px; color: var(--text-muted); i { margin-right: 2px; } }
      dd { margin: 2px 0 0; font-size: 13px; font-weight: 600; word-break: break-word; } }
    .lv-note { padding: 8px 12px; margin-bottom: 8px; border-radius: 12px; border: 1px solid var(--border-soft);
      p { margin: 4px 0 0; font-size: 12.5px; line-height: 1.4; word-break: break-word; } }
    .lv-note-top { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; font-size: 12px;
      time { font-size: 11px; color: var(--text-muted); } }
    .lv-muted { margin: 8px 0; text-align: center; font-size: 12.5px; color: var(--text-muted); }
    @media (max-width: 480px) {
      .lv-head, .lv-body { padding-left: 14px; padding-right: 14px; }
      .lv-grid { grid-template-columns: minmax(0, 1fr); }
    }
  `],
})
export class LeadViewDialog {
  readonly data = inject<LeadViewData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<LeadViewDialog>);

  pad(id: number): string {
    return String(id).padStart(5, '0');
  }
}

export function openLeadView(dialog: MatDialog, data: LeadViewData): MatDialogRef<LeadViewDialog> {
  return dialog.open(LeadViewDialog, {
    width: '560px',
    maxWidth: 'calc(100vw - 24px)',
    autoFocus: false,
    panelClass: 'lead-view-dialog',
    data,
  });
}
