import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Sort, SortDirection } from '@angular/material/sort';
import { CommonDetailCard } from '../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../shared/components/common-table-card/common-table-card';
import {
  CallerAvatar,
  CallerLogEntry,
  DetailCardData,
  FilterOption,
  LeadCell,
  TableColumn,
  TablePageChangeEvent,
  TableRow,
} from '../../shared/models/common-components.model';
import { CallLogHistoryDialog } from './call-log-history-dialog/call-log-history-dialog';

interface FollowUpSeed {
  name: string;
  phone: string;
  branch: string;
  status: string;
  callers: CallerAvatar[];
  callLog: CallerLogEntry[];
}

const FOLLOW_UP_SEEDS: FollowUpSeed[] = [
  {
    name: 'Ananya Sharma',
    phone: '+91 98765 43210',
    branch: 'Anna Nagar',
    status: 'Contacted',
    callers: [{ name: 'Priya', empNo: 'EMP-1042' }, { name: 'Karthik Iyer', empNo: 'EMP-1108' }],
    callLog: [
      { telecallerName: 'Priya', empNo: 'EMP-1042', dateTime: '08-Sep-2026, 04:05 PM', notes: 'Call not answered, left voicemail' },
      { telecallerName: 'Priya', empNo: 'EMP-1042', dateTime: '10-Sep-2026, 11:20 AM', notes: 'Interested, asked to call back after consultation report' },
      { telecallerName: 'Karthik Iyer', empNo: 'EMP-1108', dateTime: '12-Sep-2026, 03:00 PM', notes: 'Rescheduled - lead requested evening slot' },
    ],
  },
  {
    name: 'Rahul Kumar',
    phone: '+91 91234 56780',
    branch: 'Velachery',
    status: 'Qualified',
    callers: [{ name: 'Karthik Iyer', empNo: 'EMP-1108' }],
    callLog: [
      { telecallerName: 'Karthik Iyer', empNo: 'EMP-1108', dateTime: '09-Sep-2026, 10:00 AM', notes: 'Confirmed appointment for Acne Care consultation' },
    ],
  },
  {
    name: 'Sneha Menon',
    phone: '+91 98867 66554',
    branch: 'Indiranagar',
    status: 'Pending',
    callers: [{ name: 'Meera Nair', empNo: 'EMP-1075', }, { name: 'Priya', empNo: 'EMP-1042' }, { name: 'Karthik Iyer', empNo: 'EMP-1108' }],
    callLog: [
      { telecallerName: 'Meera Nair', empNo: 'EMP-1075', dateTime: '05-Sep-2026, 09:40 AM', notes: 'Not reachable, switched off' },
      { telecallerName: 'Priya', empNo: 'EMP-1042', dateTime: '06-Sep-2026, 05:30 PM', notes: 'Call disconnected midway' },
      { telecallerName: 'Priya', empNo: 'EMP-1042', dateTime: '07-Sep-2026, 01:15 PM', notes: 'Spoke briefly, wants pricing over WhatsApp' },
      { telecallerName: 'Karthik Iyer', empNo: 'EMP-1108', dateTime: '11-Sep-2026, 12:00 PM', notes: 'Escalated to senior telecaller - price negotiation' },
    ],
  },
  {
    name: 'Vikram Patel',
    phone: '+91 90123 45678',
    branch: 'Coimbatore',
    status: 'Lost',
    callers: [{ name: 'Meera Nair', empNo: 'EMP-1075' }],
    callLog: [
      { telecallerName: 'Meera Nair', empNo: 'EMP-1075', dateTime: '02-Sep-2026, 06:10 PM', notes: 'Went with a competitor clinic' },
    ],
  },
  {
    name: 'Neha Prasad',
    phone: '+91 93450 78920',
    branch: 'Anna Nagar',
    status: 'Contacted',
    callers: [{ name: 'Priya', empNo: 'EMP-1042' }, { name: 'Meera Nair', empNo: 'EMP-1075' }],
    callLog: [
      { telecallerName: 'Priya', empNo: 'EMP-1042', dateTime: '06-Sep-2026, 10:50 AM', notes: 'Interested in Skin Rejuvenation package' },
      { telecallerName: 'Meera Nair', empNo: 'EMP-1075', dateTime: '10-Sep-2026, 02:30 PM', notes: 'Asked for a callback next week - travelling' },
    ],
  },
  {
    name: 'Kavin Raj',
    phone: '+91 99520 13840',
    branch: 'T Nagar',
    status: 'Qualified',
    callers: [{ name: 'Karthik Iyer', empNo: 'EMP-1108' }],
    callLog: [
      { telecallerName: 'Karthik Iyer', empNo: 'EMP-1108', dateTime: '11-Sep-2026, 05:45 PM', notes: 'Confirmed, booked Laser Toning session' },
    ],
  },
];

@Component({
  selector: 'app-followups',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard],
  templateUrl: './followups.html',
  styleUrl: './followups.scss',
})
export class Followups implements OnInit {

  constructor(private dialog: MatDialog) { }

  stats: DetailCardData[] = [
    { label: 'Total Leads', value: '1,284', trendText: '8.4% this month', trendDirection: 'up' },
    { label: 'Total Follow-Ups', value: FOLLOW_UP_SEEDS.length, trendText: 'Across all telecallers', trendDirection: 'neutral' },
    { label: 'Due Today', value: 2, trendText: 'Needs attention', trendDirection: 'up' },
    { label: 'Completed', value: 3, trendText: 'Follow-up closed', trendDirection: 'up' },
    { label: 'Schedule', value: 18, trendText: 'Visits planned this week', trendDirection: 'neutral' },
    { label: 'Appointment', value: 12, trendText: 'Confirmed appointments', trendDirection: 'up' },
  ];

