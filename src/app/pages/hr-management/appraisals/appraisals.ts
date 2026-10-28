import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { MatDialogModule } from '@angular/material/dialog';
import Swal from 'sweetalert2';
import { CommonDetailCard } from '../../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../shared/components/common-table-card/common-table-card';
import { ModuleTabs } from '../../../shared/components/module-tabs/module-tabs';
import { DetailCardData, FilterOption, QuickAction, TableColumn, TableRow } from '../../../shared/models/common-components.model';
import { BonusType } from '../../../shared/models/hr.model';
import { downloadExcel, escapeHtml, fileStamp, printDocument } from '../../../shared/utils/export.util';
import { displayDate, inr, monthKey, monthLabel } from '../../../shared/utils/format.util';
import { CanActionDirective } from '../../../shared/directives/can-action.directive';
import { HrListBase } from '../hr-list-base';
import { AppraisalForm } from './appraisal-form/appraisal-form';

type View = 'appraisals' | 'bonus';

const APPRAISAL_COLUMNS: TableColumn[] = [
  { key: 'employee', header: 'Employee', width: '15%' },
  { key: 'designation', header: 'Designation', width: '13%' },
  { key: 'cycle', header: 'Cycle', width: '9%' },
  { key: 'rating', header: 'Rating', width: '8%' },
  { key: 'kpi', header: 'KPI', width: '6%' },
  { key: 'increment', header: 'Increment', width: '8%' },
  { key: 'gross', header: 'Old → New Gross', width: '15%' },
  { key: 'effective', header: 'Effective', width: '9%' },
  { key: 'status', header: 'Status', type: 'badge', width: '8%' },
  { key: 'actions', header: 'Action', type: 'quickActions', width: '9%', sortable: false },
];

const BONUS_COLUMNS: TableColumn[] = [
  { key: 'employee', header: 'Employee', width: '17%' },
  { key: 'branch', header: 'Branch', type: 'branch', width: '12%' },
  { key: 'type', header: 'Bonus Type', width: '12%' },
  { key: 'reason', header: 'Reason', width: '22%' },
  { key: 'payMonth', header: 'Paid With Payroll', width: '13%' },
  { key: 'amount', header: 'Amount', width: '12%' },
  { key: 'status', header: 'Status', type: 'badge', width: '8%' },
];

@Component({
  selector: 'app-appraisals',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard, ModuleTabs, CanActionDirective],
  templateUrl: './appraisals.html',
  styleUrl: '../../../shared/styles/erp-page.scss',
})
export class Appraisals extends HrListBase implements OnInit {
  private readonly authService = inject(AuthService);
  protected readonly noun = 'records';
  readonly view = signal<View>('appraisals');

  columns: TableColumn[] = APPRAISAL_COLUMNS;
  override filters = this.filtersFor('appraisals');
  override sortActive = 'createdAt';

  readonly stats = computed<DetailCardData[]>(() => {
    const list = this.hr.appraisals();
    const released = list.filter(a => a.status === 'Released');
    const avgInc = released.length ? released.reduce((s, a) => s + a.incrementPercent, 0) / released.length : 0;
    const year = String(new Date().getFullYear());
    return [
      { label: 'Pending Approval', value: list.filter(a => a.status === 'Draft').length, icon: 'bi-hourglass-split', iconVariant: 'orange' },
      { label: 'Released', value: released.length, icon: 'bi-send-check', iconVariant: 'green' },
      { label: 'Avg Increment', value: `${avgInc.toFixed(1)}%`, icon: 'bi-graph-up-arrow', iconVariant: 'blue' },
      { label: `Bonus ${year}`, value: inr(this.hr.bonuses().filter(b => b.payMonth.startsWith(year)).reduce((s, b) => s + b.amount, 0)), icon: 'bi-gift', iconVariant: 'purple' },
    ];
  });

  ngOnInit(): void {
    // Row buttons follow Roles & Permissions, which are cached from login: re-read them so a newly ticked action shows without re-login.
    this.authService.refreshMenus();
    this.hr.loadBranches().subscribe(branches => {
      this.filters = this.filters.map(f => (f.key === 'branch' ? { ...f, options: branches.map(b => b.name) } : f));
    });
    this.hr.loadEmployees().subscribe({ error: () => undefined }); // the New Appraisal / Add Bonus employee lists
    this.hr.loadAppraisals().subscribe({ error: err => this.fail(err, 'Could not load appraisals') });
    this.hr.loadBonuses().subscribe({ error: err => this.fail(err, 'Could not load bonuses') });
  }

  private fail(err: any, title: string): void {
    Swal.fire({ icon: 'error', title, text: err?.error?.message ?? 'Please try again.', confirmButtonColor: '#6C63FF' });
  }

