import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import Swal from 'sweetalert2';
import { HrService } from '../../../shared/common-services/hr.service';
import { ModuleTabs } from '../../../shared/components/module-tabs/module-tabs';
import { ExitCase } from '../../../shared/models/hr.model';
import { escapeHtml } from '../../../shared/utils/export.util';
import { addDays, daysBetween, displayDate, inr, initials, isoDate } from '../../../shared/utils/format.util';
import { AuthService } from '../../../core/auth/auth.service';
import { CanActionDirective } from '../../../shared/directives/can-action.directive';
import { injectHrTabs } from '../hr-list-base';

/** HR "in and out": joining checklist for new hires, exit clearance + full & final settlement for leavers. */
@Component({
  selector: 'app-onboarding-exit',
  standalone: true,
  imports: [CommonModule, ModuleTabs, CanActionDirective],
  templateUrl: './onboarding-exit.html',
  styleUrls: ['../../../shared/styles/erp-page.scss', './onboarding-exit.scss'],
})
export class OnboardingExit implements OnInit {
  readonly hr = inject(HrService);
  private readonly auth = inject(AuthService);
  readonly tabs = injectHrTabs();
  readonly view = signal<'in' | 'out'>('in');
  readonly expanded = signal<string | null>(null);
  readonly displayDate = displayDate;
  readonly initials = initials;
  readonly inr = inr;

  ngOnInit(): void {
    // Row buttons follow Roles & Permissions, which are cached from login: re-read them so a newly ticked action shows without re-login.
    this.auth.refreshMenus();
    this.hr.loadEmployees().subscribe({ error: () => undefined }); // the Initiate Exit employee list
    this.hr.loadOnboardings().subscribe({ error: err => this.fail(err, 'Could not load joiners') });
    this.hr.loadExits().subscribe({ error: err => this.fail(err, 'Could not load exits') });
  }

  private fail(err: any, title: string): void {
    Swal.fire({ icon: 'error', title, text: err?.error?.message ?? 'Please try again.', confirmButtonColor: '#6C63FF' });
  }

