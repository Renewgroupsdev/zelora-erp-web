import { CommonModule } from '@angular/common';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Component, OnInit } from '@angular/core';
import { Sort, SortDirection } from '@angular/material/sort';
import { Subject, catchError, debounceTime, distinctUntilChanged, of, switchMap, tap } from 'rxjs';
import { CommonDetailCard } from '../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../shared/components/common-table-card/common-table-card';
import {
  CommonFilterState,
  DetailCardData,
  ExportFormat,
  FilterOption,
  LeadCell,
  TableColumn,
  TablePageChangeEvent,
  TableReorderEvent,
  TableRow,
  TableTransferEvent,
} from '../../shared/models/common-components.model';
import { AddLeadForm } from './add-lead-form/add-lead-form';
import { AppointmentForm } from './appointment-form/appointment-form';
import { FollowUpForm } from './follow-up-form/follow-up-form';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiDataService } from '../../core/http/api.service';
import { ApiRoutesConstants } from '../../shared/common-services/api-route-constants';
import { ToastService } from '../../shared/common-services/toast.service';
import { TelephonyService } from '../../core/telephony/telephony.service';
import { CallReportSummary, LeadWorkStats } from '../../core/telephony/telephony.models';
import { CrmFlowService, FlowAppointment, FlowLead } from '../../shared/common-services/crm-flow.service';
import { LeadProfileDialog, LeadProfileDialogResult } from '../../shared/components/lead-profile-dialog/lead-profile-dialog';
import { AuthService } from '../../core/auth/auth.service';
import { COMBO_OFFERS, TREATMENTS } from '../../shared/data/treatment-catalog';

@Component({
  selector: 'app-lead-management',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard],
  templateUrl: './lead-management.html',
  styleUrl: './lead-management.scss',
})
export class LeadManagement implements OnInit {

  /** Every filter/sort/page change pushes here; switchMap cancels whatever request is still
   *  in flight so a burst of changes (or a slow response) never lands more than one active
   *  DB hit at a time - the last change made always wins. */
  private readonly reload$ = new Subject<void>();
  /** Free-text search is debounced separately before it ever reaches reload$, so typing
   *  doesn't fire a request per keystroke. */
  private readonly searchInput$ = new Subject<string>();

