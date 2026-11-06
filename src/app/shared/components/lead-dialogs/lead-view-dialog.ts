import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { CallerLogEntry } from '../../models/common-components.model';
import { splitCallNote } from '../../utils/call-note.util';

export interface LeadViewField {
  label: string;
  value: string | number | null | undefined;
  icon?: string;
}

export interface LeadViewData {
  id: number;
  name: string;
  /** Label / value pairs shown in the details grid, in order; empty values show as "-". Used when `sections` is not given. */
  fields: LeadViewField[];
  /** Details grouped under headings (Contact, Service, ...). Takes the place of `fields`. */
  sections?: { title: string; icon: string; fields: LeadViewField[] }[];
  /** Lead status shown as a badge under the name ("Follow-Ups", "Hot-Leads"). */
  status?: string;
  /** Contact number: shown in the header with a tap-to-copy button. */
  phone?: string;
  /** Headline figures in the strip under the header (e.g. follow-up count, next call-back, type). */
  stats?: { label: string; value: string | number | null | undefined; icon: string }[];
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
        <button type="button" class="lv-close" (click)="ref.close()" aria-label="Close"><i class="bi bi-x-lg"></i></button>
        <span class="lv-avatar"><span class="lv-ring"></span>{{ initials(data.name) }}</span>
        <div class="lv-who">
          <h2>{{ data.name }}</h2>
          <div class="lv-tags">
            <span class="lv-code"><i class="bi bi-hash"></i>LD-{{ pad(data.id) }}</span>
            @if (data.status) { <span class="lv-status">{{ data.status }}</span> }
          </div>
          @if (data.phone) {
            <button type="button" class="lv-phone" (click)="copy(data.phone)" [title]="'Copy ' + data.phone">
              <i class="bi bi-telephone-fill"></i> {{ data.phone }}
              <span class="lv-copy"><i class="bi" [class.bi-clipboard]="!copied()" [class.bi-clipboard-check-fill]="copied()"></i> {{ copied() ? 'Copied' : 'Copy' }}</span>
            </button>
          }
        </div>
      </header>

      @if (data.stats?.length) {
        <div class="lv-stats">
          @for (s of data.stats; track s.label; let i = $index) {
            <div class="lv-stat" [style.animation-delay.ms]="120 + i * 70">
              <i class="bi" [class]="s.icon"></i>
              <strong>{{ s.value === null || s.value === undefined || s.value === '' ? '-' : s.value }}</strong>
              <span>{{ s.label }}</span>
            </div>
          }
        </div>
      }

      <div class="lv-body">
        @if (data.lockedLabel) {
          <p class="lv-lock"><i class="bi bi-headset"></i> {{ data.lockedLabel }}</p>
        }

        @for (sec of groups(); track sec.title; let si = $index) {
          <section class="lv-sec" [style.animation-delay.ms]="200 + si * 90">
            <h3><i class="bi" [class]="sec.icon"></i> {{ sec.title }}</h3>
            <dl class="lv-grid">
              @for (f of sec.fields; track f.label) {
                <div class="lv-field">
                  <dt><i class="bi" [class]="f.icon || 'bi-dot'"></i></dt>
                  <dd>
                    <small>{{ f.label }}</small>
                    <b>{{ f.value === null || f.value === undefined || f.value === '' ? '-' : f.value }}</b>
                  </dd>
                </div>
              }
            </dl>
          </section>
        }

