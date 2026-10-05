import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import Swal from 'sweetalert2';
import { HrService } from '../../../shared/common-services/hr.service';
import { ModuleTabs } from '../../../shared/components/module-tabs/module-tabs';
import { ExitCase } from '../../../shared/models/hr.model';
import { escapeHtml, printDocument } from '../../../shared/utils/export.util';
import { addDays, amountInWords, daysBetween, displayDate, inr, initials, isoDate } from '../../../shared/utils/format.util';
import { hrTabs } from '../hr-list-base';

/** HR "in and out": joining checklist for new hires, exit clearance + full & final settlement for leavers. */
@Component({
  selector: 'app-onboarding-exit',
  standalone: true,
  imports: [CommonModule, ModuleTabs],
  templateUrl: './onboarding-exit.html',
  styleUrls: ['../../../shared/styles/erp-page.scss', './onboarding-exit.scss'],
})
export class OnboardingExit {
  readonly hr = inject(HrService);
  readonly tabs = computed(() => hrTabs(this.hr));
  readonly view = signal<'in' | 'out'>('in');
  readonly expanded = signal<string | null>(null);
  readonly displayDate = displayDate;
  readonly initials = initials;
  readonly inr = inr;

  readonly joiners = computed(() => [...this.hr.onboarding()].sort((a, b) => (a.status === b.status ? a.joinDate.localeCompare(b.joinDate) : a.status === 'In Progress' ? -1 : 1)));
  readonly leavers = computed(() => [...this.hr.exits()].sort((a, b) => (a.status === 'Settled' ? 1 : 0) - (b.status === 'Settled' ? 1 : 0) || a.lastWorkingDay.localeCompare(b.lastWorkingDay)));

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
      const exit = this.hr.startExit(result.value);
      this.view.set('out');
      this.expanded.set(exit.id);
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
    if (result.isConfirmed && result.value) this.hr.updateFnf(x.id, result.value);
  }

  async settle(x: ExitCase): Promise<void> {
    const ok = await Swal.fire({ icon: 'question', title: 'Settle full & final?', text: `${inr(this.hr.fnfTotal(x.fnf))} will be paid and ${this.hr.employeeName(x.empId)} marked as Exited.`, showCancelButton: true, confirmButtonText: 'Settle', confirmButtonColor: '#0f9d58' });
    if (ok.isConfirmed) this.hr.settleExit(x.id);
  }

  printFnf(x: ExitCase): void {
    const e = this.hr.employee(x.empId)!;
    const f = x.fnf;
    const total = this.hr.fnfTotal(f);
    const row = (label: string, value: number, minus = false) => `<tr><td>${label}</td><td class="num">${minus ? '- ' : ''}${inr(value)}</td></tr>`;
    printDocument(`F&F ${e.empCode}`, `
      <div class="doc-head"><div><h1>RENEW Plus</h1><p>Renew Plus Hair and Skin Care Pvt Ltd</p></div>
      <div class="doc-meta"><h2>FULL &amp; FINAL SETTLEMENT</h2><p>${x.status === 'Settled' ? 'Settled ' + displayDate(x.settledAt) : 'Draft'}</p></div></div>
      <div class="doc-parties">
        <div><small>Employee</small><strong>${escapeHtml(e.name)}</strong><br/>${e.empCode} · ${escapeHtml(e.designation)}</div>
        <div><small>Service</small>Joined ${displayDate(e.joinDate)}<br/>Last day ${displayDate(x.lastWorkingDay)}</div>
        <div><small>Exit</small>${x.exitType}<br/>${escapeHtml(x.reason)}</div>
      </div>
      <table><thead><tr><th>Particulars</th><th class="num">Amount</th></tr></thead><tbody>
        ${row('Pending salary', f.pendingSalary)}${row('Leave encashment', f.leaveEncashment)}${row('Bonus / incentives', f.bonus)}${row('Gratuity', f.gratuity)}${row('Recoveries', f.recoveries, true)}
      </tbody></table>
      <div class="doc-totals"><div class="grand"><span>Net Payable</span><span>${inr(total)}</span></div></div>
      <p class="doc-words"><strong>In words:</strong> ${amountInWords(total)}</p>
      <div class="doc-sign"><span>Employee</span><span>HR Department</span><span>Accounts</span></div>`);
  }

  printRelieving(x: ExitCase): void {
    const e = this.hr.employee(x.empId)!;
    printDocument(`Relieving letter ${e.empCode}`, `
      <div class="doc-head"><div><h1>RENEW Plus</h1><p>Renew Plus Hair and Skin Care Pvt Ltd</p></div><div class="doc-meta"><h2>RELIEVING &amp; EXPERIENCE LETTER</h2><p>${displayDate(x.lastWorkingDay)}</p></div></div>
      <p style="margin-top:20px">To whom it may concern,</p>
      <p>This is to certify that <strong>${escapeHtml(e.name)}</strong> (${e.empCode}) was employed with Renew Plus Hair and Skin Care Pvt Ltd as
      <strong>${escapeHtml(e.designation)}</strong> in the ${escapeHtml(e.department)} department at our ${escapeHtml(e.branch)} branch from
      <strong>${displayDate(e.joinDate)}</strong> to <strong>${displayDate(x.lastWorkingDay)}</strong>.</p>
      <p>${e.gender === 'Female' ? 'She' : e.gender === 'Male' ? 'He' : 'They'} has been relieved from duties after completing all formalities. We wish ${e.gender === 'Female' ? 'her' : e.gender === 'Male' ? 'him' : 'them'} the very best.</p>
      <div class="doc-sign"><span></span><span>HR Manager</span></div>`);
  }
}
