import { ReportTab } from './reports.model';

/** The four Lead Management reports that have their own page. Every other report comes from the server's /report-center/catalog. */
export const REPORTS: ReportTab[] = [
  {
    id: 'lead-source',
    label: 'Lead Source',
    category: 'Lead Management',
    icon: 'bi-signpost-2-fill',
    variant: 'blue',
    description: 'Breakdown of leads by the channel they came in from - referral, website, walk-in and more.',
  },
  {
    id: 'lead-conversion',
    label: 'Lead Conversion',
    category: 'Lead Management',
    icon: 'bi-graph-up-arrow',
    variant: 'green',
    description: 'How many leads move from new to won at each stage of the pipeline.',
  },
  {
    id: 'lead-status',
    label: 'Lead Status',
    category: 'Lead Management',
    icon: 'bi-flag-fill',
    variant: 'orange',
    description: 'Current distribution of leads across every status - new, contacted, qualified, lost and won.',
  },
  {
    id: 'follow-up',
    label: 'Follow-up',
    category: 'Lead Management',
    icon: 'bi-arrow-repeat',
    variant: 'purple',
    description: 'Follow-ups completed on time versus overdue, grouped by the assigned caller.',
  },
];
