import { CommonModule } from '@angular/common';
import { Component, computed, effect } from '@angular/core';
import { Sort, SortDirection } from '@angular/material/sort';
import { CommonDetailCard } from '../../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../shared/components/common-table-card/common-table-card';
import {
  CommonFilterState,
  DetailCardData,
  FilterOption,
  QuickAction,
  TableColumn,
  TablePageChangeEvent,
  TableRow,
} from '../../../shared/models/common-components.model';
import { TelephonyService } from '../../../core/telephony/telephony.service';
import { CallAlert, callStatusLabel } from '../../../core/telephony/telephony.models';
import { ToastService } from '../../../shared/common-services/toast.service';

const QUICK_ACTIONS: QuickAction[] = [
  { key: 'acknowledge', icon: 'bi-check2-circle', label: 'Acknowledge', variant: 'primary' },
  { key: 'callback', icon: 'bi-telephone-outbound', label: 'Call Back', variant: 'default' },
];

const ACKNOWLEDGED_ACTIONS: QuickAction[] = [
  { key: 'callback', icon: 'bi-telephone-outbound', label: 'Call Back', variant: 'default' },
];

/**
 * "Branch head" view of every call a telecaller didn't answer / disconnected / rejected.
 * Data comes from TelephonyService, which is fed either by a live websocket from the backend
 * or, if that isn't reachable yet, by polling TELEPHONY_ALERTS_LIST every 15s - either way this
 * page and the bell-icon notification stay in sync automatically.
 */
@Component({
  selector: 'app-missed-calls',
  standalone: true,
  imports: [CommonModule, CommonDetailCard, CommonFilterCard, CommonTableCard],
  templateUrl: './missed-calls.html',
  styleUrl: './missed-calls.scss',
})
export class MissedCalls {
  columns: TableColumn[] = [
    { key: 'telecaller', header: 'Telecaller', type: 'text' },
    { key: 'branch', header: 'Branch', type: 'branch' },
    { key: 'customer', header: 'Customer Number', type: 'text' },
    { key: 'status', header: 'Status', type: 'badge' },
    { key: 'occurredAt', header: 'Time', type: 'text', sortable: true },
    { key: 'acknowledgedText', header: 'Acknowledged', type: 'text' },
    { key: 'action', header: 'Action', type: 'quickActions', sortable: false, width: '160px' },
  ];

  filters: FilterOption[] = [
    { key: 'status', label: 'Status', options: ['No Answer', 'Rejected', 'Busy', 'Disconnected', 'Failed'] },
    { key: 'branch', label: 'Branch', multiSelect: true, options: [] },
  ];

  readonly pageSizeOptions = [10, 30, 50, 100];

  currentPage = 1;
  pageSize = 10;
  sortActive = 'occurredAt';
  sortDirection: SortDirection = 'desc';
  private searchTerm = '';
  private statusFilter: string | null = null;
  private branchFilter: string[] = [];

  rows: TableRow[] = [];
  totalRecords = 0;

  constructor(
    private telephony: TelephonyService,
    private toast: ToastService,
  ) {
    // Re-derives stats/rows whenever a new alert arrives (call not answered, disconnected, etc.)
    // or an existing one gets acknowledged - no manual refresh needed.
    effect(() => {
      const alerts = this.telephony.alerts();
      this.refreshRows(alerts);
      this.updateBranchFilterOptions(alerts);
    });
  }

  readonly stats = computed<DetailCardData[]>(() => {
    const alerts = this.telephony.alerts();
    const unacknowledged = alerts.filter((a) => !a.acknowledged).length;
    const todayCount = alerts.filter((a) => this.isToday(a.occurredAt)).length;
    const disconnected = alerts.filter((a) => a.status === 'disconnected').length;

    return [
      { label: 'Total Missed Calls', value: alerts.length, icon: 'bi-telephone-x', iconVariant: 'primary', trendDirection: 'neutral' },
      { label: 'Unacknowledged', value: unacknowledged, icon: 'bi-exclamation-circle', iconVariant: 'orange', trendDirection: unacknowledged ? 'up' : 'neutral' },
      { label: 'Missed Today', value: todayCount, icon: 'bi-calendar-x', iconVariant: 'blue', trendDirection: 'neutral' },
      { label: 'Disconnected Mid-Call', value: disconnected, icon: 'bi-telephone-minus', iconVariant: 'purple', trendDirection: 'neutral' },
    ];
  });

