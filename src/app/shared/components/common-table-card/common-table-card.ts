import { CommonModule } from '@angular/common';
import { CdkDragDrop, DragAxis, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, EventEmitter, Input, Output, ViewChild, inject } from '@angular/core';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSortModule, Sort, SortDirection } from '@angular/material/sort';
import { MatTable, MatTableModule } from '@angular/material/table';
import { PageLoader } from '../page-loader/page-loader';
import { RecordHistory } from '../record-history/record-history';
import { AuthService } from '../../../core/auth/auth.service';
import { CallerAvatar, CallerLogEntry, LeadCell, QuickAction, TableColumn, TablePageChangeEvent, TableReorderEvent, TableRow, TableTransferEvent } from '../../models/common-components.model';

const STATUS_MAP: Record<string, 'green' | 'orange' | 'red' | 'gray' | 'blue'> = {
  qualified: 'green', active: 'green', completed: 'green', converted: 'green', paid: 'green', 'on time': 'green',
  contacted: 'orange', pending: 'orange', 'in progress': 'orange', due: 'orange', late: 'orange',
  lost: 'red', cancelled: 'red', failed: 'red', overdue: 'red',
  new: 'gray', draft: 'gray', inactive: 'gray',
  scheduled: 'blue', follow: 'blue', upcoming: 'blue',
  // Purchase Management
  approved: 'green', received: 'green', adjusted: 'green', 'in stock': 'green', full: 'green',
  'partially received': 'orange', partial: 'orange', open: 'orange', 'debit note': 'orange',
  rejected: 'red', urgent: 'red', 'low stock': 'red', 'out of stock': 'red',
  ordered: 'blue', 'credit note': 'blue',
  // HR Management
  onboarding: 'blue', 'on notice': 'orange', exited: 'red',
  present: 'green', 'half day': 'orange', absent: 'red', 'on leave': 'blue', permission: 'blue', holiday: 'gray', 'not marked': 'gray',
  applied: 'gray', shortlisted: 'blue', interview: 'orange', interviewed: 'blue', selected: 'green', verification: 'orange', offered: 'blue', hired: 'green', 'offer declined': 'red',
  processed: 'blue', released: 'green', filled: 'green', 'on hold': 'gray', closed: 'gray',
  'notice period': 'orange', clearance: 'blue', settled: 'green',
  // Accounts
  unpaid: 'red', 'partially paid': 'orange', sent: 'blue',
  // Appointments
  'in consultation': 'orange', consultation: 'orange', 'awaiting terms': 'orange', invoiced: 'blue', 'consultation only': 'gray', 'consultation fee': 'blue', 'free consultation': 'green',
  receipt: 'green', payment: 'red', sales: 'blue', purchase: 'orange', contra: 'gray', journal: 'gray',
  // Leads / follow-ups
  'new lead': 'blue', lead: 'gray', valid: 'green', invalid: 'red', customer: 'green', schedule: 'blue', appointment: 'blue',
  'follow-ups': 'orange', 'follow-up': 'orange', 'cool-follow-ups': 'blue', 'hot-leads': 'red',
  // Follow-up type
  general: 'orange', cool: 'blue', hot: 'red',
};

/** A small icon for the status chip: the status's own where we know it, else one for its colour. */
const STATUS_ICONS: Record<string, string> = {
  'hot-leads': 'bi-fire', 'cool-follow-ups': 'bi-snow2', 'follow-ups': 'bi-arrow-repeat', 'follow-up': 'bi-arrow-repeat',
  'new lead': 'bi-stars', customer: 'bi-person-check-fill', schedule: 'bi-calendar-check', appointment: 'bi-calendar-check',
  invalid: 'bi-x-lg', valid: 'bi-check-lg', contacted: 'bi-telephone-fill', pending: 'bi-hourglass-split',
  urgent: 'bi-exclamation-lg', overdue: 'bi-exclamation-lg', rejected: 'bi-x-lg', cancelled: 'bi-x-lg', failed: 'bi-x-lg',
  paid: 'bi-check-lg', approved: 'bi-check-lg', completed: 'bi-check-lg', converted: 'bi-check-lg', active: 'bi-lightning-charge-fill',
  draft: 'bi-pencil', inactive: 'bi-pause-fill', 'on hold': 'bi-pause-fill', closed: 'bi-lock-fill', open: 'bi-unlock-fill',
  'in progress': 'bi-arrow-repeat', ordered: 'bi-bag-check-fill', received: 'bi-box-seam-fill', 'in stock': 'bi-box-seam-fill',
  'low stock': 'bi-exclamation-lg', 'out of stock': 'bi-x-lg', present: 'bi-check-lg', absent: 'bi-x-lg', 'on leave': 'bi-airplane-fill',
};
const TONE_ICONS: Record<string, string> = { green: 'bi-check-lg', orange: 'bi-hourglass-split', red: 'bi-exclamation-lg', blue: 'bi-info-lg', gray: 'bi-dash-lg' };

