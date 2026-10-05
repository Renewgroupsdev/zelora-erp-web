import { Directive, computed, inject } from '@angular/core';
import { HrService } from '../../shared/common-services/hr.service';
import { LocalListBase } from '../../shared/components/local-list-base';
import { ModuleTab } from '../../shared/components/module-tabs/module-tabs';

/** HR sub-page tabs with live pending counts. Call inside a computed(). */
export function hrTabs(hr: HrService): ModuleTab[] {
  return [
    { label: 'Employees', icon: 'bi-people-fill', path: '/app/hr/employees' },
    { label: 'Attendance', icon: 'bi-fingerprint', path: '/app/hr/attendance' },
    { label: 'Leave & Permission', icon: 'bi-calendar2-x', path: '/app/hr/leave-permission', badge: hr.pendingLeaves() },
    { label: 'Recruitment', icon: 'bi-person-plus-fill', path: '/app/hr/recruitment', badge: hr.pendingManpower() },
    { label: 'Payroll & Payslips', icon: 'bi-wallet2', path: '/app/hr/payroll' },
    { label: 'Appraisals & Bonus', icon: 'bi-award-fill', path: '/app/hr/appraisals', badge: hr.appraisals().filter(a => a.status === 'Draft').length },
    { label: 'Onboarding & Exit', icon: 'bi-door-open-fill', path: '/app/hr/onboarding-exit', badge: hr.exits().filter(x => x.status !== 'Settled').length },
  ];
}

/** HR list pages: `source` filter = department, `branch` filter = branch. */
@Directive()
export abstract class HrListBase extends LocalListBase {
  protected readonly hr = inject(HrService);
  protected override filterFields = { status: 'status', source: 'department', branch: ['branch'] };

  readonly tabs = computed<ModuleTab[]>(() => hrTabs(this.hr));
}