  constructor(
    private dialog: MatDialog,
    private router: Router,
    private ApiDataService: ApiDataService,
    private toast: ToastService,
    private telephony: TelephonyService,
    private crmFlow: CrmFlowService,
    private auth: AuthService,
  ) {
    // A saved call outcome changes the lead's status / next follow-up - reload the list.
    this.telephony.outcomeSaved$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.loadLeadData();
      this.loadStats();
    });

    this.searchInput$.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      takeUntilDestroyed(),
    ).subscribe((term) => {
      this.searchTerm = term.trim();
      this.currentPage = 1;
      this.reload$.next();
    });

    this.reload$.pipe(
      switchMap(() => this.fetchLeads()),
      takeUntilDestroyed(),
    ).subscribe();
  }

  readonly staffOptions = ['Priya Sharma', 'Arun Kumar', 'Divya Raj', 'Karthik S', 'Meera Nair'];

  /** Filled from GET telephony/leads/stats and telephony/reports (scoped to the logged-in user). */
  stats: DetailCardData[] = [
    { label: 'Total Leads', value: '1,284', trendText: 'Visible to you', trendDirection: 'neutral', icon: 'bi-person-lines-fill', iconVariant: 'primary' },
    { label: 'Follow-ups Today', value: '2', trendText: 'Due today', trendDirection: 'neutral', icon: 'bi-arrow-repeat', iconVariant: 'blue' },
    { label: 'Overdue', value: '3', trendText: 'Missed follow-ups', trendDirection: 'neutral', icon: 'bi-exclamation-circle', iconVariant: 'orange' },
    { label: 'Not Contacted', value: '4', trendText: 'Never called', trendDirection: 'neutral', icon: 'bi-telephone-x', iconVariant: 'green' },
    { label: 'Conversion Rate', value: '3%', trendText: 'Answered calls, last 30 days', trendDirection: 'neutral', icon: 'bi-graph-up-arrow', iconVariant: 'purple' },
  ];

  filters: FilterOption[] = [
    { key: 'status', label: 'Status', options: ['New', 'Contacted', 'Qualified', 'Lost'] },
    { key: 'source', label: 'Source', options: ['Website', 'Instagram', 'Facebook', 'Google Ads', 'Referral', 'Walk-in', 'Call Center', 'Campaign', 'Meta Campaign'] },
    { key: 'branch', label: 'Branch', multiSelect: true, options: ['Anna Nagar', 'Velachery', 'Indiranagar', 'Coimbatore', 'T Nagar', 'Bengaluru'] },
    { key: 'telecaller', label: 'Telecaller', options: ['Priya Sharma', 'Arun Kumar', 'Divya Raj', 'Karthik S'] },
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
    { key: 'lead', header: 'Name', type: 'lead', width: '13%' },
    { key: 'contact', header: 'Contact', type: 'text', width: '9%' },
    { key: 'gender', header: 'Gender', type: 'text', width: '5%' },
    { key: 'source', header: 'Source', type: 'text', width: '7%' },
    { key: 'service_category', header: 'Service Category', type: 'text', width: '9%' },
    { key: 'service_request', header: 'Service Request', type: 'text', width: '9%' },
    { key: 'branch', header: 'Branch', type: 'branch', width: '9%' },
    { key: 'telecaller', header: 'Telecaller', type: 'text', width: '8%' },
    { key: 'status', header: 'Status', type: 'badge', width: '8%' },
    { key: 'next_follow_up', header: 'Next Follow-up', type: 'text', width: '8%' },
    { key: 'action', header: 'Action', type: 'action', width: '15%', sortable: false },
  ];

  readonly pageSizeOptions = [10, 30, 50, 100];
  isLoading = false;
  /** Raw lead records from the API, keyed by id, so the edit form can be pre-filled with fields
   *  (mobile_no, address, type, reason, ...) that the table row doesn't carry. */
  private leadsById = new Map<number, any>();

  rows: TableRow[] = [];
  currentPage = 1;
  pageSize = 10;
  totalRecords = 0;
  sortActive = 'lead';
  sortDirection: SortDirection = 'asc';
  private searchTerm = '';

  readonly ALL_LEADS_DROP_LIST_ID = 'all-leads-drop-list';
  readonly FOLLOW_UP_DROP_LIST_ID = 'follow-up-drop-list';

  followUpColumns: TableColumn[] = [
    { key: 'lead', header: 'Name', type: 'lead' },
    { key: 'contact', header: 'Contact', type: 'text' },
    { key: 'gender', header: 'Gender', type: 'text' },
    { key: 'source', header: 'Source', type: 'text' },
    { key: 'service_category', header: 'Service Category', type: 'text' },
    { key: 'service_request', header: 'service_request', type: 'text'},
    { key: 'branch', header: 'Branch', type: 'branch' },
    { key: 'assigned_by', header: 'Assigned By', type: 'avatarGroup', width: '155px', sortable: false },
    { key: 'status', header: 'Status', type: 'badge' },
  ];

  followUpRows: TableRow[] = [];

  ngOnInit(): void {
    this.loadLeadData();
    this.loadStats();
  }

  /** Re-runs the current search/filters/sort/page against the API. Safe to call as often as
   *  needed - reload$'s switchMap cancels whatever request is already in flight, so this never
   *  stacks up parallel DB hits. */
  loadLeadData(): void {
    this.reload$.next();
  }

  /** The list, its filtering, sorting and pagination all happen server-side now: the API
   *  already scopes visibility (telecallers get only their assigned leads, branch managers
   *  their branch, admins everything), so only the current page is ever fetched. */
  private fetchLeads() {
    this.isLoading = true;

    const params = [
      `page=${this.currentPage}`,
      `per_page=${this.pageSize}`,
      `sort_by=${encodeURIComponent(this.sortActive)}`,
      `sort_dir=${this.sortDirection || 'asc'}`,
      ...this.buildFilterParams(),
    ];

    return this.ApiDataService.GET(`${ApiRoutesConstants.LEAD_GET_List}?${params.join('&')}`).pipe(
      tap((response: any) => {
        this.isLoading = false;

        if (!response?.success) {
          this.toast.error(response?.message || 'Failed to load leads. Please try again.');
          return;
        }

        const page = response.data;
        const leads: any[] = page?.data ?? [];

        this.leadsById.clear();
        this.rows = leads.map((lead: any) => this.mapLeadToRow(lead));
        this.totalRecords = Number(page?.total ?? this.rows.length);
      }),
      catchError((err: any) => {
        this.isLoading = false;
        this.toast.error(err?.error?.message || 'Failed to load leads. Please try again.');
        console.error('Failed to load leads:', err);
        return of(null);
      }),
    );
  }

  /** Builds the shared query-string filters sent to both the list endpoint and the export
   *  endpoint, so what's on screen and what gets downloaded can never drift apart. */
  private buildFilterParams(): string[] {
    const params: string[] = [];

    if (this.searchTerm) params.push(`search=${encodeURIComponent(this.searchTerm)}`);
    if (this.filterState.status) params.push(`status=${encodeURIComponent(this.filterState.status)}`);
    if (this.filterState.source) params.push(`source=${encodeURIComponent(this.filterState.source)}`);
    this.filterState.branch.forEach((branch) => params.push(`branch[]=${encodeURIComponent(branch)}`));
    if (this.filterState.telecaller) params.push(`telecaller=${encodeURIComponent(this.filterState.telecaller)}`);
    if (this.filterState.dateFrom) params.push(`date_from=${this.filterState.dateFrom}`);
    if (this.filterState.dateTo) params.push(`date_to=${this.filterState.dateTo}`);

    return params;
  }

  /** Maps one lead record from the API's paginated payload into the row shape the table expects.
   *  The API returns both raw ids (source_id, service_category_id, status_id, ...) and their
   *  resolved lookup labels (source_name, service_category_name, status_name, ...) - the labels
   *  are what the list should display. */
  private mapLeadToRow(lead: any): TableRow {
    this.leadsById.set(lead.id, lead);

    return {
      lead: {
        name: lead.name ?? '',
        subtitle: `LD-${String(lead.id ?? '').padStart(5, '0')}`,
      },
      contact: lead.mobile_no ?? '',
      source: lead.source_name || this.formatSource(lead.source_id ?? lead.source),
      service_category: lead.service_category_name ?? '',
      service_request: lead.reason ?? '',
      branch: lead.organization_name ?? lead.location ?? '',
      status: lead.status_name || this.formatStatus(lead.status),
      created_at: this.formatDate(lead.created_at),
      gender: lead.gender ?? '',
      telecaller: lead.assigned_to_name || 'Unassigned',
      next_follow_up: lead.next_follow_up_at ? this.formatDate(lead.next_follow_up_at) : '-',
      action: 'menu',
      id: lead.id,
    };
  }

  private loadStats(): void {
    this.ApiDataService.GET(ApiRoutesConstants.LEAD_WORK_STATS).subscribe({
      next: (res: any) => {
        const s: LeadWorkStats | undefined = res?.data;
        if (!s) return;
        this.setStat('Total Leads', s.assigned.toLocaleString());
        this.setStat('Follow-ups Today', s.follow_ups_today);
        this.setStat('Overdue', s.follow_ups_overdue);
        this.setStat('Not Contacted', s.never_contacted);
      },
      error: () => undefined,
    });

    this.ApiDataService.GET(ApiRoutesConstants.CALL_REPORTS).subscribe({
      next: (res: any) => {
        const r: CallReportSummary | undefined = res?.data;
        if (r) this.setStat('Conversion Rate', `${r.conversion_rate}%`);
      },
      error: () => undefined,
    });
  }

  private setStat(label: string, value: string | number): void {
    this.stats = this.stats.map(stat => (stat.label === label ? { ...stat, value } : stat));
  }

  /** Fallback map for the numeric source id, used only when the API doesn't return source_name. */
  private readonly sourceLabels: Record<number, string> = {
    0: 'Website',
    1: 'Instagram',
    2: 'Facebook',
    3: 'Google Ads',
    4: 'Referral',
    5: 'Walk-in',
    6: 'Call Center',
    7: 'Campaign',
  };

  private formatSource(source: unknown): string {
    if (typeof source === 'number') {
      return this.sourceLabels[source] ?? String(source);
    }
    return (source as string) ?? '';
  }

  /** "active" -> "Active" so it matches the badge styling used for status text. Fallback used
   *  only when the API doesn't return status_name. */
  private formatStatus(status: unknown): string {
    const value = String(status ?? '').trim();
    if (!value) return 'New';
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  /** creator/updater can come back as null, a plain name, or a { name } lookup object. */
  private formatPerson(person: unknown): string {
    if (!person) return '';
    if (typeof person === 'string') return person;
    return (person as { name?: string })?.name ?? '';
  }

  /** ISO timestamp from the API -> "DD-Mon-YYYY" to match the rest of the UI. */
  private formatDate(value: unknown): string {
    if (!value) return '';
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);

    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'short' });
    return `${day}-${month}-${date.getFullYear()}`;
  }

  onSearch(term: string) {
    // Debounced by searchInput$ - only the last term typed within the window actually
    // triggers a request, instead of one per keystroke.
    this.searchInput$.next(term);
  }

  onFilterClick(key: string): void {
    // The common filter card owns the dropdown UI. Keep this hook for future analytics.
    console.debug('Filter opened:', key);
  }

  onFiltersChange(filters: CommonFilterState): void {
    this.filterState = { ...filters, branch: [...filters.branch] };
    this.currentPage = 1;
    this.reload$.next();
  }

  onExport(format: ExportFormat): void {
    const params = [...this.buildFilterParams(), `format=${format}`];

    this.ApiDataService.GET_BLOB(`${ApiRoutesConstants.LEAD_EXPORT}?${params.join('&')}`).subscribe({
      next: (blob: Blob) => this.downloadBlob(blob, `leads-${this.timestampForFilename()}.${format}`),
      error: (err: any) => {
        this.toast.error(err?.error?.message || 'Failed to export leads. Please try again.');
        console.error('Failed to export leads:', err);
      },
    });
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }

  private timestampForFilename(): string {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  }

  get recordCountText(): string {
    return `${this.totalRecords.toLocaleString()} records`;
  }

  get pageInfoText(): string {
    if (!this.totalRecords) {
      return 'Showing 0 leads';
    }

    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    return `Showing ${start}-${end} of ${this.totalRecords.toLocaleString()} leads`;
  }

  onPageChange(event: TablePageChangeEvent) {
    this.currentPage = event.page;
    this.pageSize = event.pageSize;
    this.reload$.next();
  }

  onSortChange(sort: Sort) {
    this.sortActive = sort.active;
    this.sortDirection = sort.direction || 'asc';
    this.currentPage = 1;
    this.reload$.next();
  }

  onRowAction(row: TableRow) {
    // Open a row action menu as needed.
  }

  onEditLead(row: TableRow): void {
    const id = Number(row['id']);

    this.ApiDataService.GET(`${ApiRoutesConstants.LEAD_ADD}/${id}`).subscribe({
      next: (response: any) => {
        const lead = response?.success ? response.data : this.leadsById.get(id);
        this.openAddPopup(lead ?? null);
      },
      error: (err: any) => {
        this.toast.error('Failed to load lead details. Please try again.');
        console.error('Failed to load lead details:', err);
      },
    });
  }

  async onDeleteLead(row: TableRow): Promise<void> {
    const lead = row['lead'] as LeadCell;
    const confirmed = await this.toast.confirm(
      'Delete this lead?',
      `${lead?.name ?? 'This lead'} will be permanently removed.`
    );

    if (!confirmed) {
      return;
    }

    const path = `${ApiRoutesConstants.LEAD_DELETE}/${row['id']}`;
    this.ApiDataService.Delete(path, {}).subscribe({
      next: (response: any) => {
        if (response && response.success !== false) {
          this.toast.success('Lead deleted successfully');
          this.loadLeadData();
        } else {
          this.toast.error(response?.message || 'Failed to delete lead. Please try again.');
        }
      },
      error: (err: any) => {
        this.toast.error(err?.error?.message || 'Failed to delete lead. Please try again.');
        console.error('Failed to delete lead:', err);
      },
    });
  }

   onRowReorder(event: TableReorderEvent) {
    // Rows were only reordered within one table (see (rowTransfer) below for cross-table
    // moves); `event.rows` is already the reordered array, nothing else to sync here.
  }

  onRowTransfer(event: TableTransferEvent): void {
    const fromAllLeads = event.previousContainerId === this.ALL_LEADS_DROP_LIST_ID;
    const sourceList = fromAllLeads ? this.rows : this.followUpRows;
    const movedRow = sourceList[event.previousIndex];

    if (!movedRow) {
      return;
    }

    if (fromAllLeads) {
      this.moveLeadToFollowUp(movedRow, event.currentIndex);
    } else {
      this.moveLeadToAllLeads(movedRow, event.currentIndex);
    }
  }

  openFollowUp(row: TableRow): void {
    this.openLeadProfile(row, 'lead');
  }

  /** The "Call" row action. The telephony dock takes over from here: live call bar
   *  (hold / transfer / notes / hang up), then the call outcome form, which saves the
   *  follow-up, appointment or conversion against this lead on the backend. */
  onCallLead(row: TableRow): void {
    if (this.telephony.onCall()) {
      this.toast.warning('You are already on a call.');
      return;
    }
    if (!String(row['contact'] ?? '').trim()) {
      this.toast.error('This lead has no phone number on file.');
      return;
    }

    this.telephony.dial({ lead_id: Number(row['id']) }).subscribe({
      error: (err: any) => this.toast.error(err?.error?.message || 'Unable to start the call.'),
    });
  }

  private openLeadProfile(row: TableRow, stage: 'lead' | 'appointment'): void {
    const dialogRef = this.dialog.open(LeadProfileDialog, {
      width: '600px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '92vh',
      autoFocus: false,
      panelClass: 'lead-profile-dialog',
      data: {
        lead: this.toFlowLead(row),
        stage,
        telecallers: this.staffOptions,
        isNewBooking: stage === 'appointment',
        treatments: TREATMENTS,
        combos: COMBO_OFFERS,
      },
    });

    dialogRef.afterClosed().subscribe((result: LeadProfileDialogResult | undefined) => {
      if (!result || result.action === 'close') return;
      this.handleLeadProfileResult(row, result);
    });
  }

  private handleLeadProfileResult(row: TableRow, result: LeadProfileDialogResult): void {
    if (result.action === 'followup') {
      this.crmFlow.addFollowUp(result.lead);
      this.removeLeadRow();
      this.toast.success('Follow-up logged', `${result.lead.name} moved to Follow-Ups.`);
      this.router.navigate(['/app/follow-ups']);
      return;
    }

    if (result.action === 'appointment' || result.action === 'book-appointment') {
      const appointment: FlowAppointment = result.appointment ?? {
        ...result.lead,
        service: '', date: result.scheduledDate ?? '', startTime: result.scheduledTime ?? '',
        staff: result.lead.telecaller, total: 0, paymentMethod: '', paymentStatus: 'Pending', status: 'Appointment',
      };

      this.crmFlow.addAppointment(appointment);
      this.removeLeadRow();
      this.toast.success('Appointment booked', `${appointment.name} moved to Appointments.`);
      this.router.navigate(['/app/appointments']);
    }
  }

  private removeLeadRow(): void {
    // The row was already moved into a follow-up/appointment on the backend - refetch the
    // current page instead of patching locally now that the list is server-paginated.
    this.loadLeadData();
  }

  private toFlowLead(row: TableRow): FlowLead {
    const lead = row['lead'] as LeadCell;
    return {
      id: String(row['id'] ?? lead.subtitle ?? lead.name),
      name: lead.name,
      phone: String(row['contact'] ?? ''),
      gender: String(row['gender'] ?? ''),
      source: String(row['source'] ?? ''),
      category: String(row['service_category'] ?? ''),
      request: String(row['service_request'] ?? ''),
      branch: String(row['branch'] ?? ''),
      telecaller: this.auth.currentUser()?.name ?? String(row['telecaller'] ?? ''),
      notes: '',
      followUpDate: '',
      status: 'Valid',
    };
  }

  private moveLeadToFollowUp(row: TableRow, targetIndex: number = this.followUpRows.length): void {
    const sourceIndex = this.rows.indexOf(row);
    if (sourceIndex === -1) {
      return;
    }

    this.rows.splice(sourceIndex, 1);

    row['originalStatus'] = row['status'];

    row['status'] = 'Contacted';
    row['assigned_by'] = [
      {
        name: 'Priya Sharma',
        empNo: 'EMP-1042',
        image: 'assets/avatars/user-avatar.svg',
      },
    ];

    this.followUpRows.splice(targetIndex, 0, row);

    this.rows = [...this.rows];
    this.followUpRows = [...this.followUpRows];
  }

  private moveLeadToAllLeads(row: TableRow, targetIndex: number = this.rows.length): void {
    const sourceIndex = this.followUpRows.indexOf(row);
    if (sourceIndex === -1) {
      return;
    }

    this.followUpRows.splice(sourceIndex, 1);

    if (row['originalStatus'] !== undefined) {
      row['status'] = row['originalStatus'];
      delete row['originalStatus'];
    }

    delete row['assigned_by'];

    this.rows.splice(targetIndex, 0, row);

    this.rows = [...this.rows];
    this.followUpRows = [...this.followUpRows];
  }

  openAddPopup(data: any = null): void {
    const dialogRef = this.dialog.open(AddLeadForm, {
      width: '920px',
      maxWidth: 'calc(100vw - 32px)',
      maxHeight: '92vh',
      autoFocus: false,
      restoreFocus: true,
      disableClose: true,
      panelClass: 'add-lead-dialog',
      data,
    });

    dialogRef.afterClosed().subscribe((leadData) => {
      if (!leadData) return;

      // The dialog already saved the lead via its own POST/PUT call - refetch instead of
      // patching locally so edits replace the existing row instead of duplicating it.
      this.loadLeadData();
    });
  }

  openAppointment(row: TableRow): void {
    this.openLeadProfile(row, 'appointment');
  }

  sendToBranch(row: TableRow): void {
    console.log('Send to branch:', row);
  }
}
