export type ReportVariant = 'primary' | 'green' | 'orange' | 'blue' | 'purple' | 'red' | 'gray';

export interface ReportTab {
  id: string;
  label: string;
  category: string;
  icon: string;
  variant: ReportVariant;
  description: string;
}
