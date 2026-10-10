import { CommonModule } from '@angular/common';
import Swal from 'sweetalert2';
import { Component, OnDestroy, OnInit } from '@angular/core';
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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FlowLead, FollowUpEntry } from '../../shared/common-services/crm-flow.service';
import { LeadProfileDialog, LeadProfileDialogResult } from '../../shared/components/lead-profile-dialog/lead-profile-dialog';
import { TelephonyService } from '../../core/telephony/telephony.service';
import { FollowUpLead } from '../../core/telephony/telephony.models';
import { ApiDataService } from '../../core/http/api.service';
import { ApiRoutesConstants } from '../../shared/common-services/api-route-constants';

const QUICK_ACTIONS: QuickAction[] = [
  { key: 'call', icon: 'bi-telephone-outbound', label: 'Call Lead', variant: 'primary' },
  { key: 'appointment', icon: 'bi-calendar2-check', label: 'Book Appointment', variant: 'default' },
  { key: 'call-log', icon: 'bi-clock-history', label: 'View Call Log', variant: 'default' },
];

/** A freshly assigned (Contacted) lead is checked by the telecaller first: genuine lead or not. */
const VALIDATION_ACTIONS: QuickAction[] = [
  { key: 'valid', icon: 'bi-check-lg', label: 'Valid lead', variant: 'default' },
  { key: 'invalid', icon: 'bi-x-lg', label: 'Invalid lead', variant: 'danger' },
];

@Component({
  selector: 'app-followups',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard],
  templateUrl: './followups.html',
  styleUrl: './followups.scss',
})
export class Followups implements OnInit, OnDestroy {

  constructor(
    private dialog: MatDialog,
    private toast: ToastService,
    private router: Router,
    private telephony: TelephonyService,
    private apiDataService: ApiDataService,
  ) {
    // A call outcome (follow-up / callback / appointment) changes this list, so reload it when one is saved.
    this.telephony.outcomeSaved$.pipe(takeUntilDestroyed()).subscribe(() => this.loadFollowUps());
  }


  stats: DetailCardData[] = [
    { label: 'Total Leads', value: 0, trendText: 'In your follow-up queue', trendDirection: 'neutral', icon: 'bi-person-lines-fill', iconVariant: 'primary' },
    { label: 'Total Follow-Ups', value: 0, trendText: 'Across all telecallers', trendDirection: 'neutral', icon: 'bi-arrow-repeat', iconVariant: 'blue' },
    { label: 'Due Today', value: 0, trendText: 'Needs attention', trendDirection: 'neutral', icon: 'bi-alarm', iconVariant: 'orange' },
    { label: 'Completed', value: 0, trendText: 'Converted to customers', trendDirection: 'neutral', icon: 'bi-check-circle', iconVariant: 'green' },
    { label: 'Appointment', value: 0, trendText: 'Appointments booked', trendDirection: 'neutral', icon: 'bi-calendar-check', iconVariant: 'purple' },
  ];

  /** Cards are counted from the rows the API returned - no made-up numbers. */
  private updateStats(): void {
    const rows = this.allRows;
    const today = new Date().toDateString();
    const count = (fn: (r: TableRow) => boolean) => rows.filter(fn).length;
    const values = [
      rows.length,
      count(r => !!r['follow_up_at']),
      count(r => !!r['follow_up_at'] && new Date(String(r['follow_up_at'])).toDateString() === today),
      count(r => r['status'] === 'Customer'),
      count(r => r['status'] === 'Schedule'),
    ];
    this.stats = this.stats.map((stat, i) => ({ ...stat, value: values[i] }));
  }

  filters: FilterOption[] = [
    { key: 'status', label: 'Status', options: ['Follow-Ups', 'Cool-Follow-Ups', 'Hot-Leads', 'Schedule', 'Customer'] },
    { key: 'type', label: 'Follow-up Type', options: ['General', 'Cool', 'Hot'] },
    { key: 'source', label: 'Source', options: [] },
    { key: 'branch', label: 'Branch', multiSelect: true, options: [] },
    { key: 'telecaller', label: 'Telecaller', options: [] },
    { key: 'date', label: 'Date' },
  ];

