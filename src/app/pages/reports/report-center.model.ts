/** Contract of the /report-center API (App\Services\Reports on the backend). */

export type ReportColumnType = 'text' | 'number' | 'money' | 'percent' | 'date' | 'datetime' | 'status' | 'boolean';
export type ReportFilterType = 'text' | 'select' | 'multiselect' | 'number' | 'date' | 'boolean';
export type ReportFormat = 'pdf' | 'xlsx' | 'csv';

export interface ReportColumn {
  key: string;
  label: string;
  type: ReportColumnType;
  sortable: boolean;
  default_hidden: boolean;
}

export interface ReportOption { value: string; label: string; }

export interface ReportFilterDef {
  key: string;
  label: string;
  type: ReportFilterType;
  options: ReportOption[] | null;
  lazy_options: boolean;
}

export interface ReportSummaryDef { key: string; label: string; format: 'number' | 'money' | 'percent'; icon: string; tone: string; }

/** A section of the Reports page - name, icon, hint and colour all come from the server. */
export interface ReportCategory {
  name: string;
  icon: string;
  hint: string;
  variant: 'primary' | 'green' | 'orange' | 'blue' | 'purple' | 'red' | 'gray';
}

export interface ReportMeta {
  slug: string;
  title: string;
  category: string;
  icon: string;
  description: string;
  /** What Roles & Permissions gives this role inside the report. */
  can_records?: boolean;
  can_analytics?: boolean;
  can_export: boolean;
  /** One of the four Lead reports with their own page: the catalog only says whether this role may open it. */
  legacy?: boolean;
  /** Tile colour (the colour of its section). */
  variant?: ReportCategory['variant'];
  date_column: { label: string; type: 'date' | 'datetime' } | null;
  columns: ReportColumn[];
  filters: ReportFilterDef[];
  summary: ReportSummaryDef[];
  default_sort: string[];
  presets: { key: string; label: string }[];
}

export interface ReportCard extends ReportSummaryDef { value: number | null; }

export interface ReportChart {
  type: 'donut' | 'bar' | 'line';
  title: string;
  format: 'number' | 'money';
  points: { label: string; value: number }[];
}

export interface ReportPagination {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
}

/** Everything the user can set; the one object the table, the summary, the URL, saved filters and the export all share. */
export interface ReportQuery {
  preset: string;
  from: string;
  to: string;
  search: string;
  /** text / select / boolean: string | string[] ; number / date: { min, max } */
  filters: Record<string, string | string[] | { min?: string; max?: string }>;
  sort: { key: string; dir: 'asc' | 'desc' }[];
  page: number;
  perPage: number;
}

export interface ReportPreset { id: number; name: string; filters: Record<string, unknown>; }

export const PAGE_SIZES = [10, 25, 50, 100];