  filters: FilterOption[] = [
    { key: 'status', label: 'Status' },
    { key: 'telecaller', label: 'Telecaller' },
    { key: 'branch', label: 'Branch' },
    { key: 'date', label: 'Date' },
  ];

  columns: TableColumn[] = [
    { key: 'lead', header: 'Name', type: 'lead' },
    { key: 'contact', header: 'Contact', type: 'text' },
    { key: 'branch', header: 'Branch', type: 'branch' },
    { key: 'telecaller', header: 'Telecaller Assigned', type: 'avatarGroup', sortable: false, width: '140px' },
    { key: 'status', header: 'Status', type: 'badge' },
    { key: 'action', header: 'Action', type: 'callLog', sortable: false, width: '90px' },
  ];

  readonly pageSizeOptions = [10, 30, 50, 100];

  readonly allRows: TableRow[] = FOLLOW_UP_SEEDS.map((seed, index) => ({
    lead: {
      name: seed.name,
      subtitle: `LD-${String(284 - index).padStart(5, '0')}`,
    },
    contact: seed.phone,
    branch: seed.branch,
    telecaller: seed.callers,
    status: seed.status,
    action: seed.callLog,
  }));

  rows: TableRow[] = [];
  currentPage = 1;
  pageSize = 10;
  totalRecords = 0;
  sortActive = 'lead';
  sortDirection: SortDirection = 'asc';
  private searchTerm = '';

  ngOnInit(): void {
    this.refreshRows();
  }

  onSearch(term: string): void {
    this.searchTerm = term.trim().toLowerCase();
    this.currentPage = 1;
    this.refreshRows();
  }

  onFilterClick(key: string): void {
    // Open the corresponding filter dropdown/panel as needed.
  }

  onExport(): void {
    // Trigger export as needed.
  }

  get recordCountText(): string {
    return `${this.totalRecords.toLocaleString()} records`;
  }

  get pageInfoText(): string {
    if (!this.totalRecords) {
      return 'Showing 0 follow-ups';
    }

    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    return `Showing ${start}-${end} of ${this.totalRecords.toLocaleString()} follow-ups`;
  }

  onPageChange(event: TablePageChangeEvent): void {
    this.currentPage = event.page;
    this.pageSize = event.pageSize;
    this.refreshRows();
  }

  onSortChange(sort: Sort): void {
    this.sortActive = sort.active;
    this.sortDirection = sort.direction || 'asc';
    this.currentPage = 1;
    this.refreshRows();
  }

  onRowAction(row: TableRow): void {
    // Open a row action menu as needed.
  }

  openAppointment(row: TableRow): void {
    console.log('Appointment:', row);
  }

  sendToBranch(row: TableRow): void {
    console.log('Send to branch:', row);
  }

  viewCallLog(row: TableRow): void {
    const lead = row['lead'] as LeadCell;
    const entries = (row['action'] as CallerLogEntry[]) ?? [];

    this.dialog.open(CallLogHistoryDialog, {
      width: '440px',
      maxWidth: 'calc(100vw - 32px)',
      maxHeight: '86vh',
      autoFocus: false,
      restoreFocus: true,
      panelClass: 'call-log-history-dialog-panel',
      data: {
        leadName: lead.name,
        subtitle: lead.subtitle,
        entries,
      },
    });
  }

  private refreshRows(): void {
    const filteredRows = this.getFilteredRows();
    const sortedRows = this.getSortedRows(filteredRows);

    this.totalRecords = sortedRows.length;

    const totalPages = Math.max(1, Math.ceil(this.totalRecords / this.pageSize));
    if (this.currentPage > totalPages) {
      this.currentPage = totalPages;
    }

    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.rows = sortedRows.slice(startIndex, endIndex);
  }

  private getFilteredRows(): TableRow[] {
    if (!this.searchTerm) {
      return [...this.allRows];
    }

    return this.allRows.filter((row) => {
      const lead = row['lead'] as LeadCell;
      const callers = (row['telecaller'] as CallerAvatar[]) ?? [];
      const haystack = [
        lead.name,
        lead.subtitle ?? '',
        row['contact'],
        row['branch'],
        row['status'],
        ...callers.map(c => c.name),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(this.searchTerm);
    });
  }

  private getSortedRows(rows: TableRow[]): TableRow[] {
    if (!this.sortActive || !this.sortDirection) {
      return rows;
    }

    const direction = this.sortDirection === 'asc' ? 1 : -1;

    return [...rows].sort((left, right) => {
      const leftValue = this.getSortableValue(left, this.sortActive);
      const rightValue = this.getSortableValue(right, this.sortActive);

      if (leftValue < rightValue) {
        return -1 * direction;
      }

      if (leftValue > rightValue) {
        return 1 * direction;
      }

      return 0;
    });
  }

  private getSortableValue(row: TableRow, key: string): string | number {
    const value = row[key];

    if (key === 'lead') {
      return ((value as LeadCell)?.name ?? '').toLowerCase();
    }

    if (typeof value === 'number') {
      return value;
    }

    return String(value ?? '').toLowerCase();
  }
}
