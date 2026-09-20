import { FollowUpEntry } from '../common-services/crm-flow.service';

export type DetailTrendDirection = 'up' | 'down' | 'neutral';

export type DetailCardIconVariant = 'primary' | 'green' | 'orange' | 'blue' | 'purple';

export interface DetailCardData {
  label: string;
  value: string | number;
  trendText?: string;
  trendDirection?: DetailTrendDirection;
  icon?: string;
  iconVariant?: DetailCardIconVariant;
  sparkline?: number[];
}

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

export type TableColumnType = 'text' | 'lead' | 'branch' | 'badge' | 'action' | 'avatarGroup' | 'callLog' | 'quickActions';

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

export interface LeadCell {
  name: string;
  subtitle?: string;
}

export interface CallerAvatar {
  name: string;
  empNo: string;
  image?: string;
}

export interface CallerLogEntry {
  telecallerName: string;
  empNo: string;
  dateTime: string;
  notes: string;
}

export type TableRow = Record<string, string | number | LeadCell | CallerAvatar[] | CallerLogEntry[] | FollowUpEntry[] | QuickAction[]>;

export interface TablePageChangeEvent {
  page: number;
  pageSize: number;
}

export interface TableReorderEvent {
  previousIndex: number;
  currentIndex: number;
  rows: TableRow[];
}

export interface TableTransferEvent {
  row: TableRow;
  previousIndex: number;
  currentIndex: number;
  previousContainerId: string;
  currentContainerId: string;
}