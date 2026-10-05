import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule } from '@angular/material/dialog';
import Swal from 'sweetalert2';
import { CommonDetailCard } from '../../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../shared/components/common-table-card/common-table-card';
import { ModuleTabs } from '../../../shared/components/module-tabs/module-tabs';
import { DetailCardData, QuickAction, TableColumn, TableRow } from '../../../shared/models/common-components.model';
import { DEPARTMENTS } from '../../../shared/models/hr.model';
import { downloadExcel } from '../../../shared/utils/export.util';
import { inr, monthKey, monthLabel } from '../../../shared/utils/format.util';
import { HrListBase } from '../hr-list-base';
import { PayslipView } from './payslip-view/payslip-view';

@Component({
  selector: 'app-payroll',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard, ModuleTabs],
  templateUrl: './payroll.html',
  styleUrl: '../../../shared/styles/erp-page.scss',
})
export class Payroll extends HrListBase {
  protected readonly noun = 'payslips';
  readonly month = signal(monthKey(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)));
  readonly thisMonth = monthKey();
  readonly monthLabel = monthLabel;

  override filters = [
    { key: 'status', label: 'Status', options: ['Processed', 'Paid'] },
    { key: 'source', label: 'Department', options: DEPARTMENTS },
    { key: 'branch', label: 'Branch', options: this.hr.branches, multiSelect: true },
  ];

  columns: TableColumn[] = [
    { key: 'empCode', header: 'Emp Code', width: '8%' },
    { key: 'employee', header: 'Employee', width: '15%' },
    { key: 'branch', header: 'Branch', type: 'branch', width: '10%' },
    { key: 'days', header: 'Paid / Working', width: '9%' },
    { key: 'gross', header: 'Gross', width: '10%' },
    { key: 'bonus', header: 'Bonus', width: '8%' },
    { key: 'lop', header: 'LOP', width: '8%' },
    { key: 'deductions', header: 'Deductions', width: '9%' },
    { key: 'net', header: 'Net Pay', width: '10%' },
    { key: 'status', header: 'Status', type: 'badge', width: '7%' },
    { key: 'actions', header: 'Action', type: 'quickActions', width: '6%', sortable: false },
  ];

  override sortActive = 'empCode';
  override sortDirection: 'asc' | 'desc' = 'asc';

  readonly slips = computed(() => this.hr.payslips().filter(p => p.month === this.month()));
  readonly unpaid = computed(() => this.slips().filter(p => p.status === 'Processed'));

  readonly stats = computed<DetailCardData[]>(() => {
    const list = this.slips();
    const sum = (f: (p: (typeof list)[number]) => number) => list.reduce((s, p) => s + f(p), 0);
    return [
      { label: 'Employees Paid', value: `${list.filter(p => p.status === 'Paid').length} / ${list.length}`, icon: 'bi-people', iconVariant: 'primary' },
      { label: 'Gross Payroll', value: inr(sum(p => p.gross)), icon: 'bi-cash-stack', iconVariant: 'blue' },
      { label: 'Deductions (PF/ESI/PT/LOP)', value: inr(sum(p => p.totalDeductions)), icon: 'bi-dash-circle', iconVariant: 'orange' },
      { label: 'Net Payable', value: inr(sum(p => p.net)), icon: 'bi-wallet2', iconVariant: 'green' },
    ];
  });

  setMonth(value: string): void {
    if (value) this.month.set(value);
  }

  protected allRows(): TableRow[] {
    return this.slips().map(p => {
      const e = this.hr.employee(p.empId);
      const actions: QuickAction[] = [{ key: 'view', icon: 'bi-file-earmark-pdf-fill', label: 'View payslip', variant: 'primary' }];
      if (p.status === 'Processed') actions.push({ key: 'paid', icon: 'bi-check2-circle', label: 'Mark paid' });
      return {
        id: p.id,
        empCode: e?.empCode ?? '-', __empCode: Number(e?.empCode.replace(/\D/g, '') ?? 0),
        employee: e?.name ?? '-',
        branch: e?.branch ?? '-',
        department: e?.department ?? '-',
        days: `${p.paidDays} / ${p.workingDays}`, __days: p.paidDays,
        gross: inr(p.gross), __gross: p.gross,
        bonus: inr(p.earnings.bonus), __bonus: p.earnings.bonus,
        lop: p.lopDays ? `${inr(p.deductions.lop)} (${p.lopDays}d)` : '-', __lop: p.deductions.lop,
        deductions: inr(p.totalDeductions), __deductions: p.totalDeductions,
        net: inr(p.net), __net: p.net,
        status: p.status,
        actions,
      };
    });
  }

  async runPayroll(): Promise<void> {
    const paid = this.slips().filter(p => p.status === 'Paid').length;
    const ok = await Swal.fire({
      icon: 'question',
      title: `Run payroll for ${monthLabel(this.month())}?`,
      text: `Payslips are built from salary structure, attendance (absent / half day), Loss of Pay leave and approved bonus.${paid ? ` ${paid} already-paid slip(s) are kept.` : ''}`,
      showCancelButton: true,
      confirmButtonText: 'Run payroll',
      confirmButtonColor: '#6C63FF',
    });
    if (!ok.isConfirmed) return;
    const slips = this.hr.runPayroll(this.month());
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: `${slips.length} payslips processed`, showConfirmButton: false, timer: 3000 });
  }

  async markAllPaid(): Promise<void> {
    const list = this.unpaid();
    const ok = await Swal.fire({ icon: 'question', title: `Mark ${list.length} payslips as paid?`, text: `Net ${inr(list.reduce((s, p) => s + p.net, 0))} transferred to employee bank accounts.`, showCancelButton: true, confirmButtonText: 'Mark paid', confirmButtonColor: '#0f9d58' });
    if (ok.isConfirmed) this.hr.markPaid(list.map(p => p.id));
  }

  onQuickAction(event: { row: TableRow; action: string }): void {
    const id = String(event.row['id']);
    if (event.action === 'view') this.openDialog(PayslipView, { payslipId: id }, '820px');
    if (event.action === 'paid') this.hr.markPaid([id]);
  }

  /** Payroll register + bank transfer advice, two sheets. */
  exportExcel(): void {
    const slips = this.slips();
    const emp = (id: string) => this.hr.employee(id);
    const register = slips.map(p => ({
      code: emp(p.empId)?.empCode, name: emp(p.empId)?.name, branch: emp(p.empId)?.branch, department: emp(p.empId)?.department,
      working: p.workingDays, paid: p.paidDays, lopDays: p.lopDays, basic: p.earnings.basic, hra: p.earnings.hra, conveyance: p.earnings.conveyance,
      special: p.earnings.special, bonus: p.earnings.bonus, gross: p.gross, pf: p.deductions.pf, esi: p.deductions.esi, pt: p.deductions.professionalTax,
      lop: p.deductions.lop, deductions: p.totalDeductions, net: p.net, status: p.status,
    }));
    const sum = (k: keyof (typeof register)[number]) => register.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    downloadExcel(`payroll-${this.month()}`, [
      {
        name: `Payroll ${this.month()}`,
        columns: [
          { header: 'Emp Code', key: 'code' }, { header: 'Name', key: 'name' }, { header: 'Branch', key: 'branch' }, { header: 'Department', key: 'department' },
          { header: 'Working Days', key: 'working' }, { header: 'Paid Days', key: 'paid' }, { header: 'LOP Days', key: 'lopDays' }, { header: 'Basic', key: 'basic' },
          { header: 'HRA', key: 'hra' }, { header: 'Conveyance', key: 'conveyance' }, { header: 'Special', key: 'special' }, { header: 'Bonus', key: 'bonus' },
          { header: 'Gross', key: 'gross' }, { header: 'PF', key: 'pf' }, { header: 'ESI', key: 'esi' }, { header: 'Prof. Tax', key: 'pt' }, { header: 'LOP', key: 'lop' },
          { header: 'Total Deductions', key: 'deductions' }, { header: 'Net Pay', key: 'net' }, { header: 'Status', key: 'status' },
        ],
        rows: register,
        totals: { code: 'TOTAL', basic: sum('basic'), hra: sum('hra'), conveyance: sum('conveyance'), special: sum('special'), bonus: sum('bonus'), gross: sum('gross'), pf: sum('pf'), esi: sum('esi'), pt: sum('pt'), lop: sum('lop'), deductions: sum('deductions'), net: sum('net') },
      },
      {
        name: 'Bank Transfer',
        columns: [{ header: 'Beneficiary', key: 'name' }, { header: 'Bank', key: 'bank' }, { header: 'Account No', key: 'account' }, { header: 'IFSC', key: 'ifsc' }, { header: 'Amount', key: 'net' }, { header: 'Narration', key: 'narration' }],
        rows: slips.map(p => ({ name: emp(p.empId)?.name, bank: emp(p.empId)?.bankName, account: emp(p.empId)?.accountNo, ifsc: emp(p.empId)?.ifsc, net: p.net, narration: `Salary ${monthLabel(p.month)}` })),
        totals: { name: 'TOTAL', net: sum('net') },
      },
    ]);
  }
}