  private run(source: Observable<unknown>, message: string): void {
    source.subscribe({
      next: () => Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: message, showConfirmButton: false, timer: 3000 }),
      error: err => this.fail(err, 'Action failed'),
    });
  }

  toggleOnboarding(id: string, index: number): void {
    this.run(this.hr.toggleOnboardingItem(id, index), 'Checklist updated');
  }

  toggleExit(id: string, index: number): void {
    this.run(this.hr.toggleExitItem(id, index), 'Clearance updated');
  }

  /** Whether Roles & Permissions ticks the signed-in role on this HR action slug. */
  can(slug: string): boolean {
    return this.auth.hasActionAccess(slug);
  }

  readonly joiners = computed(() => this.hr.onboarding()); // API order = updated_at desc
  readonly leavers = computed(() => this.hr.exits());

  readonly summary = computed(() => ({
    joining: this.hr.onboarding().filter(o => o.status === 'In Progress').length,
    joinedMonth: this.hr.onboarding().filter(o => o.status === 'Completed' && o.joinDate.slice(0, 7) === isoDate().slice(0, 7)).length,
    notice: this.hr.exits().filter(x => x.status === 'Notice Period').length,
    clearance: this.hr.exits().filter(x => x.status === 'Clearance').length,
    settled: this.hr.exits().filter(x => x.status === 'Settled').length,
  }));

  progress(list: { done: boolean }[]): number {
    return list.length ? Math.round((list.filter(c => c.done).length / list.length) * 100) : 0;
  }

  pending(list: { done: boolean }[]): number {
    return list.filter(c => !c.done).length;
  }

  daysTo(date: string): number {
    return daysBetween(isoDate(), date);
  }

  toggle(id: string): void {
    this.expanded.set(this.expanded() === id ? null : id);
  }

  async initiateExit(): Promise<void> {
    const emps = this.hr.employees().filter(e => e.status === 'Active');
    const today = isoDate();
    const result = await Swal.fire({
      title: 'Initiate Exit',
      html: `
        <select id="x-emp" class="swal2-select" style="width:100%;margin:6px 0">${emps.map(e => `<option value="${e.id}">${e.empCode} · ${escapeHtml(e.name)}</option>`).join('')}</select>
        <select id="x-type" class="swal2-select" style="width:100%;margin:6px 0"><option>Resignation</option><option>Termination</option><option>Retirement</option><option>Absconding</option></select>
        <label style="display:block;text-align:left;font-size:13px;margin-top:6px">Resignation date</label>
        <input id="x-res" type="date" class="swal2-input" value="${today}" style="width:100%;margin:2px 0">
        <label style="display:block;text-align:left;font-size:13px;margin-top:6px">Last working day (30-day notice)</label>
        <input id="x-lwd" type="date" class="swal2-input" value="${addDays(today, 30)}" style="width:100%;margin:2px 0">
        <input id="x-reason" class="swal2-input" placeholder="Reason" maxlength="200" style="width:100%;margin:8px 0">`,
      showCancelButton: true,
      confirmButtonText: 'Start exit process',
      confirmButtonColor: '#dc4c4c',
      preConfirm: () => {
        const v = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
        if (!v('x-emp') || !v('x-lwd') || v('x-lwd') < v('x-res')) { Swal.showValidationMessage('Last working day must be on/after the resignation date'); return false; }
        return { empId: v('x-emp'), exitType: v('x-type') as ExitCase['exitType'], resignationDate: v('x-res'), lastWorkingDay: v('x-lwd'), reason: v('x-reason').trim() || '-' };
      },
    });
    if (result.isConfirmed && result.value) {
      this.hr.startExit(result.value).subscribe({
        next: exit => { this.view.set('out'); this.expanded.set(exit.id); },
        error: err => this.fail(err, 'Could not start the exit'),
      });
    }
  }

  async editFnf(x: ExitCase): Promise<void> {
    const f = x.fnf;
    const field = (id: string, label: string, value: number) =>
      `<label style="display:block;text-align:left;font-size:13px;margin-top:6px">${label}</label><input id="${id}" type="number" min="0" class="swal2-input" value="${value}" style="width:100%;margin:2px 0">`;
    const result = await Swal.fire({
      title: 'Full & Final Settlement',
      html: field('f-sal', 'Pending salary', f.pendingSalary) + field('f-leave', 'Leave encashment', f.leaveEncashment) + field('f-bonus', 'Bonus / incentives', f.bonus) + field('f-grat', 'Gratuity', f.gratuity) + field('f-rec', 'Recoveries (advance, notice shortfall, assets)', f.recoveries),
      showCancelButton: true,
      confirmButtonText: 'Save',
      confirmButtonColor: '#6C63FF',
      preConfirm: () => {
        const n = (id: string) => Math.max(0, Number((document.getElementById(id) as HTMLInputElement).value) || 0);
        return { pendingSalary: n('f-sal'), leaveEncashment: n('f-leave'), bonus: n('f-bonus'), gratuity: n('f-grat'), recoveries: n('f-rec') };
      },
    });
    if (result.isConfirmed && result.value) this.run(this.hr.updateFnf(x.id, result.value), 'Settlement saved');
  }

  async settle(x: ExitCase): Promise<void> {
    const ok = await Swal.fire({ icon: 'question', title: 'Settle full & final?', text: `${inr(this.hr.fnfTotal(x.fnf))} will be paid and ${x.employee?.name ?? this.hr.employeeName(x.empId)} marked as Exited.`, showCancelButton: true, confirmButtonText: 'Settle', confirmButtonColor: '#0f9d58' });
    if (ok.isConfirmed) this.run(this.hr.settleExit(x.id), 'Exit settled');
  }

  printFnf(x: ExitCase): void {
    this.hr.openPdf(`hr/exits/${x.id}/fnf`, 'Could not open the F&F statement');
  }

  printRelieving(x: ExitCase): void {
    this.hr.openPdf(`hr/exits/${x.id}/relieving-letter`, 'Could not open the relieving letter');
  }
}
