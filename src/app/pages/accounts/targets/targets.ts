import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { AccountsService } from '../../../shared/common-services/accounts.service';
import { TargetsService } from '../../../shared/common-services/targets.service';
import { ModuleTabs } from '../../../shared/components/module-tabs/module-tabs';
import { BranchPerformance, CATEGORY_ICONS, IncentiveSlab, TREATMENT_CATEGORIES, TreatmentCategory } from '../../../shared/models/targets.model';
import { downloadExcel } from '../../../shared/utils/export.util';
import { inr, isoDate } from '../../../shared/utils/format.util';
import { accountsTabs } from '../accounts-list-base';

@Component({
  selector: 'app-targets',
  standalone: true,
  imports: [CommonModule, FormsModule, ModuleTabs],
  templateUrl: './targets.html',
  styleUrls: ['../../../shared/styles/erp-page.scss', './targets.scss'],
})
export class Targets {
  private readonly acc = inject(AccountsService);
  protected readonly store = inject(TargetsService);

  readonly inr = inr;
  readonly month = signal(isoDate().slice(0, 7));
  readonly tabs = computed(() => accountsTabs(this.acc));
  readonly rules = this.store.rules;
  readonly access = this.store.access;
  readonly categories = TREATMENT_CATEGORIES;
  readonly icons = CATEGORY_ICONS;
  readonly view = signal<'branches' | 'employees' | 'treatments'>('branches');
  readonly empBranch = signal('');

  readonly rows = computed(() => this.store.performance(this.month()));
  readonly employees = computed(() => this.store.employeePerformance(this.month()).filter(e => !this.empBranch() || e.branch === this.empBranch()));
  readonly employeeTotals = computed(() => {
    const list = this.employees();
    const target = list.reduce((s, e) => s + e.target, 0);
    const achieved = list.reduce((s, e) => s + e.achieved, 0);
    return { target, achieved, percent: target ? (achieved / target) * 100 : 0, incentive: list.reduce((s, e) => s + e.incentive, 0) };
  });
  readonly treatments = computed(() => this.store.treatmentPerformance(this.month()));
  readonly totals = computed(() => {
    const rows = this.rows();
    const target = rows.reduce((s, r) => s + r.revenueTarget, 0);
    const achieved = rows.reduce((s, r) => s + r.achieved, 0);
    return {
      target, achieved,
      percent: target ? (achieved / target) * 100 : 0,
      revenueIncentive: rows.reduce((s, r) => s + r.revenueIncentive, 0),
      telecallerIncentive: rows.reduce((s, r) => s + r.telecallerIncentive, 0),
      incentive: rows.reduce((s, r) => s + r.totalIncentive, 0),
      conversions: rows.reduce((s, r) => s + r.conversions, 0),
      conversionTarget: rows.reduce((s, r) => s + r.conversionTarget, 0),
    };
  });

  readonly slabDraft = signal<IncentiveSlab[]>(this.rules().slabs.map(s => ({ ...s })));
  readonly perConversion = signal(this.rules().perConversion);
  readonly conversionBonus = signal(this.rules().conversionBonus);

  setEmployeeTarget(employeeId: string, category: TreatmentCategory, value: string | number): void {
    this.store.setEmployeeTarget(employeeId, this.month(), category, Number(value));
  }

  setMonth(value: string): void {
    if (value) this.month.set(value);
  }

  setField(row: BranchPerformance, field: 'revenueTarget' | 'conversionTarget' | 'conversions', value: string | number): void {
    this.store.setTarget(row.branch, this.month(), { [field]: Number(value) });
  }

  async copyPrevious(): Promise<void> {
    const copied = this.store.copyFromPrevious(this.month());
    Swal.fire({ toast: true, position: 'top-end', icon: copied ? 'success' : 'info', title: copied ? `${copied} branch target(s) copied` : 'No earlier targets to copy', showConfirmButton: false, timer: 2500 });
  }

  addSlab(): void {
    this.slabDraft.update(list => [...list, { minPercent: 0, ratePercent: 0 }]);
  }

  removeSlab(index: number): void {
    this.slabDraft.update(list => list.filter((_, i) => i !== index));
  }

  patchSlab(index: number, field: keyof IncentiveSlab, value: string | number): void {
    this.slabDraft.update(list => list.map((s, i) => (i === index ? { ...s, [field]: Number(value) || 0 } : s)));
  }

  saveRules(): void {
    this.store.setSlabs(this.slabDraft());
    this.store.setTelecallerRules(this.perConversion(), this.conversionBonus());
    this.slabDraft.set(this.rules().slabs.map(s => ({ ...s })));
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Incentive rules saved', showConfirmButton: false, timer: 2500 });
  }

  statusClass(status: string): string {
    return { Exceeded: 'green', Achieved: 'green', 'On track': 'orange', Behind: 'red' }[status] ?? 'grey';
  }

  exportExcel(): void {
    if (this.view() === 'employees') {
      downloadExcel(`employee-targets-${this.month()}`, [{
        name: `Employees ${this.month()}`,
        columns: [
          { header: 'Employee', key: 'name' }, { header: 'Designation', key: 'designation' }, { header: 'Branch', key: 'branch' },
          ...TREATMENT_CATEGORIES.flatMap(c => [{ header: `${c} Target`, key: `${c}T` }, { header: `${c} Achieved`, key: `${c}A` }]),
          { header: 'Total Target', key: 'target' }, { header: 'Total Achieved', key: 'achieved' }, { header: 'Achievement %', key: 'percent' },
          { header: 'Slab Rate %', key: 'rate' }, { header: 'Incentive', key: 'incentive' }, { header: 'Status', key: 'status' },
        ],
        rows: this.employees().map(e => ({
          name: e.name, designation: e.designation, branch: e.branch,
          ...Object.fromEntries(TREATMENT_CATEGORIES.flatMap(c => [[`${c}T`, e.categories[c].target], [`${c}A`, e.categories[c].achieved]])),
          target: e.target, achieved: e.achieved, percent: Math.round(e.percent * 10) / 10, rate: e.slabRate, incentive: e.incentive, status: e.status,
        })),
      }]);
      return;
    }
    const t = this.totals();
    downloadExcel(`branch-targets-${this.month()}`, [{
      name: `Targets ${this.month()}`,
      columns: [
        { header: 'Branch', key: 'branch' }, { header: 'Revenue Target', key: 'target' }, { header: 'Achieved', key: 'achieved' },
        { header: 'Achievement %', key: 'percent' }, { header: 'Slab Rate %', key: 'rate' }, { header: 'Revenue Incentive', key: 'revInc' },
        { header: 'Conversion Target', key: 'convTarget' }, { header: 'Conversions', key: 'conv' }, { header: 'Telecaller Incentive', key: 'telInc' },
        { header: 'Total Incentive', key: 'total' }, { header: 'Status', key: 'status' },
      ],
      rows: this.rows().map(r => ({
        branch: r.branch, target: r.revenueTarget, achieved: r.achieved, percent: Math.round(r.percent * 10) / 10, rate: r.slabRate, revInc: r.revenueIncentive,
        convTarget: r.conversionTarget, conv: r.conversions, telInc: r.telecallerIncentive, total: r.totalIncentive, status: r.status,
      })),
      totals: { branch: 'TOTAL', target: t.target, achieved: t.achieved, percent: Math.round(t.percent * 10) / 10, revInc: t.revenueIncentive, convTarget: t.conversionTarget, conv: t.conversions, telInc: t.telecallerIncentive, total: t.incentive },
    }]);
  }
}