const AVATAR_PALETTE_SIZE = 5;

@Component({
  selector: 'app-common-table-card',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatPaginatorModule, MatSortModule, DragDropModule, PageLoader, RecordHistory],
  templateUrl: './common-table-card.html',
  styleUrl: './common-table-card.scss',
})
export class CommonTableCard {
  private readonly auth = inject(AuthService);

  /**
   * Roles & Permissions action slug per row button, e.g. `{ edit: 'edit-product', delete: 'delete-product' }`.
   * Keys: edit, delete, call, validate, followUp, sendToBranch, viewCallLog, profile, bulkActions,
   * or a quick action key. A button without a slug here (or on the quick action) is always shown.
   */
  @Input() actionPermissions: Record<string, string> = {};

  /**
   * Audited model name (e.g. "Product", "Branch"): adds a History button to every row's action cell that opens the record's
   * full audit trail. Needs the row's database id under `historyKey`; hidden for roles without view-audit-data-changes.
   */
  @Input() historyType = '';
  @Input() historyKey = 'id';
  @Input() historyTitleKey = 'name';

  historyId(row: TableRow): string | number | null {
    const v = row[this.historyKey];
    return typeof v === 'string' || typeof v === 'number' ? v : null;
  }

  /** Name of the record plus its code ("karthick · LD-00060"): a name / avatar cell carries both, a plain row uses its `code`. */
  historyTitle(row: TableRow): string {
    const v = row[this.historyTitleKey] as unknown;
    if (v && typeof v === 'object') {
      const cell = v as { name?: string; subtitle?: string };
      return [cell.name, cell.subtitle].filter(Boolean).join(' · ');
    }
    // Rows without a name column (purchase documents ...) are titled by their document number.
    const docNo = ['requestNo', 'poNo', 'grnNo', 'returnNo', 'noteNo', 'transferNo', 'billNo', 'voucherNo', 'invoiceNo', 'batchNo']
      .map(k => row[k]).find(x => typeof x === 'string' && x);
    const name = typeof v === 'string' && v ? v : typeof docNo === 'string' ? docNo : '';
    const code = row['code'];
    return typeof code === 'string' && code && code !== name && !name.includes(code) ? [name, code].filter(Boolean).join(' · ') : name;
  }

  @Input() title = '';
  @Input() recordCountText = '';
  @Input() columns: TableColumn[] = [];

  /**
   * Columns are sized to their content (table-layout: auto), so no column carries dead whitespace and adding
   * a column just widens the table - the scroll area then scrolls horizontally. This only supplies a floor:
   * the explicit `minWidth`, or enough room for the buttons of an action column (30px each + 6px gaps + padding).
   */
  colMinWidth(col: TableColumn): number | null {
    if (col.minWidth) return col.minWidth;
    const buttons =
      col.type === 'quickActions' ? Math.max(0, ...this.rows.map(row => this.asQuickActions(row[col.key]).length))
      : col.type === 'rowActions' ? 2
      : col.type === 'action' ? 3
      : 0;
    return buttons ? buttons * 36 + 24 : null;
  }
  @Input() rows: TableRow[] = [];
  /** Shows a heartbeat loader over the rows while a page of data is (re)loading - the
   *  initial load and every subsequent page/sort/page-size change. */
  @Input() loading = false;
  @Input() bulkActionsLabel?: string;
  @Input() totalRecords = 0;
  @Input() pageSize = 10;
  @Input() pageSizeOptions: number[] = [10, 30, 50, 100];
  @Input() pageInfoText = '';
  @Input() currentPage = 1;
  @Input() sortActive = '';
  @Input() sortDirection: SortDirection = 'asc';
  @Input() dragDropEnabled = false;
  @Input() dropListId = '';
  @Input() connectedTo: string | string[] = [];
  /** Row `id` to highlight; set it (with `rowSelect`) to turn the table into a master list. */
  @Input() selectedId: string | number | null = null;
  /** Buttons the "action" column offers (keys of actionPermissions); null = every button, as before. */
  @Input() actions: string[] | null = null;