  filterState: CommonFilterState = {
    status: null,
    source: null,
    branch: [],
    telecaller: null,
    dateFrom: null,
    dateTo: null,
    type: null,
  };

  /** `follow_ups.type` (0/1/2) -> the label shown/filtered on in this table. */
  private readonly FOLLOW_UP_TYPE_LABELS = ['General', 'Cool', 'Hot'];

  columns: TableColumn[] = [
    { key: 'lead', header: 'Name', type: 'lead',width: '14%' },
    { key: 'contact', header: 'Contact', type: 'text' },
    { key: 'gender', header: 'Gender', type: 'text' },
    { key: 'source', header: 'Source', type: 'text' },
    { key: 'service_category', header: 'Service Category', type: 'text' },
    { key: 'service_request', header: 'Service Request', type: 'text'},
    { key: 'followup_count', header: 'Follow-Up Count', type: 'text' },
    { key: 'follow_up_date', header: 'Follow-Up Date', type: 'text' },
    { key: 'follow_up_type_label', header: 'Type', type: 'badge' },
    { key: 'branch', header: 'Branch', type: 'branch' },
    { key: 'telecaller', header: 'Telecaller Assigned', type: 'avatarGroup', sortable: false, width: '140px' },
    { key: 'status', header: 'Status', type: 'badge' },
    { key: 'action', header: 'Action', type: 'quickActions', sortable: false, width: '90px' },
  ];

  readonly pageSizeOptions = [10, 30, 50, 100];

  allRows: TableRow[] = [];

  rows: TableRow[] = [];
  loading = false;
  currentPage = 1;
  pageSize = 10;
  totalRecords = 0;
  /** 'priority' is not a column: it puts the calls due soonest first (red, then orange, then the rest by time). */
  sortActive = 'priority';
  sortDirection: SortDirection = 'asc';
  private searchTerm = '';

  /** Real lead_status name -> id, so the Status filter can be sent server-side as `status_id`. */
  private statusIdByName = new Map<string, number>();

  private urgencyTimer?: ReturnType<typeof setInterval>;

  /** Source / Branch / Telecaller filter options come from the API instead of a fixed list. */
  private loadFilterOptions(): void {
    const setOptions = (key: string, names: string[]) =>
      (this.filters = this.filters.map(f => (f.key === key ? { ...f, options: [...new Set(names.filter(Boolean))] } : f)));

    this.apiDataService.GET(`${ApiRoutesConstants.Source_List_Options}?per_page=100`).subscribe({
      next: (res: any) => setOptions('source', (res?.data?.data ?? res?.data ?? []).map((s: any) => s?.source_name)),
      error: () => undefined,
    });
    this.apiDataService.GET(`${ApiRoutesConstants.Branch_List_Options}?per_page=100`).subscribe({
      next: (res: any) => setOptions('branch', (res?.data?.data ?? res?.data ?? []).map((b: any) => b?.name)),
      error: () => undefined,
    });
    this.telephony.telecallers().subscribe({
      next: rows => setOptions('telecaller', rows.map(r => r.name)),
      error: () => undefined,
    });
  }

  ngOnInit(): void {
    this.loadFilterOptions();
    this.loadStatusOptions();
    this.loadFollowUps();

    // Row colours change as the call-back time approaches, so re-evaluate them every 30 seconds.
    this.urgencyTimer = setInterval(() => {
      this.allRows.forEach(row => (row['_urgency'] = this.urgencyOf(row['follow_up_at'])));
      this.refreshRows();
    }, 30_000);
  }

  ngOnDestroy(): void {
    clearInterval(this.urgencyTimer);
  }

  /** red = due in 5 minutes or less (or overdue), orange = due within 30 minutes. */
  private urgencyOf(value: unknown): '' | 'soon' | 'urgent' {
    const at = value ? new Date(String(value)).getTime() : NaN;
    if (Number.isNaN(at)) return '';
    const minutes = (at - Date.now()) / 60_000;
    return minutes <= 5 ? 'urgent' : minutes <= 30 ? 'soon' : '';
  }