  private done(source: import('rxjs').Observable<unknown>, message: string): void {
    source.subscribe({
      next: () => Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: message, showConfirmButton: false, timer: 3000 }),
      error: err => this.fail(err, 'Action failed'),
    });
  }

  private filtersFor(view: View): FilterOption[] {
    return [
      { key: 'status', label: 'Status', options: view === 'appraisals' ? ['Draft', 'Approved', 'Released'] : ['Approved', 'Paid'] },
      { key: 'source', label: 'Department', options: this.hr.departments },
      { key: 'branch', label: 'Branch', options: this.hr.branches, multiSelect: true },
    ];
  }

  setView(view: View): void {
    this.view.set(view);
    this.columns = view === 'appraisals' ? APPRAISAL_COLUMNS : BONUS_COLUMNS;
    this.filters = this.filtersFor(view);
    this.sortActive = view === 'appraisals' ? 'createdAt' : 'payMonth';
    this.sortDirection = 'desc';
    this.currentPage = 1;
    this.refresh();
  }

  protected allRows(): TableRow[] {
    if (this.view() === 'bonus') {
      return this.hr.bonuses().map(b => {
        const e = b.employee;
        return {
          id: b.id, employee: e?.name || '-', branch: e?.branch || '-', department: e?.department || '-',
          type: b.type, reason: b.reason, payMonth: monthLabel(b.payMonth), __payMonth: b.payMonth,
          amount: inr(b.amount), __amount: b.amount, status: b.status,
        };
      });
    }

    const canApprove = this.hr.canApprove();
    return this.hr.appraisals().map(a => {
      const e = a.employee;
      const actions: QuickAction[] = [];
      if (a.status === 'Draft' && canApprove) actions.push({ key: 'approve', icon: 'bi-check2-square', label: 'Approve', variant: 'primary' });
      if (a.status === 'Approved' && canApprove) actions.push({ key: 'release', icon: 'bi-send-check', label: 'Release & revise salary', variant: 'primary' });
      actions.push({ key: 'letter', icon: 'bi-file-earmark-pdf-fill', label: 'Appraisal letter' });
      return {
        id: a.id,
        employee: e?.name || '-',
        designation: e?.designation || '-',
        branch: e?.branch || '-',
        department: e?.department || '-',
        cycle: a.cycle,
        rating: '★'.repeat(a.rating) + '☆'.repeat(5 - a.rating), __rating: a.rating,
        kpi: `${a.kpiScore}%`, __kpi: a.kpiScore,
        increment: `${a.incrementPercent}%`, __increment: a.incrementPercent,
        gross: `${inr(a.oldMonthlyGross)} → ${inr(a.newMonthlyGross)}`, __gross: a.newMonthlyGross,
        effective: displayDate(a.effectiveFrom), __effective: a.effectiveFrom,
        status: a.status,
        __createdAt: a.createdAt,
        actions,
      };
    });
  }

  newAppraisal(): void {
    this.openDialog(AppraisalForm, null, '820px');
  }

  async addBonus(): Promise<void> {
    const types: BonusType[] = ['Performance', 'Festival', 'Retention', 'Referral', 'Joining'];
    const emps = this.hr.activeEmployees();
    const result = await Swal.fire({
      title: 'Add Bonus',
      html: `
        <select id="b-emp" class="swal2-select" style="width:100%;margin:6px 0">${emps.map(e => `<option value="${e.id}">${e.empCode} · ${escapeHtml(e.name)}</option>`).join('')}</select>
        <select id="b-type" class="swal2-select" style="width:100%;margin:6px 0">${types.map(t => `<option>${t}</option>`).join('')}</select>
        <input id="b-amt" type="number" min="1" class="swal2-input" placeholder="Amount (₹)" style="width:100%;margin:6px 0">
        <input id="b-month" type="month" class="swal2-input" value="${monthKey()}" style="width:100%;margin:6px 0">
        <input id="b-reason" class="swal2-input" placeholder="Reason (e.g. Diwali bonus)" maxlength="120" style="width:100%;margin:6px 0">`,
      showCancelButton: true,
      confirmButtonText: 'Add bonus',
      confirmButtonColor: '#6C63FF',
      preConfirm: () => {
        const v = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
        if (!(Number(v('b-amt')) > 0) || !v('b-month')) { Swal.showValidationMessage('Enter amount and pay month'); return false; }
        return { empId: v('b-emp'), type: v('b-type') as BonusType, amount: Number(v('b-amt')), payMonth: v('b-month'), reason: v('b-reason').trim() || `${v('b-type')} bonus` };
      },
    });
    if (result.isConfirmed && result.value) this.done(this.hr.addBonus(result.value), 'Bonus added');
  }

  onQuickAction(event: { row: TableRow; action: string }): void {
    const id = String(event.row['id']);
    if (event.action === 'approve') this.done(this.hr.approveAppraisal(id), 'Appraisal approved');
    if (event.action === 'release') this.done(this.hr.releaseAppraisal(id), 'Appraisal released and salary revised');
    if (event.action === 'letter') this.hr.openAppraisalLetter(id);
  }

  exportExcel(): void {
    downloadExcel(`${this.view()}-${fileStamp()}`, [this.exportSheet(this.view() === 'appraisals' ? 'Appraisals' : 'Bonus')]);
  }
}
