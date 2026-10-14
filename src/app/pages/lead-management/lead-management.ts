import { CommonModule } from '@angular/common';
import Swal from 'sweetalert2';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Component, OnInit, inject } from '@angular/core';
import { BranchOption, BranchOptionsService } from '../../shared/common-services/branch-options.service';
import { Sort, SortDirection } from '@angular/material/sort';
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
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiDataService } from '../../core/http/api.service';
import { ApiRoutesConstants } from '../../shared/common-services/api-route-constants';
import { ToastService } from '../../shared/common-services/toast.service';
import { TelephonyService } from '../../core/telephony/telephony.service';
import { CallReportSummary, LeadWorkStats, TelecallerRow } from '../../core/telephony/telephony.models';
import { CrmFlowService, FlowAppointment, FlowLead } from '../../shared/common-services/crm-flow.service';
import { LeadProfileDialog, LeadProfileDialogResult } from '../../shared/components/lead-profile-dialog/lead-profile-dialog';
import { AuthService } from '../../core/auth/auth.service';
import { CanActionDirective } from '../../shared/directives/can-action.directive';
import { COMBO_OFFERS, TREATMENTS } from '../../shared/data/treatment-catalog';

@Component({
  selector: 'app-lead-management',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard, CanActionDirective],
  templateUrl: './lead-management.html',
  styleUrl: './lead-management.scss',
})
export class LeadManagement implements OnInit {
  private readonly branchOptions = inject(BranchOptionsService);

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
  }


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
    { key: 'lead', header: 'Name', type: 'lead', width: '14%' },
    { key: 'contact', header: 'Contact', type: 'text', width: '9%' },
    { key: 'gender', header: 'Gender', type: 'text', width: '5%' },
    { key: 'source', header: 'Source', type: 'text', width: '7%' },
    { key: 'service_category', header: 'Service Category', type: 'text', width: '9%' },
    { key: 'service_request', header: 'Service Request', type: 'text', width: '9%' },
    { key: 'branch', header: 'Branch', type: 'branch', width: '9%' },
    { key: 'telecaller_avatar', header: 'Telecaller', type: 'avatarGroup', width: '8%', sortable: false },
    { key: 'status', header: 'Status', type: 'badge', width: '8%' },
    // { key: 'next_follow_up', header: 'Next Follow-up', type: 'text', width: '8%' },
    { key: 'action', header: 'Action', type: 'action', width: '15%', sortable: false },
  ];

  readonly pageSizeOptions = [10, 30, 50, 100];
  isLoading = false;
  private leadsById = new Map<number, any>();
  private leadSub?: Subscription;
  readonly type: number = 1;

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
  private telecallerBranchByName: Record<string, string> = {};

  ngOnInit(): void {
    // Table first: the API serves requests one after another, so the list shouldn't queue
    // behind the seven filter-option / stat-card calls.
    this.loadLeadData();
    this.loadFilterList();
  }

  private loadFilterList(): void {
    forkJoin({
      statuses: this.ApiDataService.GET(`${ApiRoutesConstants.Status_List_Options}`).pipe(
        catchError(() => of(null))
      ),
      sources: this.ApiDataService.GET(`${ApiRoutesConstants.Source_List_Options}`).pipe(
        catchError(() => of(null))
      ),
      branches: this.branchOptions.load(),
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

  private applyBranchOptions(list: BranchOption[]): void {
    this.branchIdByName = new Map(list.map(b => [b.name, b.id]));
    const names = list.map(b => b.name);

    if (names.length) {
      this.filters = this.filters.map(f => (f.key === 'branch' ? { ...f, options: names } : f));
    }
  }

  private applyTelecallerOptions(rows: TelecallerRow[]): void {
    this.telecallerIdByName = new Map(rows.map(r => [r.name, r.id]));
    this.telecallerBranchByName = Object.fromEntries(rows.filter(r => r.branch?.name).map(r => [r.name, r.branch!.name]));
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

    // const statusId = this.filterState.status ? this.statusIdByName.get(this.filterState.status) : undefined;
    // if (statusId) params.set('status_id', String(statusId));

    const sourceId = this.filterState.source ? this.sourceIdByName.get(this.filterState.source) : undefined;
    if (sourceId) params.set('source_id', String(sourceId));

    this.filterState.branch
      .map(name => this.branchIdByName.get(name))
      .filter((id): id is number => id !== undefined)
      .forEach(id => params.append('organization_id[]', String(id)));

    const telecallerId = this.filterState.telecaller ? this.telecallerIdByName.get(this.filterState.telecaller) : undefined;
    if (telecallerId) params.set('assigned_to', String(telecallerId));

    if (this.filterState.dateFrom) params.set('date_from', this.filterState.dateFrom);
    if (this.filterState.dateTo) params.set('date_to', this.filterState.dateTo);

    return params.toString();
  }

  /** Fetches only the page on screen - search, filters, sort and paging all run in the API.
   *  (Downloading every lead and paging in the browser took one request per 15 leads.) */
  loadLeadData(): void {
    this.isLoading = true;
    this.loading = true;

    const params = new URLSearchParams(this.buildQueryParams());
    params.set('page', String(this.currentPage));
    params.set('per_page', String(this.pageSize));
    if (this.sortActive && this.sortDirection) {
      params.set('sort_by', this.sortActive);
      params.set('sort_dir', this.sortDirection);
    }

    // A newer search / filter / page request supersedes one still in flight.
    this.leadSub?.unsubscribe();
    this.leadSub = this.ApiDataService.GET(`${ApiRoutesConstants.LEAD_GET_List}?${params}`).subscribe({
      next: (res: any) => {
        const page = res?.data;
        this.isLoading = false;
        this.leadsById.clear();
        this.rows = (page?.data ?? []).map((lead: any) => this.mapLeadToRow(lead));
        this.totalRecords = Number(page?.total ?? this.rows.length);
        this.loading = false;

        // The page asked for no longer exists (e.g. last row of the last page was removed).
        const lastPage = Number(page?.last_page ?? 1);
        if (this.currentPage > lastPage && lastPage >= 1 && this.totalRecords > 0) {
          this.currentPage = lastPage;
          this.loadLeadData();
        }
      },
      error: (err: any) => {
        this.isLoading = false;
        this.loading = false;
        this.toast.error(err?.error?.message || err.message);
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
      service_request: lead.service_request_name ?? '',
      branch: lead.organization_name ?? lead.location ?? '',
      status: lead.status_name || 'Lead',
      // A telecaller checks each lead assigned to them (the API only returns theirs) before following it up.
      canValidate: this.telephony.isTelecaller() && ['New Lead', 'Lead'].includes(lead.status_name || 'Lead') && !!lead.assigned_to ? 1 : 0,
      created_at: this.formatDate(lead.created_at),
      gender: lead.gender ?? '',
      telecaller: lead.assigned_to_name || 'Unassigned',
      telecaller_avatar: lead.assigned_to_name
        ? [{ name: lead.assigned_to_name, empNo: lead.assigned_to_emp_code ?? '', image: lead.assigned_to_photo ?? undefined }]
        : [],
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

  onExport(format: ExportFormat): void {
    const qs = this.buildQueryParams();
    this.ApiDataService.GET_BLOB(`${ApiRoutesConstants.LEAD_EXPORT}?${qs}&format=${format}`).subscribe({
      next: (blob: Blob) => this.downloadBlob(blob, `leads-${this.timestampForFilename()}.${format}`),
      error: (err: any) => {
        this.toast.error('Failed to export leads. Please try again.');
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
    this.loadLeadData();
  }

  onSortChange(sort: Sort) {
    this.sortActive = sort.active;
    this.sortDirection = sort.direction || 'asc';
    this.currentPage = 1;
    this.loadLeadData();
  }

  /** Row buttons in the leads table, each tied to its Roles & Permissions action slug. */
  readonly leadActionPermissions: Record<string, string> = {
    call: 'call-lead',
    validate: 'validate-lead',
    edit: 'edit-lead',
    followUp: 'lead-follow-up',
    profile: 'lead-follow-up',
    sendToBranch: 'send-lead-to-branch',
    delete: 'delete-lead',
    bulkActions: 'bulk-assign-leads',
  };

  /** Whether the signed-in role is ticked on this action slug. */
  can(slug: string): boolean {
    return this.auth.hasActionAccess(slug);
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

  /** Telecaller verdict on an assigned lead. Invalid leads go back to Lead Management (unassigned) for the branch manager. */
  async onValidateLead(row: TableRow, valid: boolean): Promise<void> {
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

    this.ApiDataService.POST(`${ApiRoutesConstants.LEAD_VALIDATE}/${row['id']}/validate`, { valid, reason }).subscribe({
      next: (res: any) => {
        this.toast.success(res?.message || (valid ? 'Lead marked valid.' : 'Lead marked invalid.'));
        this.loadLeadData();
      },
      error: (err: any) => this.toast.error(err?.error?.message || 'Unable to update the lead. Please try again.'),
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
        telecallers: [...this.telecallerIdByName.keys()],
        branches: [...this.branchIdByName.keys()],
        telecallerBranches: this.telecallerBranchByName,
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
      const telecallerId = this.telecallerIdByName.get(result.lead.telecaller);
      const branchId = this.branchIdByName.get(result.lead.branch);

      if (!telecallerId) {
        this.toast.error('Select a valid telecaller.');
        return;
      }

      this.telephony.assignLeads([Number(row['id'])], telecallerId, branchId ?? null).subscribe({
        next: () => {
          this.crmFlow.addFollowUp(result.lead);
          this.removeLeadRow(row);
          this.toast.success('Follow-up logged', `${result.lead.name} assigned to ${result.lead.telecaller} and moved to Follow-Ups.`);
          this.loadFilterList();
          this.router.navigate(['/app/follow-ups']);
        },
        error: (err: any) => this.toast.error(err?.error?.message || 'Unable to assign the lead. Please try again.'),
      });
      return;
    }

    if (result.action === 'appointment' || result.action === 'book-appointment') {
      const appointment: FlowAppointment = result.appointment ?? {
        ...result.lead,
        service: '', date: result.scheduledDate ?? '', startTime: result.scheduledTime ?? '',
        staff: result.lead.telecaller, total: 0, paymentMethod: '', paymentStatus: 'Pending', status: 'Appointment',
      };

      this.crmFlow.addAppointment(appointment);
      this.removeLeadRow(row);
      this.toast.success('Appointment booked', `${appointment.name} moved to Appointments.`);
      this.router.navigate(['/app/appointments']);
    }
  }

  private removeLeadRow(row: TableRow): void {
    this.rows = this.rows.filter(item => item !== row);
    this.totalRecords = Math.max(0, this.totalRecords - 1);
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
      telecaller: row['telecaller'] && row['telecaller'] !== 'Unassigned' ? String(row['telecaller']) : '',
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

  /** Hands the lead to one of the branch's telecallers (batches of 10 per telecaller - see the API). */
  async sendToBranch(row: TableRow): Promise<void> {
    const confirmed = await this.toast.confirm(
      'Send this lead to the branch telecallers?',
      'It is assigned automatically; each telecaller gets leads in batches of 10.',
      'Yes, send',
    );
    if (!confirmed) return;

    const branchId = this.branchIdByName.get(String(row['branch'] ?? ''));
    this.ApiDataService.POST(ApiRoutesConstants.LEAD_AUTO_ASSIGN, {
      lead_ids: [Number(row['id'])],
      ...(branchId ? { organization_id: branchId } : {}),
    }).subscribe({
      next: (res: any) => {
        this.toast.success(res?.message || 'Lead sent to the branch.');
        this.loadLeadData();
        this.loadFilterList();
      },
      error: (err: any) => this.toast.error(err?.error?.message || 'Unable to send the lead. Please try again.'),
    });
  }
}