        <section class="lv-sec" [style.animation-delay.ms]="200 + groups().length * 90">
          <h3><i class="bi bi-chat-left-text"></i> Recent call notes <em>{{ (data.callLog ?? []).length }}</em></h3>
          <ol class="lv-timeline">
            @for (c of data.callLog ?? []; track $index; let i = $index) {
              <li class="lv-note" [style.animation-delay.ms]="320 + i * 70">
                <span class="lv-dot">{{ initials(c.telecallerName) }}</span>
                <div class="lv-card">
                  <div class="lv-note-top"><strong>{{ c.telecallerName }}</strong><time><i class="bi bi-clock"></i> {{ c.dateTime }}</time></div>
                  @if (note(c.notes); as n) {
                    @if (n.head) { <p class="lv-slot">{{ n.head }}</p> }
                    <p [class.lv-reminder]="n.head">@if (n.head) { <b>Reminder:</b> }{{ n.reminder || (n.head ? '-' : 'No note') }}</p>
                  }
                </div>
              </li>
            } @empty {
              <li class="lv-empty"><i class="bi bi-telephone-x"></i> No calls logged yet.</li>
            }
          </ol>
        </section>
      </div>
    </div>
  `,
  styles: [`
    .lv-dialog { display: flex; flex-direction: column; max-height: 90vh; color: var(--text-dark, #163b35); animation: lv-pop .4s cubic-bezier(.2, 1.1, .3, 1) both; }

    /* ---- banner ---- */
    .lv-head { position: relative; display: flex; align-items: center; gap: 16px; padding: 22px 56px 22px 22px; color: #fff;
      background: radial-gradient(120% 140% at 100% 0%, rgba(255,255,255,.22), transparent 55%), linear-gradient(135deg, #0d5c4b 0%, #14917a 100%); }
    .lv-close { position: absolute; top: 12px; right: 12px; width: 32px; height: 32px; border: 0; border-radius: 50%; cursor: pointer;
      background: rgba(255,255,255,.18); color: #fff; font-size: 13px; transition: background .15s, transform .2s;
      &:hover { background: rgba(255,255,255,.32); transform: rotate(90deg); } }
    .lv-avatar { position: relative; flex: 0 0 auto; width: 64px; height: 64px; display: grid; place-items: center; border-radius: 50%;
      font-size: 22px; font-weight: 800; letter-spacing: .02em; background: #fff; color: #0d5c4b; box-shadow: 0 10px 24px -10px rgba(0,0,0,.45); }
    .lv-ring { position: absolute; inset: -5px; border-radius: 50%; border: 2px solid rgba(255,255,255,.7); animation: lv-ring 2.4s ease-out infinite; }
    .lv-who { min-width: 0; display: flex; flex-direction: column; gap: 6px;
      h2 { margin: 0; font-size: 21px; font-weight: 800; line-height: 1.15; overflow-wrap: anywhere; } }
    .lv-tags { display: flex; flex-wrap: wrap; gap: 6px; }
    .lv-code, .lv-status { display: inline-flex; align-items: center; gap: 2px; padding: 2px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 700; }
    .lv-code { background: rgba(255,255,255,.18); }
    .lv-status { background: #fff; color: #0d5c4b; }
    .lv-phone { align-self: flex-start; display: inline-flex; align-items: center; gap: 8px; padding: 4px 6px 4px 12px; border: 0; border-radius: 999px;
      font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; cursor: pointer; color: #fff; background: rgba(255,255,255,.16); transition: background .15s;
      &:hover { background: rgba(255,255,255,.28); }
      .lv-copy { padding: 2px 9px; border-radius: 999px; font-size: 11px; background: rgba(255,255,255,.22); } }

    /* ---- headline figures ---- */
    .lv-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; padding: 14px 20px 0; margin-top: -1px; background: var(--app-surface-solid, #fff); }
    .lv-stat { display: grid; justify-items: start; gap: 2px; padding: 10px 12px; border-radius: 14px; background: var(--bg-light-green-soft, #f4faf8); border: 1px solid var(--border-soft, rgba(17,95,78,.12));
      opacity: 0; animation: lv-up .4s ease-out forwards;
      i { font-size: 15px; color: #14917a; } strong { font-size: 15px; font-weight: 800; line-height: 1.2; overflow-wrap: anywhere; } span { font-size: 11px; color: var(--text-muted, #6a837d); } }

    .lv-body { overflow-y: auto; padding: 14px 20px 20px; }
    .lv-lock { display: flex; align-items: center; gap: 6px; margin: 0 0 12px; padding: 9px 12px; border-radius: 12px; font-size: 12.5px; font-weight: 600;
      background: #fff4e0; color: #a05a00; border: 1px solid #f6d493; }

    .lv-sec { margin-top: 16px; opacity: 0; animation: lv-up .45s ease-out forwards;
      h3 { display: flex; align-items: center; gap: 7px; margin: 0 0 8px; font-size: 12px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #0d5c4b;
        i { font-size: 14px; } em { margin-left: 2px; padding: 0 8px; border-radius: 999px; font-style: normal; font-size: 11px; background: #e3f3ee; } } }

    .lv-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0; }
    .lv-field { display: flex; align-items: center; gap: 10px; padding: 9px 12px; min-width: 0; border-radius: 14px; border: 1px solid var(--border-soft, rgba(17,95,78,.12));
      background: var(--app-surface-solid, #fff); transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease;
      &:hover { transform: translateY(-2px); border-color: #14917a; box-shadow: 0 10px 20px -14px rgba(13,92,75,.7); }
      dt { flex: 0 0 auto; width: 32px; height: 32px; display: grid; place-items: center; border-radius: 10px; font-size: 14px; background: #e3f3ee; color: #0d5c4b; }
      dd { margin: 0; min-width: 0; display: flex; flex-direction: column;
        small { font-size: 11px; color: var(--text-muted, #6a837d); }
        b { font-size: 13px; font-weight: 700; overflow-wrap: anywhere; } } }

    /* ---- call notes as a timeline ---- */
    .lv-timeline { list-style: none; margin: 0; padding: 0 0 0 6px; position: relative;
      &::before { content: ''; position: absolute; left: 21px; top: 8px; bottom: 8px; width: 2px; background: linear-gradient(#bfe3d8, transparent); } }
    .lv-note { position: relative; display: flex; gap: 12px; margin-bottom: 10px; opacity: 0; animation: lv-up .4s ease-out forwards; }
    .lv-dot { z-index: 1; flex: 0 0 32px; height: 32px; display: grid; place-items: center; border-radius: 50%; font-size: 11px; font-weight: 800;
      background: #0d5c4b; color: #fff; box-shadow: 0 0 0 4px var(--app-surface-solid, #fff); }
    .lv-card { flex: 1; min-width: 0; padding: 9px 12px; border-radius: 14px; border: 1px solid var(--border-soft, rgba(17,95,78,.12)); background: var(--bg-light-green-soft, #f7fbfa);
      p { margin: 4px 0 0; font-size: 12.5px; line-height: 1.45; overflow-wrap: anywhere; } }
    .lv-note-top { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; font-size: 12.5px;
      time { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-muted, #6a837d); } }
    .lv-empty { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 16px; border-radius: 14px; border: 1px dashed var(--border-soft, rgba(17,95,78,.2));
      font-size: 12.5px; color: var(--text-muted, #6a837d); }

    .lv-slot { font-weight: 600; color: #0d5c4b; } .lv-reminder b { color: var(--text-muted, #6a837d); font-weight: 700; margin-right: 4px; }

    @keyframes lv-pop { from { opacity: 0; transform: translateY(18px) scale(.96); } to { opacity: 1; transform: none; } }
    @keyframes lv-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    @keyframes lv-ring { 0% { transform: scale(.92); opacity: .9; } 100% { transform: scale(1.25); opacity: 0; } }

    @media (max-width: 480px) {
      .lv-head { padding-left: 14px; gap: 12px; } .lv-avatar { width: 52px; height: 52px; font-size: 18px; }
      .lv-body, .lv-stats { padding-left: 14px; padding-right: 14px; }
      .lv-grid { grid-template-columns: minmax(0, 1fr); }
    }
    @media (prefers-reduced-motion: reduce) {
      .lv-dialog, .lv-ring, .lv-stat, .lv-sec, .lv-note { animation: none !important; opacity: 1; }
    }
  `],
})
export class LeadViewDialog {
  readonly data = inject<LeadViewData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<LeadViewDialog>);
  readonly copied = signal(false);

  /** The sections to show: the ones given, else all `fields` in one "Details" section. */
  groups(): { title: string; icon: string; fields: LeadViewField[] }[] {
    return this.data.sections?.length ? this.data.sections : [{ title: 'Details', icon: 'bi-person-vcard', fields: this.data.fields }];
  }

  /** The note split into its follow-up slot line and the reminder text. */
  note(notes: string | null | undefined) {
    return splitCallNote(notes);
  }

  pad(id: number): string {
    return String(id).padStart(5, '0');
  }

  initials(name: string): string {
    return (name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
  }

  copy(text: string): void {
    void navigator.clipboard?.writeText(text).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1600);
    }).catch(() => undefined);
  }
}

export function openLeadView(dialog: MatDialog, data: LeadViewData): MatDialogRef<LeadViewDialog> {
  return dialog.open(LeadViewDialog, {
    width: '600px',
    maxWidth: 'calc(100vw - 24px)',
    autoFocus: false,
    panelClass: 'lead-view-dialog',
    data,
  });
}