  /** Loads the real lead_status names (Follow-Ups, Cool-Follow-Ups, Hot-Leads, ...) for the
   *  Status filter, same fix as Lead Management's - the options used to be made up and never
   *  matched a real row. */
  private loadStatusOptions(): void {
    this.apiDataService.GET(`${ApiRoutesConstants.Status_List_Options}?per_page=100`).subscribe({
      next: (res: any) => {
        const list: any[] = res?.data?.data ?? [];
        this.statusIdByName = new Map(list.filter(s => s?.name).map(s => [s.name, Number(s.id)]));
        const names = list.map(s => s?.name).filter((name: unknown): name is string => !!name);

        if (names.length) {
          this.filters = this.filters.map(f => (f.key === 'status' ? { ...f, options: names } : f));
        }
      },
      error: () => undefined,
    });
  }

  /** Loads leads with an open or past follow-up from the backend, scoped there to what the
   *  logged-in user may see (a telecaller only gets their own assigned leads via `assigned_to`).
   *  Search, status and follow-up type are sent as query params so the backend does the
   *  filtering. Each row already carries its recent call history, so the second call onward
   *  shows the previous outcome without another round trip. */
  private loadFollowUps(): void {
    this.loading = true;

    const statusId = this.filterState.status ? this.statusIdByName.get(this.filterState.status) : undefined;
    const type = this.filterState.type ? this.FOLLOW_UP_TYPE_LABELS.indexOf(this.filterState.type) : undefined;

    this.telephony.followupQueue({
      per_page: 200,
      search: this.searchTerm || undefined,
      status_id: statusId,
      type: type !== undefined && type >= 0 ? type : undefined,
    }).subscribe({
      next: (leads) => {
        const rows = leads.map((lead) => this.leadToRow(lead));
        this.allRows = rows;
        this.updateStats();
        this.refreshRows();
      },
      error: (err: any) => {
        this.loading = false;
        this.toast.error(err?.error?.message || 'Could not load follow-ups.');
      },
    });
  }

  private leadToRow(lead: FollowUpLead): TableRow {
    const callers: CallerAvatar[] = lead.assigned_to_name
      ? [{ name: lead.assigned_to_name, empNo: lead.assigned_to_emp_code ?? '', image: lead.assigned_to_photo ?? undefined }]
      : [];

    const callLog: CallerLogEntry[] = (lead.caller_histories ?? []).map((history) => ({
      telecallerName: history.telecaller?.name ?? lead.assigned_to_name ?? 'Unknown',
      empNo: history.telecaller?.emp_code ?? '',
      dateTime: this.formatDateTime(history.created_at),
      notes: history.notes ?? '',
    }));

    return {
      id: lead.id,
      lead: { name: lead.name, subtitle: `LD-${String(lead.id).padStart(5, '0')}` },
      contact: lead.mobile_no,
      gender: lead.gender ?? '',
      source: lead.source_name ?? '',
      service_category: lead.service_category_name ?? '',
      service_request: lead.reason ?? '',
      followup_count: lead.follow_ups_count,
      follow_up_at: lead.next_follow_up_at ?? '',
      _urgency: this.urgencyOf(lead.next_follow_up_at),
      follow_up_date: lead.next_follow_up_at
        ? this.formatDateTime(lead.next_follow_up_at)
        : (callLog.length ? callLog[callLog.length - 1].dateTime : ''),
      branch: lead.organization_name ?? '',
      telecaller: callers,
      status: lead.status_name ?? '',
      follow_up_type_label: this.FOLLOW_UP_TYPE_LABELS[lead.follow_up_type ?? 0] ?? '',
      action: lead.status_name === 'Contacted' ? [...QUICK_ACTIONS, ...VALIDATION_ACTIONS] : QUICK_ACTIONS,
      callLogEntries: callLog,
    };
  }

