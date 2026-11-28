import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/common-services/toast.service';
import { WhatsAppApiService } from '../whatsapp-api.service';
import { WhatsAppContextService } from '../whatsapp-context.service';
import { WaFlow, WaFlowStep, WaTemplate } from '../whatsapp.models';

interface EditorStep extends WaFlowStep {
  values: { body: string[]; header: { text?: string; link?: string }; buttons: Record<number, string> };
}

interface Editor {
  id: number | null;
  account_id: number | null;
  name: string;
  start_template_id: number | null;
  start_on_new_conversation: boolean;
  is_active: boolean;
  steps: EditorStep[];
}

const ADD_NEW = -1;

/**
 * Automation Rules -> Template flows. A flow chains approved templates by their quick-reply buttons: the customer taps
 * "View details" -> the details template is sent; its "Pay now" -> the payment template; "Back" can return to an
 * earlier template (loops are fine - loop protection caps automatic messages per conversation). Website / call buttons
 * leave WhatsApp, so they end the flow.
 */
@Component({
  selector: 'app-wa-flows',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './wa-flows.html',
  styleUrl: './wa-flows.scss',
})
export class WaFlows implements OnInit {
  private readonly api = inject(WhatsAppApiService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  readonly ctx = inject(WhatsAppContextService);

  readonly flows = signal<WaFlow[]>([]);
  readonly loading = signal(true);
  readonly templates = signal<WaTemplate[]>([]);
  readonly editor = signal<Editor | null>(null);
  readonly saving = signal(false);
  readonly busy = signal<Record<number, boolean>>({});
  readonly serverErrors = signal<Record<string, string>>({});
  readonly tick = signal(0);
  readonly ADD_NEW = ADD_NEW;

  readonly canManage = computed(() => this.auth.hasActionAccess('manage-whatsapp-automation'));
  readonly accounts = computed(() => this.ctx.accounts().filter(a => a.status === 'connected'));
  readonly byId = computed(() => new Map(this.templates().map(t => [t.id, t])));
  /** Templates not yet in the flow (to add as the next step). */
  readonly available = computed(() => {
    this.tick();
    const used = new Set(this.editor()?.steps.map(s => s.template_id) ?? []);
    return this.templates().filter(t => !used.has(t.id) && t.category !== 'AUTHENTICATION');
  });

  constructor() {
    effect(() => {
      this.ctx.accountId();
      untracked(() => this.load());
    });
  }

  ngOnInit(): void {
    this.ctx.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.flows(this.ctx.accountId()).subscribe({
      next: rows => { this.flows.set(rows); this.loading.set(false); },
      error: err => { this.loading.set(false); this.toast.error('Could not load flows', err?.error?.message); },
    });
  }

  // ------------------------------------------------------------------ editor

  newFlow(): void {
    const accountId = this.ctx.accountId() ?? this.accounts()[0]?.id ?? null;
    this.editor.set({ id: null, account_id: accountId, name: '', start_template_id: null, start_on_new_conversation: false, is_active: true, steps: [] });
    this.serverErrors.set({});
    this.loadTemplates(accountId);
  }

  edit(f: WaFlow): void {
    this.editor.set({
      id: f.id, account_id: f.account_id, name: f.name, start_template_id: f.start_template_id, start_on_new_conversation: f.start_on_new_conversation,
      is_active: f.is_active,
      steps: f.steps.map(s => ({
        template_id: s.template_id,
        buttons: s.buttons.map(b => ({ ...b })),
        values: { body: [...(s.values?.body ?? [])], header: { ...(s.values?.header ?? {}) }, buttons: { ...(s.values?.buttons ?? {}) } },
      })),
    });
    this.serverErrors.set({});
    this.loadTemplates(f.account_id);
  }

  close(): void {
    this.editor.set(null);
  }

  onAccountChange(id: number): void {
    const e = this.editor();
    if (!e) return;
    e.account_id = id;
    e.steps = [];
    e.start_template_id = null;
    this.loadTemplates(id);
    this.touch();
  }

  private loadTemplates(accountId: number | null): void {
    this.templates.set([]);
    if (!accountId) return;
    this.api.templates({ account_id: accountId, sendable: 1, per_page: 200 }).subscribe({
      next: r => { this.templates.set(r.page?.data ?? []); this.touch(); },
    });
  }

  setStart(templateId: number): void {
    const e = this.editor();
    if (!e) return;
    if (!e.steps.some(s => s.template_id === templateId)) e.steps.unshift(this.makeStep(templateId));
    e.start_template_id = templateId;
    this.touch();
  }

  /** The button's next template: an existing step (loop / shared target), a new step, or nothing. */
  link(step: EditorStep, buttonIndex: number, value: number | null): void {
    const e = this.editor()!;
    step.buttons[buttonIndex].next_template_id = value && value !== ADD_NEW ? value : null;
    this.touch();
  }

  addAndLink(step: EditorStep, buttonIndex: number, templateId: number | null): void {
    if (!templateId) return;
    const e = this.editor()!;
    if (!e.steps.some(s => s.template_id === templateId)) {
      const at = e.steps.indexOf(step);
      e.steps.splice(at + 1, 0, this.makeStep(templateId));
    }
    step.buttons[buttonIndex].next_template_id = templateId;
    this.touch();
  }

  removeStep(step: EditorStep): void {
    const e = this.editor()!;
    e.steps = e.steps.filter(s => s !== step);
    e.steps.forEach(s => s.buttons.forEach(b => { if (b.next_template_id === step.template_id) b.next_template_id = null; }));
    if (e.start_template_id === step.template_id) e.start_template_id = e.steps[0]?.template_id ?? null;
    this.touch();
  }

  private makeStep(templateId: number): EditorStep {
    const t = this.byId().get(templateId);
    const params = t?.parameters;
    return {
      template_id: templateId,
      buttons: quickReplies(t).map(text => ({ text, next_template_id: null })),
      values: { body: Array.from({ length: params?.body ?? 0 }, (_, i) => (i === 0 ? '{name}' : '')), header: {}, buttons: {} },
    };
  }

  save(): void {
    const e = this.editor();
    if (!e) return;
    if (!e.name.trim()) { this.toast.warning('Name the flow'); return; }
    if (!e.start_template_id) { this.toast.warning('Choose the first template'); return; }
    this.saving.set(true);
    this.serverErrors.set({});
    const body: any = {
      name: e.name.trim(), start_template_id: e.start_template_id, start_on_new_conversation: e.start_on_new_conversation, is_active: e.is_active,
      steps: e.steps.map(s => ({ template_id: s.template_id, values: s.values, buttons: s.buttons })),
    };
    if (!e.id) body.account_id = e.account_id;
    this.api.saveFlow(e.id, body).subscribe({
      next: r => {
        this.saving.set(false);
        this.toast.success('Flow saved', r.message);
        this.editor.set(null);
        this.load();
      },
      error: err => {
        this.saving.set(false);
        const errors = err?.error?.errors ?? {};
        const flat: Record<string, string> = {};
        Object.entries(errors).forEach(([k, v]) => (flat[k] = Array.isArray(v) ? String(v[0]) : String(v)));
        this.serverErrors.set(flat);
        this.toast.error('Flow not saved', Object.values(flat)[0] || err?.error?.message || 'Check the flow.');
      },
    });
  }

  // ------------------------------------------------------------------ list actions

  toggle(f: WaFlow): void {
    this.busy.update(b => ({ ...b, [f.id]: true }));
    this.api.toggleFlow(f.id, !f.is_active).subscribe({
      next: r => { this.busy.update(b => ({ ...b, [f.id]: false })); this.flows.update(list => list.map(x => (x.id === f.id ? r.data : x))); },
      error: err => { this.busy.update(b => ({ ...b, [f.id]: false })); this.toast.error('Not changed', err?.error?.errors ? Object.values(err.error.errors).flat()[0] as string : err?.error?.message); },
    });
  }

  async remove(f: WaFlow): Promise<void> {
    if (!(await this.toast.confirm(`Delete the flow "${f.name}"?`, 'Button clicks will no longer send its templates.'))) return;
    this.api.deleteFlow(f.id).subscribe({ next: () => { this.toast.success('Flow deleted'); this.load(); } });
  }

  // ------------------------------------------------------------------ view helpers

  tpl(id: number | null | undefined): WaTemplate | undefined {
    return id ? this.byId().get(id) : undefined;
  }

  nameOf(id: number | null | undefined): string {
    return this.tpl(id)?.name ?? (id ? `#${id}` : '');
  }

  /** Website / call / copy-code buttons: shown as the ways a step can end. */
  otherButtons(id: number): { type: string; text: string }[] {
    const t = this.tpl(id);
    const buttons = (t?.components ?? []).find((c: any) => String(c.type).toUpperCase() === 'BUTTONS')?.buttons ?? [];
    return buttons.filter((b: any) => String(b.type).toUpperCase() !== 'QUICK_REPLY').map((b: any) => ({ type: String(b.type).toUpperCase(), text: b.text ?? 'Copy code' }));
  }

  /** Is the link going back to a step above (a loop)? */
  isLoop(step: EditorStep, target: number | null): boolean {
    if (!target) return false;
    const steps = this.editor()?.steps ?? [];
    return steps.findIndex(s => s.template_id === target) <= steps.indexOf(step);
  }

  err(key: string): string | null {
    return this.serverErrors()[key] ?? null;
  }

  stepIndex(step: EditorStep): number {
    return this.editor()?.steps.indexOf(step) ?? -1;
  }

  varLabel(n: number): string {
    return `{{${n}}}`;
  }

  touch(): void {
    this.tick.update(v => v + 1);
  }
}

function quickReplies(t: WaTemplate | undefined): string[] {
  const buttons = (t?.components ?? []).find((c: any) => String(c.type).toUpperCase() === 'BUTTONS')?.buttons ?? [];
  return buttons.filter((b: any) => String(b.type).toUpperCase() === 'QUICK_REPLY').map((b: any) => String(b.text));
}