  @Output() pageChange = new EventEmitter<TablePageChangeEvent>();
  @Output() sortChange = new EventEmitter<Sort>();
  @Output() rowActionClick = new EventEmitter<TableRow>();
  @Output() bulkActionsClick = new EventEmitter<void>();
  @Output() appointmentClick = new EventEmitter<TableRow>();
  @Output() followUpClick = new EventEmitter<TableRow>();
  @Output() callClick = new EventEmitter<TableRow>();
  @Output() validateClick = new EventEmitter<{ row: TableRow; valid: boolean }>();
  @Output() sendToBranchClick = new EventEmitter<TableRow>();
  @Output() viewCallLogClick = new EventEmitter<TableRow>();
  @Output() editClick = new EventEmitter<TableRow>();
  @Output() deleteClick = new EventEmitter<TableRow>();
  @Output() assignClick = new EventEmitter<TableRow>();
  @Output() auditClick = new EventEmitter<TableRow>();
  @Output() rowReorder = new EventEmitter<TableReorderEvent>();
  @Output() quickActionClick = new EventEmitter<{ row: TableRow; action: string }>();
  @Output() profileClick = new EventEmitter<TableRow>();
  @Output() rowSelect = new EventEmitter<TableRow>();
  @Output() rowTransfer = new EventEmitter<TableTransferEvent>();

  @ViewChild(MatTable) table!: MatTable<TableRow>;

  dragDisabled = true;

  avatarTooltip: { top: number; left: number; name: string, empNo: string } | null = null;

  /** Columns to render - an action column with no icon to show (permissions / row state) is left out entirely. */
  get displayedColumns(): string[] {
    const keys = this.columns.filter(column => this.hasVisibleContent(column)).map(column => column.key);
    return this.dragDropEnabled ? ['dragHandle', ...keys] : keys;
  }

  private hasVisibleContent(column: TableColumn): boolean {
    switch (column.type) {
      case 'quickActions':
        return this.rows.some(row => this.asQuickActions(row[column.key]).length > 0);
      case 'rowActions':
        return this.allowed('edit') || this.allowed('delete');
      case 'action':
        return ['call', 'edit', 'followUp', 'sendToBranch', 'assign', 'audit', 'delete'].some(key => this.show(key))
          || (this.show('validate') && this.rows.some(row => !!row['canValidate']));
      case 'callLog':
        return this.allowed('viewCallLog');
      default:
        return true;
    }
  }

  asLeadCell(value: TableRow[string]): LeadCell {
    return value as LeadCell;
  }

  asCallerAvatars(value: TableRow[string]): CallerAvatar[] {
    return Array.isArray(value) ? (value as CallerAvatar[]) : [];
  }

  asCallerLog(value: TableRow[string]): CallerLogEntry[] {
    return Array.isArray(value) ? (value as CallerLogEntry[]) : [];
  }

  /**
   * Quick actions the signed-in role may use (the action's own `permission`, else `actionPermissions[key]`),
   * labelled and iconed as their action is on Roles & Permissions (the page's own label / icon as fallback).
   */
  asQuickActions(value: TableRow[string]): QuickAction[] {
    return Array.isArray(value)
      ? (value as QuickAction[])
        .filter(a => this.allowed(a.key, a.permission))
        .map(a => {
          const slug = a.permission ?? this.actionPermissions[a.key];
          return { ...a, label: a.fixedLabel ? a.label : this.actionName(a.key, a.label, slug), icon: a.fixedIcon ? a.icon : this.actionIcon(a.key, a.icon, slug) };
        })
      : [];
  }

