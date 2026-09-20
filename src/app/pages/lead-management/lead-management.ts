import { CommonModule } from '@angular/common';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Component, OnInit } from '@angular/core';
import { Sort, SortDirection } from '@angular/material/sort';
import { CommonDetailCard } from '../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../shared/components/common-table-card/common-table-card';
import {
  CommonFilterState,
  DetailCardData,
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
import { FOLLOW_UP_SEEDS } from '../followups/followups';
import { ApiDataService } from '../../shared/common-services/api-data.service';
import { ApiRoutesConstants } from '../../shared/common-services/api-route-constants';
import { ToastService } from '../../shared/common-services/toast.service';
import { CrmFlowService, FlowAppointment, FlowLead } from '../../shared/common-services/crm-flow.service';
import { LeadProfileDialog, LeadProfileDialogResult } from '../../shared/components/lead-profile-dialog/lead-profile-dialog';
import { COMBO_OFFERS, TREATMENTS } from '../../shared/data/treatment-catalog';

@Component({
  selector: 'app-lead-management',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard],
  templateUrl: './lead-management.html',
  styleUrl: './lead-management.scss',
})
export class LeadManagement implements OnInit {

  constructor(private dialog: MatDialog, private router: Router, private ApiDataService: ApiDataService, private toast: ToastService, private crmFlow: CrmFlowService) { }

  stats: DetailCardData[] = [
    { label: 'Total Leads', value: '1,284', trendText: '8.4% this month', trendDirection: 'up', icon: 'bi-person-lines-fill', iconVariant: 'primary' },
    { label: 'Total Follow-Ups', value: FOLLOW_UP_SEEDS.length, trendText: 'Across all telecallers', trendDirection: 'neutral', icon: 'bi-arrow-repeat', iconVariant: 'blue' },
    // { label: 'Due Today', value: 2, trendText: 'Needs attention', trendDirection: 'up' },
    { label: 'Completed', value: 3, trendText: 'Follow-up closed', trendDirection: 'up', icon: 'bi-check-circle', iconVariant: 'green' },
    { label: 'Appointment', value: 12, trendText: 'Confirmed appointments', trendDirection: 'up', icon: 'bi-calendar-check', iconVariant: 'orange' },
    { label: 'Conversion Rate', value: '30.2%', trendText: '3.1% vs last month', trendDirection: 'up', icon: 'bi-graph-up-arrow', iconVariant: 'purple' },
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
    { key: 'lead', header: 'Name', type: 'lead' },
    { key: 'contact', header: 'Contact', type: 'text' },
    { key: 'gender', header: 'Gender', type: 'text' },
    { key: 'source', header: 'Source', type: 'text' },
    { key: 'service_category', header: 'Service Category', type: 'text' },
    { key: 'service_request', header: 'Service Request', type: 'text'},
    { key: 'branch', header: 'Branch', type: 'branch' },
    { key: 'status', header: 'Status', type: 'badge' },
    { key: 'created_at', header: 'Lead Date', type: 'text' },
    { key: 'action', header: 'Action', type: 'action', width: '110px', sortable: false },
  ];

