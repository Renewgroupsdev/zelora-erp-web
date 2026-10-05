import { CommonModule } from '@angular/common';
import { Component, computed } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { CommonDetailCard } from '../../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../shared/components/common-table-card/common-table-card';
import { ModuleTabs } from '../../../shared/components/module-tabs/module-tabs';
import { DetailCardData, TableColumn, TableRow } from '../../../shared/models/common-components.model';
import { DEPARTMENTS, salaryBreakup } from '../../../shared/models/hr.model';
import { downloadExcel, fileStamp } from '../../../shared/utils/export.util';
import { displayDate, inr } from '../../../shared/utils/format.util';
import { HrListBase } from '../hr-list-base';
import { EmployeeForm } from './employee-form/employee-form';
import { EmployeeProfile } from './employee-profile/employee-profile';

@Component({
  selector: 'app-employees',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard, ModuleTabs],
  templateUrl: './employees.html',
  styleUrl: '../../../shared/styles/erp-page.scss',
})
export class Employees extends HrListBase {
  protected readonly noun = 'employees';

  override filters = [
    { key: 'status', label: 'Status', options: ['Active', 'Onboarding', 'On Notice', 'Exited'] },
    { key: 'source', label: 'Department', options: DEPARTMENTS },
    { key: 'branch', label: 'Branch', options: this.hr.branches, multiSelect: true },
  ];

  columns: TableColumn[] = [
    { key: 'empCode', header: 'Emp Code', width: '8%' },
    { key: 'name', header: 'Employee', type: 'lead', width: '18%' },
    { key: 'department', header: 'Department', width: '11%' },
    { key: 'branch', header: 'Branch', type: 'branch', width: '11%' },
    { key: 'phone', header: 'Mobile', width: '10%' },
    { key: 'joinDate', header: 'Joined', width: '9%' },
    { key: 'gross', header: 'Monthly Gross', width: '10%' },
    { key: 'ctc', header: 'Annual CTC', width: '10%' },
    { key: 'status', header: 'Status', type: 'badge', width: '7%' },
    { key: 'actions', header: 'Action', type: 'quickActions', width: '6%', sortable: false },
  ];

  override sortActive = 'empCode';
  override sortDirection: 'asc' | 'desc' = 'asc';

  readonly stats = computed<DetailCardData[]>(() => {
    const list = this.hr.employees();
    const active = list.filter(e => e.status === 'Active' || e.status === 'On Notice');
    const payroll = active.reduce((s, e) => s + salaryBreakup(e.salary).gross, 0);
    return [
      { label: 'Active Employees', value: active.length, icon: 'bi-people-fill', iconVariant: 'primary' },
      { label: 'Onboarding', value: list.filter(e => e.status === 'Onboarding').length, icon: 'bi-person-plus', iconVariant: 'blue' },
      { label: 'On Notice', value: list.filter(e => e.status === 'On Notice').length, icon: 'bi-door-open', iconVariant: 'orange' },
      { label: 'Monthly Payroll', value: inr(payroll), icon: 'bi-currency-rupee', iconVariant: 'green' },
    ];
  });

  protected allRows(): TableRow[] {
    return this.hr.employees().map(e => {
      const b = salaryBreakup(e.salary);
      return {
        id: e.id,
        empCode: e.empCode,
        __empCode: Number(e.empCode.replace(/\D/g, '')),
        name: { name: e.name, subtitle: e.designation },
        __name: e.name,
        searchText: `${e.name} ${e.designation} ${e.email}`,
        department: e.department,
        branch: e.branch,
        phone: e.phone,
        joinDate: displayDate(e.joinDate),
        __joinDate: e.joinDate,
        gross: inr(b.gross), __gross: b.gross,
        ctc: inr(b.annualCtc), __ctc: b.annualCtc,
        status: e.status,
        actions: [
          { key: 'view', icon: 'bi-person-vcard-fill', label: 'Full details', variant: 'primary' },
          { key: 'edit', icon: 'bi-pencil-fill', label: 'Edit' },
        ],
      };
    });
  }

  addEmployee(): void {
    this.openDialog(EmployeeForm, { employee: null }, '900px');
  }

  openProfile(row: TableRow): void {
    this.openDialog(EmployeeProfile, { empId: row['id'] }, '920px');
  }

  onQuickAction(event: { row: TableRow; action: string }): void {
    if (event.action === 'view') this.openProfile(event.row);
    if (event.action === 'edit') this.openDialog(EmployeeForm, { employee: this.hr.employee(String(event.row['id'])) }, '900px');
  }

  exportExcel(): void {
    const rows = this.filteredRows.map(r => this.hr.employee(String(r['id']))!).map(e => {
      const b = salaryBreakup(e.salary);
      return {
        code: e.empCode, name: e.name, designation: e.designation, department: e.department, branch: e.branch, phone: e.phone, email: e.email,
        joinDate: e.joinDate, type: e.employmentType, pan: e.pan, uan: e.uan, bank: e.bankName, account: e.accountNo, ifsc: e.ifsc,
        basic: e.salary.basic, hra: e.salary.hra, conveyance: e.salary.conveyance, special: e.salary.special, gross: b.gross, net: b.net, ctc: b.annualCtc, status: e.status,
      };
    });
    downloadExcel(`employees-${fileStamp()}`, [{
      name: 'Employees',
      columns: [
        { header: 'Emp Code', key: 'code' }, { header: 'Name', key: 'name' }, { header: 'Designation', key: 'designation' }, { header: 'Department', key: 'department' },
        { header: 'Branch', key: 'branch' }, { header: 'Mobile', key: 'phone' }, { header: 'Email', key: 'email' }, { header: 'Joining Date', key: 'joinDate' },
        { header: 'Type', key: 'type' }, { header: 'PAN', key: 'pan' }, { header: 'UAN', key: 'uan' }, { header: 'Bank', key: 'bank' }, { header: 'Account No', key: 'account' },
        { header: 'IFSC', key: 'ifsc' }, { header: 'Basic', key: 'basic' }, { header: 'HRA', key: 'hra' }, { header: 'Conveyance', key: 'conveyance' },
        { header: 'Special', key: 'special' }, { header: 'Gross', key: 'gross' }, { header: 'Net', key: 'net' }, { header: 'Annual CTC', key: 'ctc' }, { header: 'Status', key: 'status' },
      ],
      rows,
    }]);
  }
}
