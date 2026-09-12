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

interface LeadSeed {
  name: string;
  phone: string;
  gender: string;
  source: string;
  service_category: string;
  service_request: string;
  branch: string;
  created_at: string;
  status: string;
}

const LEAD_SEEDS: LeadSeed[] = [
  { name: 'Ananya Sharma', phone: '+91 98765 43210', gender: 'F', source: 'Website', service_category: 'Hair', service_request: 'Hair Loss', branch: 'Anna Nagar', status: 'New', created_at: '09-Sep-2026' },
  { name: 'Rahul Kumar', phone: '+91 91234 56780', gender: 'M', source: 'Instagram', service_category: 'Skin', service_request: 'Acne Care', branch: 'Velachery', status: 'New', created_at: '08-Apr-2026' },
  { name: 'Sneha Menon', phone: '+91 98867 66554', gender: 'F', source: 'Referral', service_category: 'Hair', service_request: 'PRP Therapy', branch: 'Indiranagar', status: 'New', created_at: '15-Apr-2026' },
  { name: 'Vikram Patel', phone: '+91 90123 45678', gender: 'M', source: 'Google Ads', service_category: 'Hair', service_request: 'Hair Transplant', branch: 'Coimbatore', status: 'New', created_at: '22-Apr-2026' },
  { name: 'Neha Prasad', phone: '+91 93450 78920', gender: 'F', source: 'Walk-in', service_category: 'Skin', service_request: 'Skin Rejuvenation', branch: 'Anna Nagar', status: 'New', created_at: '29-Apr-2026' },
  { name: 'Kavin Raj', phone: '+91 99520 13840', gender: 'M', source: 'Meta Campaign', service_category: 'Skin', service_request: 'Laser Toning', branch: 'T Nagar', status: 'New', created_at: '03-May-2026' },
  { name: 'Aarthi Nair', phone: '+91 98401 55082', gender: 'F', source: 'Website', service_category: 'Skin', service_request: 'Botox', branch: 'Velachery', status: 'New', created_at: '10-May-2026' },
  { name: 'Siddharth Rao', phone: '+91 95009 44671', gender: 'M', source: 'Call Center', service_category: 'Hair', service_request: 'GFC Treatment', branch: 'Bengaluru', status: 'New', created_at: '17-May-2026' },
  { name: 'Divya Iyer', phone: '+91 97890 24231', gender: 'F', source: 'Referral', service_category: 'Hair', service_request: 'Dandruff Care', branch: 'Anna Nagar', status: 'New', created_at: '24-May-2026' },
  { name: 'Mohit Saini', phone: '+91 90947 11136', gender: 'M', source: 'Google Ads', service_category: 'Hair', service_request: 'Beard Transplant', branch: 'Coimbatore', status: 'New', created_at: '31-May-2026' },
  { name: 'Nikita Shah', phone: '+91 96001 67002', gender: 'F', source: 'Website', service_category: 'Skin', service_request: 'Hydra Facial', branch: 'Indiranagar', status: 'New', created_at: '04-Jun-2026' },
  { name: 'Gokul Balan', phone: '+91 94447 80602', gender: 'M', source: 'Walk-in', service_category: 'Skin', service_request: 'Pigmentation', branch: 'T Nagar', status: 'New', created_at: '11-Jun-2026' },
  { name: 'Farah Ali', phone: '+91 98411 22390', gender: 'F', source: 'Instagram', service_category: 'Skin', service_request: 'Scar Reduction', branch: 'Anna Nagar', status: 'New', created_at: '18-Jun-2026' },
  { name: 'Ritesh Verma', phone: '+91 99628 73201', gender: 'M', source: 'Campaign', service_category: 'Hair', service_request: 'Hair Fall Control', branch: 'Velachery', status: 'New', created_at: '25-Jun-2026' },
  { name: 'Pooja Bhat', phone: '+91 87544 61902', gender: 'F', source: 'Referral', service_category: 'Skin', service_request: 'Anti Ageing', branch: 'Bengaluru', status: 'New', created_at: '02-Jul-2026' },
  { name: 'Kishore Das', phone: '+91 93812 55870', gender: 'M', source: 'Website', service_category: 'Hair', service_request: 'MNRF', branch: 'Coimbatore', status: 'New', created_at: '09-Jul-2026' },
  { name: 'Harsha V.', phone: '+91 97908 80944', gender: 'M', source: 'Meta Campaign', service_category: 'Hair', service_request: 'Hair Regrowth', branch: 'Anna Nagar', status: 'New', created_at: '16-Jul-2026' },
  { name: 'Lavanya S.', phone: '+91 90430 12788', gender: 'F', source: 'Walk-in', service_category: 'Hair', service_request: 'Medi Facial', branch: 'Velachery', status: 'New', created_at: '23-Jul-2026' },
  { name: 'Ashwin George', phone: '+91 88921 41770', gender: 'M', source: 'Call Center', service_category: 'Skin', service_request: 'Tattoo Removal', branch: 'Indiranagar', status: 'New', created_at: '30-Jul-2026' },
  { name: 'Madhumitha R.', phone: '+91 89397 62014', gender: 'F', source: 'Google Ads', service_category: 'Hair', service_request: 'Skin Brightening', branch: 'T Nagar', status: 'New', created_at: '04-Aug-2026' },
  { name: 'Pranav Joshi', phone: '+91 93428 11590', gender: 'M', source: 'Website', service_category: 'Hair', service_request: 'Hair PRP', branch: 'Bengaluru', status: 'New', created_at: '11-Aug-2026' },
  { name: 'Heena Kapoor', phone: '+91 98845 75060', gender: 'F', source: 'Instagram', service_category: 'Skin', service_request: 'Chemical Peel', branch: 'Anna Nagar', status: 'New', created_at: '18-Aug-2026' },
  { name: 'Rohit Narang', phone: '+91 97910 33044', gender: 'M', source: 'Referral', service_category: 'Hair', service_request: 'FUE Consultation', branch: 'Coimbatore', status: 'New', created_at: '25-Aug-2026' },
  { name: 'Megha Sen', phone: '+91 91503 22018', gender: 'F', source: 'Campaign', service_category: 'Hair', service_request: 'Bridal Skin Plan', branch: 'Velachery', status: 'New', created_at: '02-Sep-2026' },
];

