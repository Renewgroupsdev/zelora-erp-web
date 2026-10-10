import { CommonModule } from '@angular/common';
import { CdkDragDrop, DragAxis, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSortModule, Sort, SortDirection } from '@angular/material/sort';
import { MatTable, MatTableModule } from '@angular/material/table';
import { PageLoader } from '../page-loader/page-loader';
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
  'in consultation': 'orange', 'awaiting terms': 'orange', invoiced: 'blue',
  receipt: 'green', payment: 'red', sales: 'blue', purchase: 'orange', contra: 'gray', journal: 'gray',
};

const AVATAR_PALETTE_SIZE = 5;

@Component({
  selector: 'app-common-table-card',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatPaginatorModule, MatSortModule, DragDropModule, PageLoader],
  templateUrl: './common-table-card.html',
  styleUrl: './common-table-card.scss',
})
export class CommonTableCard {
  @Input() title = '';
  @Input() recordCountText = '';
  @Input() columns: TableColumn[] = [];
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
  @Output() rowReorder = new EventEmitter<TableReorderEvent>();
  @Output() quickActionClick = new EventEmitter<{ row: TableRow; action: string }>();
  @Output() profileClick = new EventEmitter<TableRow>();
  @Output() rowSelect = new EventEmitter<TableRow>();
  @Output() rowTransfer = new EventEmitter<TableTransferEvent>();

  @ViewChild(MatTable) table!: MatTable<TableRow>;

  dragDisabled = true;

  avatarTooltip: { top: number; left: number; name: string, empNo: string } | null = null;

  get displayedColumns(): string[] {
    const keys = this.columns.map(column => column.key);
    return this.dragDropEnabled ? ['dragHandle', ...keys] : keys;
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

  asQuickActions(value: TableRow[string]): QuickAction[] {
    return Array.isArray(value) ? (value as QuickAction[]) : [];
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