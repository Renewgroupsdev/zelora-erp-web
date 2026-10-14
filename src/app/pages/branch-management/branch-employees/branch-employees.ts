import { CommonModule } from '@angular/common';
import { CanActionDirective } from '../../../shared/directives/can-action.directive';
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { map } from 'rxjs';
import { BranchService } from '../../../shared/common-services/branch.service';
import { ToastService } from '../../../shared/common-services/toast.service';
import { Employee } from '../../../shared/models/hr.model';
import { initials } from '../../../shared/utils/format.util';
import { EmployeeForm } from '../../hr-management/employees/employee-form/employee-form';
import { EmployeeProfile } from '../../hr-management/employees/employee-profile/employee-profile';

const TONES = ['blue', 'green', 'orange', 'purple', 'red'] as const;
const DESIGNATION_ICONS: Record<string, string> = {
  telecaller: 'bi-headset', 'sales executive': 'bi-graph-up-arrow', receptionist: 'bi-person-workspace', manager: 'bi-person-badge-fill',
};

/** Employees of one branch (from HR) with a designation summary. */
@Component({
  selector: 'app-branch-employees',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatDialogModule, CanActionDirective],
  templateUrl: './branch-employees.html',
  styleUrls: ['../../../shared/styles/erp-page.scss', '../../../shared/styles/branch-franchise.scss'],
})
export class BranchEmployees implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(MatDialog);
  protected readonly store = inject(BranchService);

  readonly id = toSignal(this.route.paramMap.pipe(map(p => p.get('id') ?? '')), { initialValue: '' });
  readonly branch = computed(() => this.store.branch(this.id()));
  readonly initials = initials;

  readonly search = signal('');
  readonly designation = signal('');
  readonly status = signal('');

  /** Employees of this branch from the API (HR records whose branch is this one, exited staff excluded). */
  readonly all = signal<Employee[]>([]);
  readonly loading = signal(true);

  constructor() {
    // The branch id comes from the route; reload the team whenever it changes.
    effect(() => {
      const id = this.id();
      if (id) this.loadEmployees(id);
    });
  }

  ngOnInit(): void {
    if (!this.branch() && this.id()) this.store.fetch(this.id()).subscribe({ error: () => undefined });
  }

  private loadEmployees(id: string): void {
    this.loading.set(true);
    this.store.employees(id).subscribe({
      next: res => { this.all.set(res.employees); this.loading.set(false); },
      error: (err: any) => { this.loading.set(false); this.toast.error(err?.error?.message || 'Failed to load employees. Please try again.'); },
    });
  }

  readonly designations = computed(() => [...new Set(this.all().map(e => e.designation))].sort());
  readonly rows = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.all().filter(e => (!this.designation() || e.designation === this.designation())
      && (!this.status() || e.status === this.status())
      && (!q || [e.name, e.empCode, e.email, e.phone, e.designation].join(' ').toLowerCase().includes(q)));
  });
  readonly summary = computed(() => this.designations().map((d, i) => ({
    designation: d,
    count: this.all().filter(e => e.designation === d).length,
    tone: TONES[i % TONES.length],
    icon: DESIGNATION_ICONS[d.toLowerCase()] ?? 'bi-person-fill',
  })));

  statusClass(status: string): string {
    return status.toLowerCase().replace(' ', '-');
  }

  view(empId: string): void {
    this.dialog.open(EmployeeProfile, { width: '920px', maxWidth: 'calc(100vw - 32px)', maxHeight: '92vh', autoFocus: false, data: { empId } });
  }

  edit(employee: Employee): void {
    this.dialog.open(EmployeeForm, { width: '900px', maxWidth: 'calc(100vw - 32px)', maxHeight: '92vh', autoFocus: false, disableClose: true, data: { employee } })
      .afterClosed().subscribe(() => this.loadEmployees(this.id()));
  }

  addEmployee(): void {
    this.dialog.open(EmployeeForm, { width: '900px', maxWidth: 'calc(100vw - 32px)', maxHeight: '92vh', autoFocus: false, disableClose: true, data: { employee: null, branch: this.branch()?.name } })
      .afterClosed().subscribe(() => this.loadEmployees(this.id()));
  }
}