  readonly pageSizeOptions = [10, 30, 50, 100];
  isLoading = false;
  allRows: TableRow[] = [
  { name: 'Ananya Sharma', mobile_no: '+91 98765 43210', gender: 'F', source: 'Website', service_category: 'Hair', service_request: 'Hair Loss', branch: 'Anna Nagar', status: 'New', created_at: '09-Sep-2026' },
  { name: 'Rahul Kumar', mobile_no: '+91 91234 56780', gender: 'M', source: 'Instagram', service_category: 'Skin', service_request: 'Acne Care', branch: 'Velachery', status: 'New', created_at: '08-Apr-2026' },
  { name: 'Sneha Menon', mobile_no: '+91 98867 66554', gender: 'F', source: 'Referral', service_category: 'Hair', service_request: 'PRP Therapy', branch: 'Indiranagar', status: 'New', created_at: '15-Apr-2026' },
  { name: 'Vikram Patel', mobile_no: '+91 90123 45678', gender: 'M', source: 'Google Ads', service_category: 'Hair', service_request: 'Hair Transplant', branch: 'Coimbatore', status: 'New', created_at: '22-Apr-2026' },
  { name: 'Neha Prasad', mobile_no: '+91 93450 78920', gender: 'F', source: 'Walk-in', service_category: 'Skin', service_request: 'Skin Rejuvenation', branch: 'Anna Nagar', status: 'New', created_at: '29-Apr-2026' },
  { name: 'Kavin Raj', mobile_no: '+91 99520 13840', gender: 'M', source: 'Meta Campaign', service_category: 'Skin', service_request: 'Laser Toning', branch: 'T Nagar', status: 'New', created_at: '03-May-2026' },
  { name: 'Aarthi Nair', mobile_no: '+91 98401 55082', gender: 'F', source: 'Website', service_category: 'Skin', service_request: 'Botox', branch: 'Velachery', status: 'New', created_at: '10-May-2026' },
  { name: 'Siddharth Rao', mobile_no: '+91 95009 44671', gender: 'M', source: 'Call Center', service_category: 'Hair', service_request: 'GFC Treatment', branch: 'Bengaluru', status: 'New', created_at: '17-May-2026' },
  { name: 'Divya Iyer', mobile_no: '+91 97890 24231', gender: 'F', source: 'Referral', service_category: 'Hair', service_request: 'Dandruff Care', branch: 'Anna Nagar', status: 'New', created_at: '24-May-2026' },
  { name: 'Mohit Saini', mobile_no: '+91 90947 11136', gender: 'M', source: 'Google Ads', service_category: 'Hair', service_request: 'Beard Transplant', branch: 'Coimbatore', status: 'New', created_at: '31-May-2026' },
  { name: 'Nikita Shah', mobile_no: '+91 96001 67002', gender: 'F', source: 'Website', service_category: 'Skin', service_request: 'Hydra Facial', branch: 'Indiranagar', status: 'New', created_at: '04-Jun-2026' },
  { name: 'Gokul Balan', mobile_no: '+91 94447 80602', gender: 'M', source: 'Walk-in', service_category: 'Skin', service_request: 'Pigmentation', branch: 'T Nagar', status: 'New', created_at: '11-Jun-2026' },
  { name: 'Farah Ali', mobile_no: '+91 98411 22390', gender: 'F', source: 'Instagram', service_category: 'Skin', service_request: 'Scar Reduction', branch: 'Anna Nagar', status: 'New', created_at: '18-Jun-2026' },
  { name: 'Ritesh Verma', mobile_no: '+91 99628 73201', gender: 'M', source: 'Campaign', service_category: 'Hair', service_request: 'Hair Fall Control', branch: 'Velachery', status: 'New', created_at: '25-Jun-2026' },
  { name: 'Pooja Bhat', mobile_no: '+91 87544 61902', gender: 'F', source: 'Referral', service_category: 'Skin', service_request: 'Anti Ageing', branch: 'Bengaluru', status: 'New', created_at: '02-Jul-2026' },
  { name: 'Kishore Das', mobile_no: '+91 93812 55870', gender: 'M', source: 'Website', service_category: 'Hair', service_request: 'MNRF', branch: 'Coimbatore', status: 'New', created_at: '09-Jul-2026' },
  { name: 'Harsha V.', mobile_no: '+91 97908 80944', gender: 'M', source: 'Meta Campaign', service_category: 'Hair', service_request: 'Hair Regrowth', branch: 'Anna Nagar', status: 'New', created_at: '16-Jul-2026' },
  { name: 'Lavanya S.', mobile_no: '+91 90430 12788', gender: 'F', source: 'Walk-in', service_category: 'Hair', service_request: 'Medi Facial', branch: 'Velachery', status: 'New', created_at: '23-Jul-2026' },
  { name: 'Ashwin George', mobile_no: '+91 88921 41770', gender: 'M', source: 'Call Center', service_category: 'Skin', service_request: 'Tattoo Removal', branch: 'Indiranagar', status: 'New', created_at: '30-Jul-2026' },
  { name: 'Madhumitha R.', mobile_no: '+91 89397 62014', gender: 'F', source: 'Google Ads', service_category: 'Hair', service_request: 'Skin Brightening', branch: 'T Nagar', status: 'New', created_at: '04-Aug-2026' },
  { name: 'Pranav Joshi', mobile_no: '+91 93428 11590', gender: 'M', source: 'Website', service_category: 'Hair', service_request: 'Hair PRP', branch: 'Bengaluru', status: 'New', created_at: '11-Aug-2026' },
  { name: 'Heena Kapoor', mobile_no: '+91 98845 75060', gender: 'F', source: 'Instagram', service_category: 'Skin', service_request: 'Chemical Peel', branch: 'Anna Nagar', status: 'New', created_at: '18-Aug-2026' },
  { name: 'Rohit Narang', mobile_no: '+91 97910 33044', gender: 'M', source: 'Referral', service_category: 'Hair', service_request: 'FUE Consultation', branch: 'Coimbatore', status: 'New', created_at: '25-Aug-2026' },
  { name: 'Megha Sen', mobile_no: '+91 91503 22018', gender: 'F', source: 'Campaign', service_category: 'Hair', service_request: 'Bridal Skin Plan', branch: 'Velachery', status: 'New', created_at: '02-Sep-2026' },
];

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
    // this.refreshRows();
    // this.loadLeadData();
     this.allRows = this.allRows.map((lead: any) => this.mapLeadToRow(lead));
     this.currentPage = 1;
     this.refreshRows();
  }

  loadLeadData(): void {
    const path = ApiRoutesConstants.LEAD_GET_List;
    this.isLoading = true;

    this.ApiDataService.GET(path).subscribe({
      next: (response: any) => {
        this.isLoading = false;

        // API shape: { success, data: { data: [...leads], current_page, total, per_page, ... } }
        const leads = response?.data?.data ?? [];

        if (response?.success && Array.isArray(leads)) {
          this.allRows = leads.map((lead: any) => this.mapLeadToRow(lead));
          this.currentPage = 1;
          this.refreshRows();
        }
      },
      error: (err: any) => {
        this.isLoading = false;
        this.toast.error('Failed to load leads. Please try again.');
        console.error('Failed to load leads:', err);
      },
    });
  }

  /** Maps one lead record from the API's paginated payload into the row shape the table expects. */
  private mapLeadToRow(lead: any): TableRow {
    return {
      lead: {
        name: lead.name ?? '',
        subtitle: `LD-${String(lead.id ?? '').padStart(5, '0')}`,
      },
      contact: lead.mobile_no ?? '',
      source: this.formatSource(lead.source),
      service_category: lead.service_category ?? '',
      service_request: lead.service_request ?? '',
      branch: lead.branch ?? '',
      status: this.formatStatus(lead.status),
      created_at: this.formatDate(lead.created_at),
      gender: lead.gender ?? '',
      telecaller: lead.creator ?? '',
      action: 'menu',
      id: lead.id,
    };
  }

  /** The API returns `source` as a numeric code. Adjust this map to match your backend's
   *  actual source enum once confirmed. */
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

  /** "active" -> "Active" so it matches the badge styling used for status text. */
  private formatStatus(status: unknown): string {
    const value = String(status ?? '').trim();
    if (!value) return 'New';
    return value.charAt(0).toUpperCase() + value.slice(1);
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
    this.searchTerm = term.trim().toLowerCase();
    this.currentPage = 1;
    this.refreshRows();
  }

  onFilterClick(key: string): void {
    // The common filter card owns the dropdown UI. Keep this hook for future analytics.
    console.debug('Filter opened:', key);
  }

  onFiltersChange(filters: CommonFilterState): void {
    this.filterState = { ...filters, branch: [...filters.branch] };
    this.currentPage = 1;
    this.refreshRows();
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
    this.currentPage = event.page;
    this.pageSize = event.pageSize;
    this.refreshRows();
  }

  onSortChange(sort: Sort) {
    this.sortActive = sort.active;
    this.sortDirection = sort.direction || 'asc';
    this.currentPage = 1;
    this.refreshRows();
  }

  onRowAction(row: TableRow) {
    // Open a row action menu as needed.
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
    this.openLeadProfile(row);
  }

  openLeadProfile(row: TableRow): void {
    const dialogRef = this.dialog.open(LeadProfileDialog, {
      width: '600px', maxWidth: 'calc(100vw - 24px)', maxHeight: '92vh', autoFocus: false,
      panelClass: 'lead-profile-dialog',
      data: { lead: this.toFlowLead(row), stage: 'lead', telecallers: ['Priya Sharma', 'Arun Kumar', 'Divya Raj', 'Karthik S', 'Meera Nair'] },
    });
    dialogRef.afterClosed().subscribe((result: LeadProfileDialogResult | undefined) => {
      if (!result || result.action !== 'followup') return;

      this.crmFlow.addFollowUp(result.lead);
      this.allRows = this.allRows.filter(item => item !== row);
      this.toast.success('Lead moved to Follow-Ups', `${result.lead.name} is assigned to ${result.lead.telecaller}.`);
      this.refreshRows();
    });
  }

  private toFlowLead(row: TableRow): FlowLead {
    const lead = row['lead'] as LeadCell;
    return { id: String(row['id'] ?? lead.subtitle ?? lead.name), name: lead.name, phone: String(row['contact'] ?? ''), gender: String(row['gender'] ?? ''), source: String(row['source'] ?? ''), category: String(row['service_category'] ?? ''), request: String(row['service_request'] ?? ''), branch: String(row['branch'] ?? ''), telecaller: String(row['telecaller'] ?? ''), notes: String(row['notes'] ?? ''), followUpDate: '', status: 'Valid' };
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

      // The dialog already saved the lead via its own POST call - add it straight into the
      // table instead of refetching, since `allRows` is seeded locally rather than from the API.
      this.allRows = [this.mapNewLeadToRow(leadData), ...this.allRows];
      this.currentPage = 1;
      this.refreshRows();
    });
  }

  /** Builds a table row from whatever the Add Lead dialog closes with - either the API's
   *  response payload or, if that's missing fields, the raw form values it fell back to. */
  private mapNewLeadToRow(lead: any): TableRow {
    const id = lead.id ?? Date.now();

    return {
      lead: {
        name: lead.name ?? '',
        subtitle: `LD-${String(id).padStart(5, '0')}`,
      },
      contact: lead.mobile_no ?? lead.phone ?? '',
      gender: lead.gender ?? '',
      source: this.formatSource(lead.source),
      service_category: lead.service_category ?? lead.category ?? lead.type ?? '',
      service_request: lead.service_request ?? lead.reason ?? '',
      branch: lead.branch ?? '',
      status: this.formatStatus(lead.status),
      created_at: this.formatDate(lead.created_at ?? new Date().toISOString()),
      telecaller: lead.creator ?? '',
      action: 'menu',
      id,
    };
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
      const haystack = [lead.name, lead.subtitle ?? '', row['contact']].join(' ').toLowerCase();

      if (this.searchTerm && !haystack.includes(this.searchTerm)) return false;
      if (this.filterState.status && row['status'] !== this.filterState.status) return false;
      if (this.filterState.source && row['source'] !== this.filterState.source) return false;
      if (this.filterState.branch.length > 0 && !this.filterState.branch.includes(String(row['branch']))) return false;
      if (this.filterState.telecaller && row['telecaller'] !== this.filterState.telecaller) return false;

      const leadDate = this.parseLeadDate(String(row['created_at']));
      if (this.filterState.dateFrom && leadDate < this.filterState.dateFrom) return false;
      if (this.filterState.dateTo && leadDate > this.filterState.dateTo) return false;

      return true;
    });
  }

  private parseLeadDate(value: string): string {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }

    const match = value.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
    if (!match) return '';

    const months: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
    const month = months[match[2].toLowerCase()];
    if (!month) return '';
    return `${match[3]}-${month}-${match[1].padStart(2, '0')}`;
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

  openAppointment(row: TableRow): void {
    const lead = this.toFlowLead(row);
    const telecallers = ['Priya Sharma', 'Arun Kumar', 'Divya Raj', 'Karthik S', 'Meera Nair'];
    const draftAppointment: FlowAppointment = {
      ...lead,
      service: '', date: '', startTime: '', staff: lead.telecaller,
      total: 0, paymentMethod: '', paymentStatus: 'Pending',
    };

    const dialogRef = this.dialog.open(LeadProfileDialog, {
      width: '640px', maxWidth: 'calc(100vw - 24px)', maxHeight: '92vh', autoFocus: false,
      panelClass: 'lead-profile-dialog',
      data: {
        lead,
        stage: 'appointment',
        telecallers,
        appointment: draftAppointment,
        treatments: TREATMENTS,
        combos: COMBO_OFFERS,
        isNewBooking: true,
      },
    });

    dialogRef.afterClosed().subscribe((result: LeadProfileDialogResult | undefined) => {
      if (!result || result.action !== 'book-appointment' || !result.appointment) return;

      this.crmFlow.addAppointment(result.appointment);
      this.allRows = this.allRows.filter(item => item !== row);
      this.refreshRows();
      this.toast.success('Appointment booked', `${result.appointment!.name} has been moved to Appointments.`);
      this.router.navigate(['/app/appointments']);
    });
  }

  sendToBranch(row: TableRow): void {
    console.log('Send to branch:', row);
  }
}
