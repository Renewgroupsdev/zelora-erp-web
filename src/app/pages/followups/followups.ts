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
  QuickAction,
  TableColumn,
  TablePageChangeEvent,
  TableRow,
  CommonFilterState,
} from '../../shared/models/common-components.model';
import { CallLogHistoryDialog } from '../../shared/components/call-log-history-dialog/call-log-history-dialog';
import { ToastService } from '../../shared/common-services/toast.service';
import { Router } from '@angular/router';
import { CrmFlowService, FlowAppointment, FlowLead, FollowUpEntry } from '../../shared/common-services/crm-flow.service';
import { LeadProfileDialog, LeadProfileDialogResult } from '../../shared/components/lead-profile-dialog/lead-profile-dialog';

const QUICK_ACTIONS: QuickAction[] = [
  { key: 'appointment', icon: 'bi-calendar2-check', label: 'Book Appointment', variant: 'primary' },
  { key: 'call-log', icon: 'bi-clock-history', label: 'View Call Log', variant: 'default' },
];

interface FollowUpSeed {
  name: string;
  phone: string;
  gender: string;
  source: string;
  service_category: string;
  service_request: string;
  branch: string;
  status: string;
  followup_count: number;
  callers: CallerAvatar[];
  callLog: CallerLogEntry[];
}

