import { CommonModule } from '@angular/common';
import Swal from 'sweetalert2';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Component, OnInit, inject } from '@angular/core';
import { openAssignCaller } from '../../shared/components/lead-dialogs/assign-caller-dialog';
import { openLeadAudit } from '../../shared/components/lead-dialogs/lead-audit-dialog';
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
import { Subscription, forkJoin, interval, of } from 'rxjs';
import { catchError, debounceTime, filter, finalize } from 'rxjs/operators';
import { ApiDataService } from '../../core/http/api.service';
import { ApiRoutesConstants } from '../../shared/common-services/api-route-constants';
import { ToastService } from '../../shared/common-services/toast.service';
import { TelephonyService } from '../../core/telephony/telephony.service';
import { TelecallerRow } from '../../core/telephony/telephony.models';
import { CrmFlowService, FlowAppointment, FlowLead } from '../../shared/common-services/crm-flow.service';
import { LeadProfileDialog, LeadProfileDialogResult } from '../../shared/components/lead-profile-dialog/lead-profile-dialog';
import { AuthService } from '../../core/auth/auth.service';
import { CanActionDirective } from '../../shared/directives/can-action.directive';
import { COMBO_OFFERS, TREATMENTS } from '../../shared/data/treatment-catalog';
import { AutoModuleTabs } from '../../shared/components/module-tabs/auto-module-tabs';
import { BranchContextService } from '../../shared/common-services/branch-context.service';
import { environment } from '../../../environments/environment';
import { toLeadAttribution } from '../../shared/common-services/meta-integration.service';

/** While the WebSocket is down, the list re-reads this often so new Meta leads and call locks still show. */
const FALLBACK_REFRESH_MS = 20_000;

@Component({
  selector: 'app-lead-management',
  standalone: true,
  imports: [AutoModuleTabs, CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard, CanActionDirective],
  templateUrl: './lead-management.html',
  styleUrl: './lead-management.scss',
})
export class LeadManagement implements OnInit {
  private readonly branchOptions = inject(BranchOptionsService);
  private readonly branchContext = inject(BranchContextService);

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

