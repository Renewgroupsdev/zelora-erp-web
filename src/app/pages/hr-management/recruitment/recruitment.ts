import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { CommonDetailCard } from '../../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../shared/components/common-table-card/common-table-card';
import { ModuleTabs } from '../../../shared/components/module-tabs/module-tabs';
import { DetailCardData, FilterOption, QuickAction, TableColumn, TableRow } from '../../../shared/models/common-components.model';
import { CANDIDATE_STAGES, DEPARTMENTS } from '../../../shared/models/hr.model';
import { downloadExcel, fileStamp } from '../../../shared/utils/export.util';
import { displayDate, inr } from '../../../shared/utils/format.util';
import { reviewPrompt } from '../../../shared/utils/prompt.util';
import { HrListBase } from '../hr-list-base';
import { CandidateProcess } from './candidate-process/candidate-process';
import { EmployeeForm } from '../employees/employee-form/employee-form';
import { ManpowerForm } from './manpower-form/manpower-form';
import { downloadResume, exportCandidates } from './resume';
import { VacancyDetail } from './vacancy-detail/vacancy-detail';

type View = 'requests' | 'vacancies' | 'candidates';

const VIEW_COLUMNS: Record<View, TableColumn[]> = {
  requests: [
    { key: 'requestNo', header: 'Request No', width: '10%' },
    { key: 'designation', header: 'Designation', width: '15%' },
    { key: 'branch', header: 'Branch', type: 'branch', width: '10%' },
    { key: 'department', header: 'Department', width: '10%' },
    { key: 'positions', header: 'Positions', width: '7%' },
    { key: 'budget', header: 'Budget / month', width: '13%' },
    { key: 'total', header: 'Monthly Total', width: '10%' },
    { key: 'requestedBy', header: 'Requested By', width: '10%' },
    { key: 'status', header: 'Status', type: 'badge', width: '8%' },
    { key: 'actions', header: 'Action', type: 'quickActions', width: '7%', sortable: false },
  ],
  vacancies: [
    { key: 'requestNo', header: 'Vacancy', width: '10%' },
    { key: 'designation', header: 'Designation', width: '15%' },
    { key: 'branch', header: 'Branch', type: 'branch', width: '10%' },
    { key: 'filled', header: 'Hired / Positions', width: '10%' },
    { key: 'applicants', header: 'Applicants', width: '8%' },
    { key: 'portals', header: 'Posted On', width: '16%' },
    { key: 'budget', header: 'Budget / month', width: '13%' },
    { key: 'status', header: 'Status', type: 'badge', width: '8%' },
    { key: 'actions', header: 'Action', type: 'quickActions', width: '10%', sortable: false },
  ],
  candidates: [
    { key: 'name', header: 'Candidate', width: '14%' },
    { key: 'vacancy', header: 'Applied For', width: '16%' },
    { key: 'source', header: 'Source', width: '8%' },
    { key: 'experience', header: 'Exp', width: '6%' },
    { key: 'expected', header: 'Expected CTC', width: '10%' },
    { key: 'location', header: 'Location', width: '9%' },
    { key: 'appliedAt', header: 'Applied', width: '9%' },
    { key: 'rating', header: 'Rating', width: '7%' },
    { key: 'status', header: 'Stage', type: 'badge', width: '8%' },
    { key: 'actions', header: 'Action', type: 'quickActions', width: '10%', sortable: false },
  ],
};

@Component({
  selector: 'app-recruitment',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard, ModuleTabs],
  templateUrl: './recruitment.html',
  styleUrl: '../../../shared/styles/erp-page.scss',
})
export class Recruitment extends HrListBase {
  protected readonly noun = 'records';
  readonly view = signal<View>('requests');

  columns: TableColumn[] = VIEW_COLUMNS.requests;
  override sortActive = 'requestedAt';
  override filters = this.filtersFor('requests');

  readonly stats = computed<DetailCardData[]>(() => {
    const vacancies = this.hr.vacancies();
    const open = vacancies.filter(v => v.vacancyStatus === 'Open');
    const budget = open.reduce((s, v) => s + v.budgetMax * (v.positions - v.hired), 0);
    return [
      { label: 'Pending Requests', value: this.hr.pendingManpower(), icon: 'bi-hourglass-split', iconVariant: 'orange' },
      { label: 'Open Positions', value: open.reduce((s, v) => s + v.positions - v.hired, 0), icon: 'bi-briefcase', iconVariant: 'primary' },
      { label: 'Total Applicants', value: this.hr.candidates().length, icon: 'bi-people', iconVariant: 'blue' },
      { label: 'Open Budget / month', value: inr(budget), icon: 'bi-currency-rupee', iconVariant: 'green' },
    ];
  });

  private filtersFor(view: View): FilterOption[] {
    if (view === 'candidates') {
      return [
        { key: 'status', label: 'Stage', options: CANDIDATE_STAGES },
        { key: 'source', label: 'Source', options: ['Indeed', 'LinkedIn', 'Naukri', 'Referral', 'Walk-in'] },
      ];
    }
    return [
      { key: 'status', label: 'Status', options: view === 'requests' ? ['Pending', 'Approved', 'Rejected'] : ['Open', 'On Hold', 'Filled', 'Closed'] },
      { key: 'source', label: 'Department', options: DEPARTMENTS },
      { key: 'branch', label: 'Branch', options: this.hr.branches, multiSelect: true },
    ];
  }