export const FOLLOW_UP_SEEDS: FollowUpSeed[] = [
  {
    name: 'Ananya Sharma',
    phone: '+91 98765 43210',
    branch: 'Anna Nagar',
    status: 'Contacted',
    gender: 'F',
    source: 'Website', 
    service_category: 'Hair', 
    followup_count: 3,
    service_request: 'Hair Loss',
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
    gender: 'M',
    followup_count: 2,
    source: 'Referral',
    service_category: 'Dermatology',
    service_request: 'Acne Care',
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
    gender: 'F',
    source: 'Website',
    followup_count: 4,
    service_category: 'Skin Care',
    service_request: 'Anti-Aging Treatment',
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
    gender: 'M',
    source: 'Referral',
    followup_count: 1,
    service_category: 'Dermatology',
    service_request: 'Acne Care',
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
    gender: 'F',
    source: 'Website',
    followup_count: 2,
    service_category: 'Skin Care',
    service_request: 'Anti-Aging Treatment',
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
    gender: 'M',
    source: 'Referral',
    followup_count: 3,
    service_category: 'Dermatology',
    service_request: 'Acne Care',
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

  constructor(
    private dialog: MatDialog,
    private toast: ToastService,
    private router: Router,
    private crmFlow: CrmFlowService,
  ) { }

  readonly staffOptions = ['Priya Sharma', 'Arun Kumar', 'Divya Raj', 'Karthik S', 'Meera Nair'];

  stats: DetailCardData[] = [
    { label: 'Total Leads', value: '1,284', trendText: '8.4% this month', trendDirection: 'up', icon: 'bi-person-lines-fill', iconVariant: 'primary' },
    { label: 'Total Follow-Ups', value: FOLLOW_UP_SEEDS.length, trendText: 'Across all telecallers', trendDirection: 'neutral', icon: 'bi-arrow-repeat', iconVariant: 'blue' },
    { label: 'Due Today', value: 2, trendText: 'Needs attention', trendDirection: 'up', icon: 'bi-alarm', iconVariant: 'orange' },
    { label: 'Completed', value: 3, trendText: 'Follow-up closed', trendDirection: 'up', icon: 'bi-check-circle', iconVariant: 'green' },
    { label: 'Appointment', value: 12, trendText: 'Confirmed appointments', trendDirection: 'up', icon: 'bi-calendar-check', iconVariant: 'purple' },
  ];

  filters: FilterOption[] = [
    { key: 'status', label: 'Status', options: ['Contacted', 'Qualified', 'Pending', 'Lost', 'Completed'] },
    { key: 'source', label: 'Source', options: ['Website', 'Instagram', 'Facebook', 'Google Ads', 'Referral', 'Walk-in', 'Call Center', 'Campaign'] },
    { key: 'branch', label: 'Branch', multiSelect: true, options: ['Anna Nagar', 'Velachery', 'Indiranagar', 'Coimbatore', 'T Nagar', 'Bengaluru'] },
    { key: 'telecaller', label: 'Telecaller', options: ['Priya', 'Karthik Iyer', 'Meera Nair'] },
    { key: 'date', label: 'Date' },
  ];

  filterState: CommonFilterState = {
    status: null,
    source: null,
    branch: [],
    telecaller: null,
    dateFrom: null,
    dateTo: null,
  };

  columns: TableColumn[] = [
    { key: 'lead', header: 'Name', type: 'lead' },
    { key: 'contact', header: 'Contact', type: 'text' },
    { key: 'gender', header: 'Gender', type: 'text' },
    { key: 'source', header: 'Source', type: 'text' },
    { key: 'service_category', header: 'Service Category', type: 'text' },
    { key: 'service_request', header: 'Service Request', type: 'text'},
    { key: 'followup_count', header: 'Follow-Up Count', type: 'text' },
    { key: 'follow_up_date', header: 'Follow-Up Date', type: 'text' },
    { key: 'branch', header: 'Branch', type: 'branch' },
    { key: 'telecaller', header: 'Telecaller Assigned', type: 'avatarGroup', sortable: false, width: '140px' },
    { key: 'status', header: 'Status', type: 'badge' },
    { key: 'action', header: 'Action', type: 'quickActions', sortable: false, width: '90px' },
  ];

  readonly pageSizeOptions = [10, 30, 50, 100];

  allRows: TableRow[] = FOLLOW_UP_SEEDS.map((seed, index) => ({
    lead: {
      name: seed.name,
      subtitle: `LD-${String(284 - index).padStart(5, '0')}`,
    },
    contact: seed.phone,
    gender: seed.gender,
    source: seed.source,
    service_category: seed.service_category,
    service_request: seed.service_request,
    follow_up_date: seed.callLog.length ? seed.callLog[seed.callLog.length - 1].dateTime : '',
    branch: seed.branch,
    telecaller: seed.callers,
    status: seed.status,
    action: QUICK_ACTIONS,
    followup_count: seed.callLog.length,
    callLogEntries: seed.callLog,
  }));

  rows: TableRow[] = [];
  currentPage = 1;
  pageSize = 10;
  totalRecords = 0;
  sortActive = 'lead';
  sortDirection: SortDirection = 'asc';
  private searchTerm = '';

  ngOnInit(): void {
    const imported = this.crmFlow.getFollowUps().map((lead, index) => this.flowLeadToRow(lead, index));
    this.allRows = [...imported, ...this.allRows.filter(row => !imported.some(item => item['id'] === row['id']))];
    this.refreshRows();
  }

  onSearch(term: string): void {
    this.searchTerm = term.trim().toLowerCase();
    this.currentPage = 1;
    this.refreshRows();
  }

  onFilterClick(key: string): void {
    console.debug('Filter opened:', key);
  }

  onFiltersChange(filters: CommonFilterState): void {
    this.filterState = { ...filters, branch: [...filters.branch] };
    this.currentPage = 1;
    this.refreshRows();
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

  onQuickAction({ row, action }: { row: TableRow; action: string }): void {
    if (action === 'appointment') this.openFollowUpProfile(row);
    else if (action === 'call-log') this.viewCallLog(row);
  }

  viewCallLog(row: TableRow): void {
    const lead = row['lead'] as LeadCell;
    const entries = (row['callLogEntries'] as CallerLogEntry[]) ?? [];

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

  openFollowUpProfile(row: TableRow): void {
    const dialogRef = this.dialog.open(LeadProfileDialog, {
      width: '600px', maxWidth: 'calc(100vw - 24px)', maxHeight: '92vh', autoFocus: false,
      panelClass: 'lead-profile-dialog',
      data: { lead: this.toFlowLead(row), stage: 'followup', telecallers: this.staffOptions, callLogEntries: (row['callLogEntries'] as CallerLogEntry[]) ?? [] },
    });
    dialogRef.afterClosed().subscribe((result: LeadProfileDialogResult | undefined) => {
      if (!result || result.action === 'close') return;

      if (result.action === 'appointment') {
        this.moveToAppointments(result.lead, result.scheduledDate, result.scheduledTime);
        return;
      }

      // Just logging a follow-up note - update the row's history in place without moving it out of the table.
      this.crmFlow.addFollowUp(result.lead);
      this.allRows = this.allRows.map(existing => {
        if (this.rowId(existing) !== result.lead.id) return existing;
        return {
          ...existing,
          branch: result.lead.branch,
          follow_up_date: result.lead.followUpDate || existing['follow_up_date'],
          followUpHistory: result.lead.history ?? [],
        };
      });
      this.refreshRows();
    });
  }

  /** "Book Appointment" from the follow-up's Schedule mode moves the record straight to the
   *  Appointment page with just the date/time set - no separate booking popup. Treatment, payment
   *  and other details get filled in from there via the appointment profile's "Confirm as Client" step. */
  private moveToAppointments(leadData: FlowLead, scheduledDate?: string, scheduledTime?: string): void {
    const appointment: FlowAppointment = {
      ...leadData,
      service: '', date: scheduledDate ?? '', startTime: scheduledTime ?? '', staff: leadData.telecaller,
      total: 0, paymentMethod: '', paymentStatus: 'Pending', status: 'Appointment',
    };

    this.crmFlow.addAppointment(appointment);
    this.crmFlow.removeFollowUp(leadData.id);
    this.allRows = this.allRows.filter(row => this.rowId(row) !== leadData.id);
    this.refreshRows();
    this.toast.success('Appointment booked', `${appointment.name} has been moved to Appointments.`);
    this.router.navigate(['/app/appointments']);
  }

  private rowId(row: TableRow): string {
    const lead = row['lead'] as LeadCell;
    return String(row['id'] ?? lead.subtitle ?? lead.name);
  }

  private toFlowLead(row: TableRow): FlowLead {
    const lead = row['lead'] as LeadCell;
    const caller = ((row['telecaller'] as CallerAvatar[]) ?? [])[0]?.name ?? '';
    return { id: this.rowId(row), name: lead.name, phone: String(row['contact'] ?? ''), gender: String(row['gender'] ?? ''), source: String(row['source'] ?? ''), category: String(row['service_category'] ?? ''), request: String(row['service_request'] ?? ''), branch: String(row['branch'] ?? ''), telecaller: caller, notes: String(row['notes'] ?? ''), followUpDate: String(row['follow_up_date'] ?? ''), status: 'Follow-Up', history: (row['followUpHistory'] as FollowUpEntry[]) ?? [] };
  }

  private flowLeadToRow(lead: FlowLead, index: number): TableRow {
    return { id: lead.id, lead: { name: lead.name, subtitle: `FU-${String(index + 1).padStart(4, '0')}` }, contact: lead.phone, gender: lead.gender, source: lead.source, service_category: lead.category, service_request: lead.request, follow_up_date: lead.followUpDate || 'Not scheduled', branch: lead.branch, telecaller: lead.telecaller ? [{ name: lead.telecaller, empNo: lead.telecaller }] : [], status: 'Contacted', action: QUICK_ACTIONS, callLogEntries: lead.notes ? [{ telecallerName: lead.telecaller, empNo: lead.telecaller, dateTime: 'Today', notes: lead.notes }] : [], followUpHistory: lead.history ?? [] };
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
    return this.allRows.filter((row) => {
      const lead = row['lead'] as LeadCell;
      const callers = (row['telecaller'] as CallerAvatar[]) ?? [];
      const followUpDate = this.toIsoDate(String(row['follow_up_date'] ?? ''));

      if (this.searchTerm) {
        const haystack = [
          lead.name,
          lead.subtitle ?? '',
          row['contact'],
          row['branch'],
          row['status'],
          row['source'],
          ...callers.map(c => c.name),
        ].join(' ').toLowerCase();

        if (!haystack.includes(this.searchTerm)) return false;
      }

      if (this.filterState.status && row['status'] !== this.filterState.status) return false;
      if (this.filterState.source && row['source'] !== this.filterState.source) return false;
      if (this.filterState.branch.length > 0 && !this.filterState.branch.includes(String(row['branch']))) return false;
      if (this.filterState.telecaller && !callers.some(c => c.name === this.filterState.telecaller)) return false;
      if (this.filterState.dateFrom && (!followUpDate || followUpDate < this.filterState.dateFrom)) return false;
      if (this.filterState.dateTo && (!followUpDate || followUpDate > this.filterState.dateTo)) return false;

      return true;
    });
  }

  private toIsoDate(value: string): string {
    const match = value.match(/(\d{2})-(\w{3})-(\d{4})/);
    if (!match) return '';

    const months: Record<string, string> = {
      Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
      Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
    };

    const month = months[match[2]];
    return month ? `${match[3]}-${month}-${match[1]}` : '';
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