    // Live: a new Meta / website lead, a call started or ended on a lead (it greys out for everyone else), an
    // assignment - re-read the page on screen, quietly. Without the socket, a slow poll does the same.
    this.telephony.leadChanged$.pipe(debounceTime(400), takeUntilDestroyed()).subscribe(() => this.loadLeadData(true));
    interval(FALLBACK_REFRESH_MS)
      .pipe(filter(() => !this.telephony.socketLive() && document.visibilityState === 'visible' && !this.loading), takeUntilDestroyed())
      .subscribe(() => this.loadLeadData(true));
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
    }).subscribe((result: any) => {
      const { statuses, sources, branches, types, telecallers } = result;
      this.sourceOptions = sources?.data?.data ?? [];
      this.typeOptions = types?.data?.data ?? [];
      this.statusOptions = statuses?.data?.data ?? [];

      this.applyStatusOptions(statuses);
      this.applySourceOptions(sources);
      this.applyBranchOptions(branches);
      this.applyTelecallerOptions(telecallers);
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

  /** Filter / dialog offer display names; a name maps back to its branch / franchise with branchOptions.byName(). */
  private applyBranchOptions(list: BranchOption[]): void {
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

  /** Stat cards come with the lead list itself (GET customer-leads -> summary): no separate stats / report calls. */
  private applySummary(s: any): void {
    if (!s) return;
    this.setStat('Total Leads', Number(s.assigned ?? 0).toLocaleString());
    this.setStat('Follow-ups Today', s.follow_ups_today ?? 0);
    this.setStat('Overdue', s.follow_ups_overdue ?? 0);
    this.setStat('Not Contacted', s.never_contacted ?? 0);
    this.setStat('Conversion Rate', `${s.conversion_rate ?? 0}%`);
  }

  private buildQueryParams(): string {
    const params = new URLSearchParams();
    // params.set('per_page', '100');

    if (this.searchTerm) params.set('search', this.searchTerm);

    // const statusId = this.filterState.status ? this.statusIdByName.get(this.filterState.status) : undefined;
    // if (statusId) params.set('status_id', String(statusId));

    const sourceId = this.filterState.source ? this.sourceIdByName.get(this.filterState.source) : undefined;
    if (sourceId) params.set('source_id', String(sourceId));

    // branch_id[] = keys ("branch:9" / "franchise:7"): an id alone is ambiguous.
    this.filterState.branch
      .map(name => this.branchOptions.byName(name)?.key)
      .filter((key): key is string => !!key)
      .forEach(key => params.append('branch_id[]', key));

    const telecallerId = this.filterState.telecaller ? this.telecallerIdByName.get(this.filterState.telecaller) : undefined;
    if (telecallerId) params.set('assigned_to', String(telecallerId));

    if (this.filterState.dateFrom) params.set('date_from', this.filterState.dateFrom);
    if (this.filterState.dateTo) params.set('date_to', this.filterState.dateTo);

    return params.toString();
  }

  /** Fetches only the page on screen - search, filters, sort and paging all run in the API.
   *  (Downloading every lead and paging in the browser took one request per 15 leads.) */
  /** `quiet` (live refresh): keeps the rows on screen instead of showing the loader. */
  loadLeadData(quiet = false): void {
    this.isLoading = !quiet;
    this.loading = !quiet;

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
        this.applySummary(res?.summary);

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
      branch: lead.branch_name ?? lead.location ?? '',
      status: lead.status_name || 'Lead',
      // A telecaller checks each lead assigned to them (the API only returns theirs) before following it up.
      editDeleteOnly: String(lead.status_name ?? '').trim().toLowerCase() === 'invalid' ? 1 : 0,
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
      assignedToId: lead.assigned_to ?? 0,
      branchKey: lead.branch_type && lead.branch_id ? `${lead.branch_type}:${lead.branch_id}` : '',
      // Someone else is on a call with this lead (or writing its outcome): greyed out, nobody else may act on it.
      ...this.lockFor(lead),
    };
  }

  private lockFor(lead: any): Record<string, string | number> {
    const lock = lead.on_call;
    if (!lock || lock.user_id === this.auth.currentUser()?.id) return {};
    const who = lock.name || 'Another telecaller';
    return {
      locked: 1,
      lockedBy: who,
      lockedLabel: lock.status === 'wrap_up' ? `${who} is saving the call outcome` : `${who} is on a call with this lead`,
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
    assign: 'assign-lead-caller',
    audit: 'view-lead-audit',
    validate: 'validate-lead',
    edit: 'edit-lead',
    followUp: 'lead-follow-up',
    profile: 'lead-follow-up',
    sendToBranch: 'send-lead-to-branch',
    delete: 'delete-lead',
    bulkActions: 'bulk-assign-leads',
  };

  /** Row buttons on this page: outgoing call, edit, assign caller, audit log, delete. */
  readonly leadActions = ['call', 'edit', 'assign', 'audit', 'delete'];

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

  /** Assign / reassign the telecaller who follows this lead up (it then moves to their Follow-ups). */
  onAssignCaller(row: TableRow): void {
    if (row['locked']) return;
    const lead = row['lead'] as LeadCell;
    openAssignCaller(this.dialog, {
      leadIds: [Number(row['id'])],
      subject: `${lead?.name ?? 'Lead'} · ${lead?.subtitle ?? ''}`,
      currentId: Number(row['assignedToId']) || null,
      currentName: row['telecaller'] && row['telecaller'] !== 'Unassigned' ? String(row['telecaller']) : null,
      branchKey: String(row['branchKey'] ?? '') || null,
    }).afterClosed().subscribe(saved => {
      if (!saved) return;
      this.loadLeadData();
      this.loadFilterList();
    });
  }

  onAuditLead(row: TableRow): void {
    const lead = row['lead'] as LeadCell;
    openLeadAudit(this.dialog, { id: Number(row['id']), name: lead?.name ?? 'Lead' });
  }

  onCallLead(row: TableRow): void {
    if (row['locked']) {
      this.toast.warning(String(row['lockedLabel'] ?? 'Another telecaller is on this lead.'));
      return;
    }
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
  /** Leads whose verdict is being saved: a second click cannot send it twice. */
  private readonly validatingLeads = new Set<unknown>();

  async onValidateLead(row: TableRow, valid: boolean): Promise<void> {
    const leadId = row['id'];
    if (this.validatingLeads.has(leadId)) return;
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

    this.validatingLeads.add(leadId);
    this.ApiDataService.POST(`${ApiRoutesConstants.LEAD_VALIDATE}/${leadId}/validate`, { valid, reason }).pipe(finalize(() => this.validatingLeads.delete(leadId))).subscribe({
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
        branches: this.branchOptions.names(),
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
      const unit = this.branchOptions.byName(result.lead.branch);

      if (!telecallerId) {
        this.toast.error('Select a valid telecaller.');
        return;
      }

      this.telephony.assignLeads([Number(row['id'])], telecallerId, unit ? { type: unit.type, id: unit.id } : null).subscribe({
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
      email: this.leadsById.get(Number(row['id']))?.email ?? undefined,
      attribution: toLeadAttribution(this.leadsById.get(Number(row['id']))),
    };
  }

  openFollowUp(row: TableRow): void {
    this.openLeadProfile(row, 'lead');
  }

  /**
   * Public enquiry form link (served by the API host, /enquiry?src=whatsapp). A customer who fills it becomes a
   * "New Lead" here with source WhatsApp; send it from WhatsApp Business as a greeting / quick reply.
   */
  get enquiryLink(): string {
    return environment.apiBaseUrl.replace(/\/api\/?$/, '') + '/enquiry?src=whatsapp';
  }

  shareEnquiryLink(): void {
    const link = this.enquiryLink;
    const message = `Thank you for contacting Renew+ Hair and Skin Care! Please share a few details here and our team will call you to book your consultation:\n${link}`;
    Swal.fire({
      title: 'Enquiry form link',
      html: `<p style="margin:0 0 8px;font-size:13px;color:#667085">Customers who fill this form appear here as <b>New Lead</b> (source WhatsApp).
               Save it as a WhatsApp Business quick reply or greeting message.</p>
             <input class="swal2-input" style="width:100%;margin:0;font-size:13px" readonly value="${link}">`,
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: '<i class="bi bi-clipboard"></i> Copy link',
      denyButtonText: '<i class="bi bi-whatsapp"></i> Share on WhatsApp',
      cancelButtonText: 'Close',
      confirmButtonColor: '#0f5245',
      denyButtonColor: '#25d366',
    }).then(result => {
      if (result.isConfirmed) {
        navigator.clipboard?.writeText(link)
          .then(() => this.toast.success('Enquiry link copied.'))
          .catch(() => this.toast.warning('Copy the link from the box.'));
      } else if (result.isDenied) {
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
      }
    });
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

  /**
   * Where "Send to branch" goes, by the top-bar filter: a specific branch / franchise sends straight to it (after a
   * confirm); "All" asks Branch or Franchise first and lists all of that type; "All branches" / "All franchises"
   * lists just that type. Resolves null when cancelled.
   */
  private async pickTargetUnit(row: TableRow): Promise<BranchOption | null> {
    await new Promise<void>(resolve => this.branchOptions.load().subscribe(() => resolve()));
    const scope = this.branchContext.selection();

    if (scope.id !== null) {
      const unit = this.branchOptions.byRef(scope.type, scope.id);
      if (!unit) return null;
      const confirmed = await this.toast.confirm(
        `Send this lead to ${unit.name}?`,
        'It is assigned automatically to one of its telecallers; each telecaller gets leads in batches of 10.',
        'Yes, send',
      );
      return confirmed ? unit : null;
    }

    const own = this.branchOptions.byName(String(row['branch'] ?? ''));
    const fixedType = scope.type === 'all' ? null : scope.type;
    const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const optionsFor = (type: string) =>
      '<option value="">Select ' + type + '</option>' +
      this.branchOptions.options().filter(o => o.type === type)
        .map(o => `<option value="${o.key}"${o.key === own?.key ? ' selected' : ''}>${esc(o.name)}</option>`).join('');
    const startType = fixedType ?? own?.type ?? 'branch';

    const result = await Swal.fire({
      title: 'Send lead to branch / franchise',
      html:
        '<div style="text-align:left;display:grid;gap:8px">' +
        (fixedType ? '' :
          '<label style="font-size:13px;font-weight:600">Type</label>' +
          `<select id="send-unit-type" class="swal2-select" style="margin:0;width:100%"><option value="branch"${startType === 'branch' ? ' selected' : ''}>Branch</option><option value="franchise"${startType === 'franchise' ? ' selected' : ''}>Franchise</option></select>`) +
        `<label style="font-size:13px;font-weight:600">${fixedType === 'franchise' ? 'Franchise' : fixedType === 'branch' ? 'Branch' : 'Branch / Franchise'}</label>` +
        `<select id="send-unit" class="swal2-select" style="margin:0;width:100%">${optionsFor(startType)}</select>` +
        '</div>',
      showCancelButton: true,
      confirmButtonText: 'Send',
      confirmButtonColor: '#dc4c4c',
      didOpen: () => {
        const typeEl = document.getElementById('send-unit-type') as HTMLSelectElement | null;
        const unitEl = document.getElementById('send-unit') as HTMLSelectElement;
        typeEl?.addEventListener('change', () => (unitEl.innerHTML = optionsFor(typeEl.value)));
      },
      preConfirm: () => {
        const key = (document.getElementById('send-unit') as HTMLSelectElement).value;
        if (!key) Swal.showValidationMessage('Choose a branch or franchise.');
        return key;
      },
    });
    return result.isConfirmed ? this.branchOptions.byKey(result.value) ?? null : null;
  }

  /** Hands the lead to one of the branch's telecallers (batches of 10 per telecaller - see the API). */
  async sendToBranch(row: TableRow): Promise<void> {
    const unit = await this.pickTargetUnit(row);
    if (!unit) return;

    this.ApiDataService.POST(ApiRoutesConstants.LEAD_AUTO_ASSIGN, {
      lead_ids: [Number(row['id'])],
      branch_type: unit.type,
      branch_id: unit.id,
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