@Component({
  selector: 'app-lead-management',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard],
  templateUrl: './lead-management.html',
  styleUrl: './lead-management.scss',
})
export class LeadManagement implements OnInit {

  constructor(private dialog: MatDialog, private router: Router) { }

  stats: DetailCardData[] = [
    { label: 'Total Leads', value: '1,284', trendText: '8.4% this month', trendDirection: 'up' },
    { label: 'Total Follow-Ups', value: FOLLOW_UP_SEEDS.length, trendText: 'Across all telecallers', trendDirection: 'neutral' },
    // { label: 'Due Today', value: 2, trendText: 'Needs attention', trendDirection: 'up' },
    { label: 'Completed', value: 3, trendText: 'Follow-up closed', trendDirection: 'up' },
    { label: 'Schedule', value: 18, trendText: 'Visits planned this week', trendDirection: 'neutral' },
    { label: 'Appointment', value: 12, trendText: 'Confirmed appointments', trendDirection: 'up' },
    { label: 'Conversion Rate', value: '30.2%', trendText: '3.1% vs last month', trendDirection: 'up' },
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
    { key: 'action', header: 'Action', type: 'action', width: '72px', sortable: false },
  ];

  readonly pageSizeOptions = [10, 30, 50, 100];
  readonly allRows: TableRow[] = LEAD_SEEDS.map((lead, index) => ({
    lead: {
      name: lead.name,
      subtitle: `LD-${String(284 - index).padStart(5, '0')}`,
    },
    contact: lead.phone,
    source: lead.source,
    service_category: lead.service_category,
    service_request: lead.service_request,
    branch: lead.branch,
    status: lead.status,
    created_at: lead.created_at,
    gender: lead.gender,
    telecaller: ['Priya Sharma', 'Arun Kumar', 'Divya Raj', 'Karthik S'][index % 4],
    action: 'menu',
  }));

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
    this.refreshRows();
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
    this.moveLeadToFollowUp(row);
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
      if (leadData) {
        console.log('Lead saved:', leadData);

      }
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
    console.log('Appointment:', row);
  }

  sendToBranch(row: TableRow): void {
    console.log('Send to branch:', row);
  }
}