  readonly connectionLabel = computed(() => {
    const state = this.telephony.connectionState();
    return {
      idle: 'Not connected',
      connecting: 'Connecting…',
      live: 'Live',
      polling: 'Live (polling)',
      offline: 'Offline - retrying',
    }[state];
  });

  onSearch(term: string): void {
    this.searchTerm = term.trim().toLowerCase();
    this.currentPage = 1;
    this.refreshRows(this.telephony.alerts());
  }

  onFilterClick(_key: string): void {}

  onFiltersChange(filters: CommonFilterState): void {
    this.statusFilter = filters.status;
    this.branchFilter = [...filters.branch];
    this.currentPage = 1;
    this.refreshRows(this.telephony.alerts());
  }

  onExport(): void {
    // Wire up to a CSV/export endpoint as needed.
  }

  onPageChange(event: TablePageChangeEvent): void {
    this.currentPage = event.page;
    this.pageSize = event.pageSize;
    this.refreshRows(this.telephony.alerts());
  }

  onSortChange(sort: Sort): void {
    this.sortActive = sort.active;
    this.sortDirection = sort.direction || 'desc';
    this.refreshRows(this.telephony.alerts());
  }

  onQuickAction({ row, action }: { row: TableRow; action: string }): void {
    const alertId = String(row['id']);

    if (action === 'acknowledge') {
      this.telephony.acknowledgeAlert(alertId);
      this.toast.success('Acknowledged', `Marked as reviewed for ${row['telecaller']}.`);
    } else if (action === 'callback') {
      const number = String(row['customer'] ?? '');
      if (number) window.location.href = `tel:${number}`;
    }
  }

  refresh(): void {
    this.telephony.refresh();
  }

  get recordCountText(): string {
    return `${this.totalRecords.toLocaleString()} records`;
  }

  get pageInfoText(): string {
    if (!this.totalRecords) return 'Showing 0 missed calls';
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    return `Showing ${start}-${end} of ${this.totalRecords.toLocaleString()} missed calls`;
  }

  private refreshRows(alerts: CallAlert[]): void {
    const filtered = alerts.filter((alert) => {
      if (this.statusFilter && callStatusLabel(alert.status) !== this.statusFilter) return false;
      if (this.branchFilter.length && !this.branchFilter.includes(alert.branchName)) return false;
      if (this.searchTerm) {
        const haystack = `${alert.telecallerName} ${alert.branchName} ${alert.customerNumber}`.toLowerCase();
        if (!haystack.includes(this.searchTerm)) return false;
      }
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      const direction = this.sortDirection === 'asc' ? 1 : -1;
      return (new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()) * direction;
    });

    this.totalRecords = sorted.length;
    const totalPages = Math.max(1, Math.ceil(this.totalRecords / this.pageSize));
    if (this.currentPage > totalPages) this.currentPage = totalPages;

    const start = (this.currentPage - 1) * this.pageSize;
    this.rows = sorted.slice(start, start + this.pageSize).map((alert) => this.toRow(alert));
  }

  private toRow(alert: CallAlert): TableRow {
    return {
      id: alert.id,
      telecaller: alert.telecallerName,
      branch: alert.branchName,
      customer: alert.customerNumber,
      status: callStatusLabel(alert.status),
      occurredAt: new Date(alert.occurredAt).toLocaleString(),
      acknowledgedText: alert.acknowledged ? 'Yes' : 'No',
      action: alert.acknowledged ? ACKNOWLEDGED_ACTIONS : QUICK_ACTIONS,
    };
  }

  private updateBranchFilterOptions(alerts: CallAlert[]): void {
    const branches = Array.from(new Set(alerts.map((a) => a.branchName).filter(Boolean))).sort();
    const branchFilter = this.filters.find((f) => f.key === 'branch');
    if (branchFilter) branchFilter.options = branches;
  }

  private isToday(iso: string): boolean {
    const date = new Date(iso);
    const now = new Date();
    return date.toDateString() === now.toDateString();
  }
}
