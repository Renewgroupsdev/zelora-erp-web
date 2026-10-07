/**
 * Work tasks (SEO team tracker):
 *  - SEO employees log and update their own tasks (branch, task type, dates, status, result).
 *  - Admin / super admin only view the dashboard across every SEO employee.
 */

export type WorkTaskStatus = 'Not started' | 'In progress' | 'Completed' | 'Blocked';
export type WorkTaskResult = 'Pending' | 'Achieved' | 'Partially achieved' | 'Not achieved';

export const WORK_TASK_STATUSES: WorkTaskStatus[] = ['Not started', 'In progress', 'Completed', 'Blocked'];
export const WORK_TASK_RESULTS: WorkTaskResult[] = ['Pending', 'Achieved', 'Partially achieved', 'Not achieved'];

export const WORK_TASK_TYPES: Record<string, string[]> = {
  SEO: ['On-page SEO', 'Off-page / Backlinks', 'Technical SEO', 'Content / Blog', 'Local SEO / Google Business', 'Keyword research'],
  'Digital marketing': ['Social media', 'Paid ads (Google / Meta)', 'Email / WhatsApp', 'Creative / Design', 'Analytics & reporting'],
  Other: ['Other'],
};
export const ALL_WORK_TASK_TYPES = Object.values(WORK_TASK_TYPES).flat();

export interface WorkTask {
  id: string;
  /** HR employee the task belongs to. */
  empId: string;
  /** Clinic branch / location the work is for. */
  branch: string;
  type: string;
  title: string;
  status: WorkTaskStatus;
  result: WorkTaskResult;
  metric: string;
  plannedDate: string;
  dueDate: string;
  completedDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkTaskStats {
  total: number;
  done: number;
  inProgress: number;
  blocked: number;
  overdue: number;
  notStarted: number;
  percent: number;
  resultsRated: number;
  resultsAchieved: number;
  /** Share of rated results marked Achieved (null when nothing is rated yet). */
  resultPercent: number | null;
}

export function isTaskOverdue(t: Pick<WorkTask, 'status' | 'dueDate'>, today: string): boolean {
  return t.status !== 'Completed' && !!t.dueDate && t.dueDate < today;
}

export function taskStats(list: WorkTask[], today: string): WorkTaskStats {
  const s: WorkTaskStats = { total: list.length, done: 0, inProgress: 0, blocked: 0, overdue: 0, notStarted: 0, percent: 0, resultsRated: 0, resultsAchieved: 0, resultPercent: null };
  for (const t of list) {
    if (t.status === 'Completed') s.done++;
    else if (isTaskOverdue(t, today)) s.overdue++;
    else if (t.status === 'Blocked') s.blocked++;
    else if (t.status === 'In progress') s.inProgress++;
    else s.notStarted++;
    if (t.result !== 'Pending') {
      s.resultsRated++;
      if (t.result === 'Achieved') s.resultsAchieved++;
    }
  }
  s.percent = s.total ? Math.round((s.done / s.total) * 100) : 0;
  s.resultPercent = s.resultsRated ? Math.round((s.resultsAchieved / s.resultsRated) * 100) : null;
  return s;
}

/** An employee works in the SEO team when their department or designation says so. */
export function isSeoEmployee(e: { department: string; designation: string }): boolean {
  return e.department === 'SEO' || /\bseo\b/i.test(e.designation);
}
