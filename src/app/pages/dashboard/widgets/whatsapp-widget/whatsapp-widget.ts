import { Component, computed, ViewEncapsulation } from '@angular/core';
import { WhatsAppDashData } from '../../../../shared/models/dashboard.model';
import { DashCard } from '../dash-card/dash-card';
import { DashWidget } from '../dash-widget';

/**
 * WhatsApp Messaging (Settings -> WhatsApp Business) on the main dashboard: messages sent / delivered / read / failed in
 * the period, conversations, template review state and the most used templates. Only accounts the user may see count.
 */
@Component({
  selector: 'app-whatsapp-widget',
  standalone: true,
  imports: [DashCard],
  templateUrl: './whatsapp-widget.html',
  styleUrl: './whatsapp-widget.scss',
  // Rules are scoped under .dash-page like the page sheet, so they are not encapsulated either.
  encapsulation: ViewEncapsulation.None,
})
export class WhatsAppWidget extends DashWidget<WhatsAppDashData> {
  protected readonly key = 'whatsapp' as const;

  /** Bar heights (0-100) of the sent / received trend. */
  readonly bars = computed(() => {
    const t = this.data()?.trend ?? [];
    const max = Math.max(1, ...t.map(x => Math.max(x.sent, x.received)));
    return t.map(x => ({ ...x, s: Math.round((x.sent / max) * 100), r: Math.round((x.received / max) * 100) }));
  });

  readonly topMax = computed(() => Math.max(1, ...(this.data()?.top_templates ?? []).map(x => x.value)));

  pct(v: number | null): string {
    return v === null ? '—' : `${v}%`;
  }
}
