import { FollowUpEntry } from '../common-services/crm-flow.service';

/** Trend direction for a common-detail-card's small trend line. */
export type DetailTrendDirection = 'up' | 'down' | 'neutral';

/** A single stat shown by app-common-detail-card. */
export interface DetailCardData {
  label: string;
  value: string | number;
  trendText?: string;
  trendDirection?: DetailTrendDirection;
}

/** A dropdown filter button shown by app-common-filter-card (e.g. Status, Source, Branch, Date). */
export interface FilterOption {
  key: string;
  label: string;
  options?: string[];
  multiSelect?: boolean;
}

export interface CommonFilterState {
  status: string | null;
  source: string | null;
  branch: string[];
  telecaller: string | null;
  dateFrom: string | null;
  dateTo: string | null;
}

/** Supported cell renderers for app-common-table-card columns. */
export type TableColumnType = 'text' | 'lead' | 'branch' | 'badge' | 'action' | 'rowActions' | 'avatarGroup' | 'callLog' | 'quickActions';

/**
 * One icon button rendered by the 'quickActions' column type (e.g. Confirm / Reschedule /
 * Cancel on an appointment row). `variant` picks the button's accent color.
 */
export interface QuickAction {
  key: string;
  icon: string;
  label: string;
  variant?: 'primary' | 'danger' | 'default';
}

export interface TableColumn {
  key: string;
  header: string;
  type?: TableColumnType;
  width?: string;
  sortable?: boolean;
}

/** Row shape expected by the 'lead' column type: a name + secondary id/subtitle, with an avatar. */
export interface LeadCell {
  name: string;
  subtitle?: string;
}

/**
 * A single telecaller shown by the 'avatarGroup' column type (e.g. "Telecaller Assigned").
 * A lead can be worked by more than one caller over time - store all of them as an array on
 * ONE row instead of duplicating the lead into a second row per caller. Every caller in the
 * array renders as a stacked avatar; hovering (or focusing) an avatar reveals that caller's name.
 */
export interface CallerAvatar {
  name: string;
  empNo: string;
  image?: string;
}

/**
 * A single logged call attempt, shown inside the "View call log" popup opened from the
 * 'callLog' column type's action button - telecaller name, employee number, the date/time of
 * that follow-up call, and any notes/reason recorded for it.
 */
export interface CallerLogEntry {
  telecallerName: string;
  empNo: string;
  dateTime: string;
  notes: string;
}

/** Generic row: plain values for 'text'/'badge' columns, richer shapes for the cell types above. */
export type TableRow = Record<string, string | number | LeadCell | CallerAvatar[] | CallerLogEntry[] | FollowUpEntry[] | QuickAction[]>;

export interface TablePageChangeEvent {
  page: number;
  pageSize: number;
}

/** Emitted by app-common-table-card after a drag-and-drop row reorder within the same table. */
export interface TableReorderEvent {
  previousIndex: number;
  currentIndex: number;
  rows: TableRow[];
}

/**
 * Emitted by app-common-table-card when a row is dragged out of it and dropped into a
 * *different*, connected app-common-table-card (see the `connectedTo`/`dropListId` inputs).
 * The component does not mutate either table's data itself for a cross-table move - it only
 * reports what happened, since the two rows arrays usually belong to different parent state
 * (and may be paginated independently). The parent is expected to splice the row out of the
 * array behind `previousContainerId` and into the array behind `currentContainerId`.
 */
export interface TableTransferEvent {
  row: TableRow;
  previousIndex: number;
  currentIndex: number;
  previousContainerId: string;
  currentContainerId: string;
}