  setView(view: View): void {
    this.view.set(view);
    this.columns = VIEW_COLUMNS[view];
    this.filters = this.filtersFor(view);
    this.filterFields = { status: 'status', source: view === 'candidates' ? 'source' : 'department', branch: ['branch'] };
    this.filterState = { ...this.filterState, status: null, source: null, branch: [] };
    this.sortActive = view === 'candidates' ? 'appliedAt' : 'requestedAt';
    this.sortDirection = 'desc';
    this.currentPage = 1;
    this.refresh();
  }

  private vacancyName(id: string): string {
    const v = this.hr.manpower().find(m => m.id === id);
    return v ? `${v.designation} · ${v.branch}` : '-';
  }

  protected allRows(): TableRow[] {
    const view = this.view();
    const canApprove = this.hr.canApprove();

    if (view === 'candidates') {
      return this.hr.candidates().map(c => ({
        id: c.id,
        vacancyId: c.vacancyId,
        name: c.name,
        vacancy: this.vacancyName(c.vacancyId),
        source: c.source,
        experience: `${c.experienceYears} y`, __experience: c.experienceYears,
        expected: inr(c.expectedCtc), __expected: c.expectedCtc,
        location: c.location,
        appliedAt: displayDate(c.appliedAt), __appliedAt: c.appliedAt,
        rating: c.rating ? '★'.repeat(c.rating) : '-', __rating: c.rating,
        status: c.stage,
        actions: [
          ...(c.stage === 'Hired' ? [{ key: 'addEmployee', icon: 'bi-person-plus-fill', label: this.hr.employeeForCandidate(c.id) ? 'View / edit employee' : 'Add employee', variant: 'primary' as const }] : []),
          { key: 'process', icon: 'bi-person-lines-fill', label: 'Hiring process' },
          { key: 'resume', icon: 'bi-download', label: 'Download resume' },
          { key: 'open', icon: 'bi-kanban', label: 'Open vacancy' },
        ],
      }));
    }

    const list = view === 'requests' ? this.hr.manpower() : this.hr.vacancies();
    return list.map(m => {
      const applicants = this.hr.candidates().filter(c => c.vacancyId === m.id).length;
      const actions: QuickAction[] = [];
      if (view === 'requests' && m.status === 'Pending' && canApprove) actions.push({ key: 'review', icon: 'bi-check2-square', label: 'Approve / Reject', variant: 'primary' });
      if (m.status === 'Approved') actions.push({ key: 'open', icon: 'bi-kanban', label: 'Candidates & portals', variant: 'primary' });
      if (view === 'vacancies' && m.vacancyStatus === 'Open') actions.push({ key: 'hold', icon: 'bi-pause-circle', label: 'Put on hold' });
      if (view === 'vacancies' && m.vacancyStatus === 'On Hold') actions.push({ key: 'reopen', icon: 'bi-play-circle', label: 'Reopen' });
      return {
        id: m.id,
        requestNo: m.requestNo,
        designation: m.designation,
        branch: m.branch,
        department: m.department,
        positions: String(m.positions), __positions: m.positions,
        filled: `${m.hired} / ${m.positions}`, __filled: m.hired / m.positions,
        applicants: String(applicants), __applicants: applicants,
        portals: m.postedTo.length ? m.postedTo.join(', ') : 'Not posted',
        budget: `${inr(m.budgetMin)} - ${inr(m.budgetMax)}`, __budget: m.budgetMax,
        total: inr(m.budgetMax * m.positions), __total: m.budgetMax * m.positions,
        requestedBy: m.requestedBy,
        __requestedAt: m.requestedAt,
        status: view === 'requests' ? m.status : (m.vacancyStatus ?? 'Open'),
        actions,
      };
    });
  }

  newRequest(): void {
    this.openDialog(ManpowerForm, null, '860px');
  }

  async onQuickAction(event: { row: TableRow; action: string }): Promise<void> {
    const id = String(event.row['id']);
    switch (event.action) {
      case 'review': {
        const d = await reviewPrompt(`${event.row['requestNo']} · ${event.row['designation']}`, `${event.row['positions']} position(s) at ${event.row['branch']} · budget ${event.row['budget']} per month.`);
        if (d) this.hr.reviewManpower(id, d.approve, d.remarks);
        break;
      }
      case 'open':
        this.openDialog(VacancyDetail, { vacancyId: this.view() === 'candidates' ? event.row['vacancyId'] : id }, '1100px');
        break;
      case 'addEmployee':
        // Already created from this candidate -> open that record; otherwise load the candidate's details into a new employee.
        this.openDialog(EmployeeForm, { employee: this.hr.employeeForCandidate(id) ?? null, candidateId: id }, '900px');
        break;
      case 'process':
        this.openDialog(CandidateProcess, { candidateId: id }, '980px');
        break;
      case 'resume': {
        const c = this.hr.candidates().find(x => x.id === id);
        if (c) downloadResume(c, this.hr.manpower().find(m => m.id === c.vacancyId));
        break;
      }
      case 'hold':
        this.hr.setVacancyStatus(id, 'On Hold');
        break;
      case 'reopen':
        this.hr.setVacancyStatus(id, 'Open');
        break;
    }
  }

  exportExcel(): void {
    if (this.view() === 'candidates') {
      const ids = new Set(this.filteredRows.map(r => r['id']));
      exportCandidates(this.hr.candidates().filter(c => ids.has(c.id)), id => this.vacancyName(id));
      return;
    }
    downloadExcel(`${this.view()}-${fileStamp()}`, [this.exportSheet(this.view() === 'requests' ? 'Manpower Requests' : 'Vacancies')]);
  }
}
