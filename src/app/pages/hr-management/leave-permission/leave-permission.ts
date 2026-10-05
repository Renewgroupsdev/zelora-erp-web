import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { CommonDetailCard } from '../../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../shared/components/common-table-card/common-table-card';
import { ModuleTabs } from '../../../shared/components/module-tabs/module-tabs';
import { DetailCardData, QuickAction, TableColumn, TableRow } from '../../../shared/models/common-components.model';
import { DEPARTMENTS, LEAVE_QUOTA, LeaveType } from '../../../shared/models/hr.model';
import { downloadExcel, fileStamp } from '../../../shared/utils/export.util';
import { displayDate } from '../../../shared/utils/format.util';
import { reviewPrompt } from '../../../shared/utils/prompt.util';
import { HrListBase } from '../hr-list-base';
import { LeaveForm } from './leave-form/leave-form';

type View = 'Leave' | 'Permission' | 'Balance';

const REQUEST_COLUMNS: TableColumn[] = [
  { key: 'requestNo', header: 'Request No', width: '10%' },
  { key: 'employee', header: 'Employee', width: '15%' },
  { key: 'branch', header: 'Branch', type: 'branch', width: '10%' },
  { key: 'type', header: 'Type', width: '11%' },
  { key: 'from', header: 'From', width: '9%' },
  { key: 'to', header: 'To', width: '9%' },
  { key: 'duration', header: 'Duration', width: '7%' },
  { key: 'reason', header: 'Reason', width: '14%' },
  { key: 'status', header: 'Status', type: 'badge', width: '8%' },
  { key: 'actions', header: 'Action', type: 'quickActions', width: '7%', sortable: false },
];

const BALANCE_COLUMNS: TableColumn[] = [
  { key: 'empCode', header: 'Emp Code', width: '9%' },
  { key: 'employee', header: 'Employee', width: '18%' },
  { key: 'branch', header: 'Branch', type: 'branch', width: '12%' },
  ...(Object.keys(LEAVE_QUOTA) as LeaveType[]).map(t => ({ key: t, header: t === 'Loss of Pay' ? 'LOP Used' : `${t} (bal / quota)`, width: '12%' })),
];

@Component({
  selector: 'app-leave-permission',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard, ModuleTabs],
  templateUrl: './leave-permission.html',
  styleUrl: '../../../shared/styles/erp-page.scss',
})
export class LeavePermission extends HrListBase {
  protected readonly noun = 'requests';
  readonly view = signal<View>('Leave');

  override filters = [
    { key: 'status', label: 'Status', options: ['Pending', 'Approved', 'Rejected'] },
    { key: 'source', label: 'Department', options: DEPARTMENTS },
    { key: 'branch', label: 'Branch', options: this.hr.branches, multiSelect: true },
  ];

  columns: TableColumn[] = REQUEST_COLUMNS;
  override sortActive = 'appliedAt';

  readonly stats = computed<DetailCardData[]>(() => {
    const list = this.hr.leaves();
    const today = new Date().toISOString().slice(0, 10);
    return [
      { label: 'Pending Approval', value: list.filter(l => l.status === 'Pending').length, icon: 'bi-hourglass-split', iconVariant: 'orange' },
      { label: 'On Leave Today', value: list.filter(l => l.status === 'Approved' && l.kind === 'Leave' && l.fromDate <= today && l.toDate >= today).length, icon: 'bi-calendar2-x', iconVariant: 'blue' },
      { label: 'Permissions This Month', value: list.filter(l => l.kind === 'Permission' && l.status === 'Approved' && l.fromDate.startsWith(today.slice(0, 7))).length, icon: 'bi-clock', iconVariant: 'purple' },
      { label: 'Approved This Year', value: list.filter(l => l.status === 'Approved' && l.fromDate.startsWith(today.slice(0, 4))).length, icon: 'bi-check2-circle', iconVariant: 'green' },
    ];
  });

  setView(view: View): void {
    this.view.set(view);
    this.columns = view === 'Balance' ? BALANCE_COLUMNS : REQUEST_COLUMNS;
    this.sortActive = view === 'Balance' ? 'empCode' : 'appliedAt';
    this.sortDirection = view === 'Balance' ? 'asc' : 'desc';
    this.currentPage = 1;
    this.refresh();
  }

  protected allRows(): TableRow[] {
    if (this.view() === 'Balance') {
      return this.hr.activeEmployees().map(e => {
        const row: TableRow = { id: e.id, empCode: e.empCode, employee: e.name, branch: e.branch, department: e.department, status: '' };
        for (const b of this.hr.leaveBalance(e.id)) {
          row[b.type] = b.quota ? `${b.balance} / ${b.quota}` : String(b.used);
          row[`__${b.type}`] = b.quota ? b.balance : b.used;
        }
        return row;
      });
    }

    const canApprove = this.hr.canApprove();
    return this.hr.leaves().filter(l => l.kind === this.view()).map(l => {
      const e = this.hr.employee(l.empId);
      const actions: QuickAction[] = l.status === 'Pending' && canApprove ? [{ key: 'review', icon: 'bi-check2-square', label: 'Approve / Reject', variant: 'primary' }] : [];
      const days = this.hr.leaveDays(l);
      return {
        id: l.id,
        requestNo: l.requestNo,
        employee: e?.name ?? '-',
        branch: e?.branch ?? '-',
        department: e?.department ?? '-',
        type: l.kind === 'Leave' ? `${l.leaveType}${l.halfDay ? ' (½)' : ''}` : 'Permission',
        from: l.kind === 'Leave' ? displayDate(l.fromDate) : `${displayDate(l.fromDate)} ${l.fromTime}`,
        __from: l.fromDate,
        to: l.kind === 'Leave' ? displayDate(l.toDate) : l.toTime ?? '-',
        __to: l.toDate,
        duration: l.kind === 'Leave' ? `${days} day${days === 1 ? '' : 's'}` : this.permissionHours(l.fromTime, l.toTime),
        __duration: days,
        reason: l.reviewRemarks ? `${l.reason} · HR: ${l.reviewRemarks}` : l.reason,
        status: l.status,
        __appliedAt: l.appliedAt,
        actions,
      };
    });
  }

  private permissionHours(from: string | null, to: string | null): string {
    if (!from || !to) return '-';
    const [fh, fm] = from.split(':').map(Number);
    const [th, tm] = to.split(':').map(Number);
    return `${((th * 60 + tm - fh * 60 - fm) / 60).toFixed(1)} h`;
  }

  apply(): void {
    this.openDialog(LeaveForm, { kind: this.view() === 'Permission' ? 'Permission' : 'Leave' }, '620px');
  }

  async onQuickAction(event: { row: TableRow; action: string }): Promise<void> {
    const decision = await reviewPrompt(`${event.row['requestNo']} · ${event.row['employee']}`, `${event.row['type']}: ${event.row['from']} → ${event.row['to']} (${event.row['duration']}). ${event.row['reason']}`);
    if (decision) this.hr.reviewLeave(String(event.row['id']), decision.approve, decision.remarks);
  }

  exportExcel(): void {
    downloadExcel(`${this.view().toLowerCase()}-${fileStamp()}`, [this.exportSheet(this.view() === 'Balance' ? 'Leave Balance' : `${this.view()} Requests`)]);
  }
}
