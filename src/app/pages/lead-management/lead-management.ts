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
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
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
    this.telephony.outcomeSaved$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.loadLeadData();
      this.loadFilterList();
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

  readonly staffOptions = [];

  stats: DetailCardData[] = [
    { label: 'Total Leads', value: '0', trendText: 'Visible to you', trendDirection: 'neutral', icon: 'bi-person-lines-fill', iconVariant: 'primary' },
    { label: 'Follow-ups Today', value: '0', trendText: 'Due today', trendDirection: 'neutral', icon: 'bi-arrow-repeat', iconVariant: 'blue' },
    { label: 'Overdue', value: '0', trendText: 'Missed follow-ups', trendDirection: 'neutral', icon: 'bi-exclamation-circle', iconVariant: 'orange' },
    { label: 'Not Contacted', value: '0', trendText: 'Never called', trendDirection: 'neutral', icon: 'bi-telephone-x', iconVariant: 'green' },
    { label: 'Conversion Rate', value: '0%', trendText: 'Answered calls, last 30 days', trendDirection: 'neutral', icon: 'bi-graph-up-arrow', iconVariant: 'purple' },
  ];

  filters: FilterOption[] = [
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
  allRows: TableRow[] = [];
  private leadsById = new Map<number, any>();
  readonly type: number = 2;

  rows: TableRow[] = [];
  loading = false;
  currentPage = 1;
  pageSize = 10;
  totalRecords = 0;
  sortActive = 'lead';
  sortDirection: SortDirection = 'asc';
  private searchTerm = '';
  sourceOptions: any = [];
  typeOptions: any = [];
  statusOptions: any = [];

  private statusIdByName = new Map<string, number>();
  private sourceIdByName = new Map<string, number>();
  private branchIdByName = new Map<string, number>();
  private telecallerIdByName = new Map<string, number>();

  ngOnInit(): void {
    this.loadFilterList();
    this.loadLeadData();
  }

  private loadFilterList(): void {
    forkJoin({
      statuses: this.ApiDataService.GET(`${ApiRoutesConstants.Status_List_Options}`).pipe(
        catchError(() => of(null))
      ),
      sources: this.ApiDataService.GET(`${ApiRoutesConstants.Source_List_Options}`).pipe(
        catchError(() => of(null))
      ),
      branches: this.ApiDataService.GET(`${ApiRoutesConstants.Branch_List_Options}`).pipe(
        catchError(() => of(null))
      ),
      types: this.ApiDataService.GET(`${ApiRoutesConstants.Type_List_Options}/${this.type}`).pipe(
        catchError(() => of(null))
      ),
      telecallers: this.telephony.telecallers().pipe(catchError(() => of([]))),
      workStats: this.ApiDataService.GET(ApiRoutesConstants.LEAD_WORK_STATS).pipe(catchError(() => of(null))),
      reportStats: this.ApiDataService.GET(ApiRoutesConstants.CALL_REPORTS).pipe(catchError(() => of(null))),
    }).subscribe((result: any) => {
      const { statuses, sources, branches, types, telecallers, workStats, reportStats } = result;
      this.sourceOptions = sources?.data?.data ?? [];
      this.typeOptions = types?.data?.data ?? [];
      this.statusOptions = statuses?.data?.data ?? [];

      this.applyStatusOptions(statuses);
      this.applySourceOptions(sources);
      this.applyBranchOptions(branches);
      this.applyTelecallerOptions(telecallers);
      this.applyWorkStats(workStats);
      this.applyReportStats(reportStats);
    });
  }

  private applyStatusOptions(res: any): void {
    const list: any[] = res?.data?.data ?? [];
    this.statusIdByName = new Map(list.filter(s => s?.name).map(s => [s.name, Number(s.id)]));
    const names = list.map(s => s?.name).filter((name: unknown): name is string => !!name);

    if (names.length) {
      this.filters = this.filters.map(f => (f.key === 'status' ? { ...f, options: names } : f));
    }
  }

  private applySourceOptions(res: any): void {
    const list: any[] = res?.data?.data ?? [];
    this.sourceIdByName = new Map(list.filter(s => s?.source_name).map(s => [s.source_name, Number(s.id)]));
    const names = list.map(s => s?.source_name).filter((name: unknown): name is string => !!name);

    if (names.length) {
      this.filters = this.filters.map(f => (f.key === 'source' ? { ...f, options: names } : f));
    }
  }

  private applyBranchOptions(res: any): void {
    const list: any[] = res?.data?.data ?? [];
    this.branchIdByName = new Map(list.filter(b => b?.name).map(b => [b.name, Number(b.id)]));
    const names = list.map(b => b?.name).filter((name: unknown): name is string => !!name);

    if (names.length) {
      this.filters = this.filters.map(f => (f.key === 'branch' ? { ...f, options: names } : f));
    }
  }

  private applyTelecallerOptions(rows: { id: number; name: string }[]): void {
    this.telecallerIdByName = new Map(rows.map(r => [r.name, r.id]));
    const names = rows.map(r => r.name);

    if (names.length) {
      this.filters = this.filters.map(f => (f.key === 'telecaller' ? { ...f, options: names } : f));
    }
  }

  private applyWorkStats(res: any): void {
    const s: LeadWorkStats | undefined = res?.data;
    if (!s) return;
    this.setStat('Total Leads', s.assigned.toLocaleString());
    this.setStat('Follow-ups Today', s.follow_ups_today);
    this.setStat('Overdue', s.follow_ups_overdue);
    this.setStat('Not Contacted', s.never_contacted);
  }

  private applyReportStats(res: any): void {
    const r: CallReportSummary | undefined = res?.data;
    if (r) this.setStat('Conversion Rate', `${r.conversion_rate}%`);
  }

  private buildQueryParams(): string {
    const params = new URLSearchParams();
    // params.set('per_page', '100');

    if (this.searchTerm) params.set('search', this.searchTerm);

    const statusId = this.filterState.status ? this.statusIdByName.get(this.filterState.status) : undefined;
    if (statusId) params.set('status_id', String(statusId));

    const sourceId = this.filterState.source ? this.sourceIdByName.get(this.filterState.source) : undefined;
    if (sourceId) params.set('source_id', String(sourceId));

    this.filterState.branch
      .map(name => this.branchIdByName.get(name))
      .filter((id): id is number => id !== undefined)
      .forEach(id => params.append('organization_id[]', String(id)));

    const telecallerId = this.filterState.telecaller ? this.telecallerIdByName.get(this.filterState.telecaller) : undefined;
    if (telecallerId) params.set('assigned_to', String(telecallerId));

    return params.toString();
  }

  loadLeadData(): void {
    this.reload$.next();
  }

  /** The list, its filtering, sorting and pagination all happen server-side now: the API
   *  already scopes visibility (telecallers get only their assigned leads, branch managers
   *  their branch, admins everything), so only the current page is ever fetched. */
  private fetchLeads() {
    this.isLoading = true;
    this.loading = true;

    const qs = this.buildQueryParams();
    this.ApiDataService.GetAllPages(`${ApiRoutesConstants.LEAD_GET_List}?${qs}`).subscribe({
      next: (leads: any[]) => {
        this.isLoading = false;

        if (!response?.success) {
          this.toast.error(response?.message || 'Failed to load leads. Please try again.');
          return;
        }

        const page = response.data;
        const leads: any[] = page?.data ?? [];

        this.leadsById.clear();
        this.allRows = leads.map((lead: any) => this.mapLeadToRow(lead));
        this.refreshRows();
        this.loading = false;
      },
      error: (err: any) => {
        this.isLoading = false;
        this.loading = false;
        this.toast.error(err.message);
      },
    });
  }

  private mapLeadToRow(lead: any): TableRow {
    this.leadsById.set(lead.id, lead);

    return {
      lead: {
        name: lead.name ?? '',
        subtitle: `LD-${String(lead.id ?? '').padStart(5, '0')}`,
      },
      contact: lead.mobile_no ?? '',
      source: lead.source_name ?? '',
      service_category: lead.service_category_name ?? '',
      service_request: lead.reason ?? '',
      branch: lead.organization_name ?? lead.location ?? '',
      status: lead.status_name || 'Lead',
      created_at: this.formatDate(lead.created_at),
      gender: lead.gender ?? '',
      telecaller: lead.assigned_to_name || 'Unassigned',
      next_follow_up: lead.next_follow_up_at ? this.formatDate(lead.next_follow_up_at) : '-',
      action: 'menu',
      id: lead.id,
    };
  }

  private setStat(label: string, value: string | number): void {
    this.stats = this.stats.map(stat => (stat.label === label ? { ...stat, value } : stat));
  }

  private formatDate(value: unknown): string {
    if (!value) return '';
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);

    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'short' });
    return `${day}-${month}-${date.getFullYear()}`;
  }

  onSearch(term: string) {
    this.searchTerm = term.trim().toLowerCase();
    this.currentPage = 1;
    this.loadLeadData();
  }

  onFilterClick(key: string): void {
    console.debug('Filter opened:', key);
  }

  onFiltersChange(filters: CommonFilterState): void {
    this.filterState = { ...filters, branch: [...filters.branch] };
    this.currentPage = 1;
    this.loadLeadData();
  }

  onExport() {
    // Trigger export as needed.
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
    this.loading = true;
    this.currentPage = event.page;
    this.pageSize = event.pageSize;
    this.refreshRows();
    this.loading = false;
  }

  onSortChange(sort: Sort) {
    this.loading = true;
    this.sortActive = sort.active;
    this.sortDirection = sort.direction || 'asc';
    this.currentPage = 1;
    this.refreshRows();
    this.loading = false;
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

  openFollowUp(row: TableRow): void {
    this.openLeadProfile(row, 'lead');
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
      data: {
        ...data,
        sourceOptions: this.sourceOptions,
        typeOptions: this.typeOptions,
        statusOptions: this.statusOptions,
      },
    });

    dialogRef.afterClosed().subscribe((leadData) => {
      if (!leadData) return;

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