  /** Matches the "DD-Mon-YYYY, hh:mm AM/PM" format the mock data used, so sorting/parsing
   *  elsewhere in this component (see toIsoDate) keeps working against real API dates. */
  private formatDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'short' });
    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${day}-${month}-${date.getFullYear()}, ${time}`;
  }

  onSearch(term: string): void {
    this.searchTerm = term.trim().toLowerCase();
    this.currentPage = 1;
    this.loadFollowUps();
  }

  onFilterClick(key: string): void {
    console.debug('Filter opened:', key);
  }

  onFiltersChange(filters: CommonFilterState): void {
    this.filterState = { ...filters, branch: [...filters.branch] };
    this.currentPage = 1;
    this.loadFollowUps();
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
    else if (action === 'call') this.callLead(row);
    else if (action === 'valid' || action === 'invalid') void this.validateLead(row, action === 'valid');
  }

  /** Dials over the telephony backend (the number is matched to its CRM lead there). The
   *  telephony dock then shows the live call and asks for the outcome - follow-up,
   *  appointment or conversion - which is saved against the lead on the backend. */
  private callLead(row: TableRow): void {
    const phone = String(row['contact'] ?? '').trim();

    if (!phone) {
      this.toast.error('This lead has no phone number on file.');
      return;
    }
    if (this.telephony.onCall()) {
      this.toast.warning('You are already on a call.');
      return;
    }

    this.telephony.dial({ phone_number: phone }).subscribe({
      error: (err: any) => this.toast.error(err?.error?.message || 'Unable to start the call.'),
    });
  }

  /** Telecaller verdict. Invalid (note required) unassigns the lead and sends it back to Lead Management. */
  private async validateLead(row: TableRow, valid: boolean): Promise<void> {
    let reason = '';
    if (!valid) {
      const result = await Swal.fire({
        title: 'Mark this lead as invalid?',
        input: 'text',
        inputLabel: 'Note (required)',
        inputPlaceholder: 'e.g. wrong number, not interested',
        inputValidator: (value: string) => (value.trim() ? null : 'Add a note explaining why this lead is invalid.'),
        showCancelButton: true,
        confirmButtonText: 'Mark invalid',
        confirmButtonColor: '#dc2626',
      });
      if (!result.isConfirmed) return;
      reason = String(result.value ?? '').trim();
    }

    this.apiDataService.POST(`${ApiRoutesConstants.LEAD_VALIDATE}/${row['id']}/validate`, { valid, reason }).subscribe({
      next: (res: any) => {
        this.toast.success(res?.message || (valid ? 'Lead marked valid.' : 'Lead marked invalid.'));
        this.loadFollowUps();
      },
      error: (err: any) => this.toast.error(err?.error?.message || 'Unable to update the lead. Please try again.'),
    });
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

  /** Opens the lead's follow-up card. The telecaller and branch come from the lead itself (shown, not editable),
   *  and the next call-back / appointment is saved to the database by the dialog. */
  openFollowUpProfile(row: TableRow): void {
    const flowLead = this.toFlowLead(row);
    const dialogRef = this.dialog.open(LeadProfileDialog, {
      width: '600px', maxWidth: 'calc(100vw - 24px)', maxHeight: '92vh', autoFocus: false,
      panelClass: 'lead-profile-dialog',
      data: {
        lead: flowLead,
        stage: 'followup',
        telecallers: flowLead.telecaller ? [flowLead.telecaller] : [],
        branches: flowLead.branch ? [flowLead.branch] : [],
        callLogEntries: (row['callLogEntries'] as CallerLogEntry[]) ?? [],
      },
    });
    dialogRef.afterClosed().subscribe((result: LeadProfileDialogResult | undefined) => {
      if (result?.saved) this.loadFollowUps();
    });
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

  private refreshRows(): void {
    this.loading = true;

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

    this.loading = false;
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
      if (this.filterState.type && row['follow_up_type_label'] !== this.filterState.type) return false;
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

    if (this.sortActive === 'priority') {
      const rank = (row: TableRow) => ({ urgent: 0, soon: 1 } as Record<string, number>)[String(row['_urgency'])] ?? 2;
      const time = (row: TableRow) => (row['follow_up_at'] ? new Date(String(row['follow_up_at'])).getTime() : Infinity);
      return [...rows].sort((a, b) => rank(a) - rank(b) || time(a) - time(b));
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