  /** The row button's Action Name from Roles & Permissions, or `fallback` (no action / empty name). */
  actionName(key: string, fallback: string, slug = this.actionPermissions[key]): string {
    return (slug && this.auth.actionDetails(slug)?.action_name?.trim()) || fallback;
  }

  /** The row button's Icon from Roles & Permissions, or `fallback` (no action / empty icon). */
  actionIcon(key: string, fallback: string, slug = this.actionPermissions[key]): string {
    return (slug && this.auth.actionDetails(slug)?.logo?.trim()) || fallback;
  }

  /** An "action" column button: offered by the page (`actions`) and allowed for the role. */
  show(key: string): boolean {
    return (!this.actions ? !['assign', 'audit'].includes(key) : this.actions.includes(key)) && this.allowed(key);
  }

  /** Whether a row button is shown: true unless it has an action slug the role is not ticked on. */
  allowed(key: string, slug = this.actionPermissions[key]): boolean {
    return !slug || this.auth.hasActionAccess(slug);
  }

  showAvatarTooltip(event: Event, caller: CallerAvatar): void {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();

    this.avatarTooltip = {
      top: rect.top,
      left: rect.left + rect.width / 2,
      name: caller.name,
      empNo: caller.empNo
    };
  }

  hideAvatarTooltip(): void {
    this.avatarTooltip = null;
  }

  onRowClick(event: Event, row: TableRow): void {
    // Buttons and links inside a row (quick actions, name link) have their own behaviour.
    if ((event.target as HTMLElement).closest('button, a')) return;
    this.rowSelect.emit(row);
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
  }

  avatarClass(rowIndex: number): string {
    const slot = (rowIndex % AVATAR_PALETTE_SIZE) + 1;
    return `avatar-color-${slot}`;
  }

  avatarColorForName(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    }
    const slot = (hash % AVATAR_PALETTE_SIZE) + 1;
    return `avatar-color-${slot}`;
  }

  badgeClass(status: string | number): string {
    const key = String(status).trim().toLowerCase();
    return `badge-${STATUS_MAP[key] ?? 'gray'}`;
  }

  /** Icon inside the status chip (see STATUS_ICONS / TONE_ICONS). */
  statusIcon(status: string | number): string {
    const key = String(status).trim().toLowerCase();
    return STATUS_ICONS[key] ?? TONE_ICONS[STATUS_MAP[key] ?? 'gray'];
  }

  isSortable(column: TableColumn): boolean {
    return column.type !== 'action' && column.type !== 'rowActions' && column.sortable !== false;
  }

  get hasConnections(): boolean {
    return Array.isArray(this.connectedTo) ? this.connectedTo.length > 0 : !!this.connectedTo;
  }

  get dragBoundary(): string {
    return this.hasConnections ? '.cdk-drag-boundary-disabled' : '.table-scroll';
  }

  get dragLockAxis(): DragAxis | null {
    return this.hasConnections ? null : 'y';
  }

  onPaginatorChange(event: PageEvent): void {
    this.pageChange.emit({
      page: event.pageIndex + 1,
      pageSize: event.pageSize,
    });
  }

  onHandleMouseDown(): void {
    this.dragDisabled = false;
  }

  drop(event: CdkDragDrop<TableRow[]>) {
    this.dragDisabled = true;

    if (event.previousContainer === event.container) {
      const previousIndex = this.rows.findIndex((d) => d === event.item.data);

      moveItemInArray(this.rows, previousIndex, event.currentIndex);
      this.table.renderRows();

      this.rowReorder.emit({ previousIndex, currentIndex: event.currentIndex, rows: this.rows });
      return;
    }

    this.rowTransfer.emit({
      row: event.item.data,
      previousIndex: event.previousIndex,
      currentIndex: event.currentIndex,
      previousContainerId: event.previousContainer.id,
      currentContainerId: event.container.id,
    });
  }

}
