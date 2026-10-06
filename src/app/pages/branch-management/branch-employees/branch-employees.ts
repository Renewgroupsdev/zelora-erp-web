import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { map } from 'rxjs';
import { BranchService } from '../../../shared/common-services/branch.service';
import { initials } from '../../../shared/utils/format.util';
import { EmployeeForm } from '../../hr-management/employees/employee-form/employee-form';
import { EmployeeProfile } from '../../hr-management/employees/employee-profile/employee-profile';

/** Employees of one branch (from HR) with a designation summary. */
@Component({
  selector: 'app-branch-employees',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatDialogModule],
  templateUrl: './branch-employees.html',
  styleUrls: ['../../../shared/styles/erp-page.scss', '../../../shared/styles/branch-franchise.scss'],
})
export class BranchEmployees {
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  protected readonly store = inject(BranchService);

  readonly id = toSignal(this.route.paramMap.pipe(map(p => p.get('id') ?? '')), { initialValue: '' });
  readonly branch = computed(() => this.store.branch(this.id()));
  readonly initials = initials;

  readonly search = signal('');
  readonly designation = signal('');
  readonly status = signal('');

  readonly all = computed(() => this.branch() ? this.store.employees(this.branch()!.name) : []);
  readonly designations = computed(() => [...new Set(this.all().map(e => e.designation))].sort());
  readonly rows = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.all().filter(e => (!this.designation() || e.designation === this.designation())
      && (!this.status() || e.status === this.status())
      && (!q || [e.name, e.empCode, e.email, e.phone, e.designation].join(' ').toLowerCase().includes(q)));
  });
  readonly summary = computed(() => this.designations().map(d => ({ designation: d, count: this.all().filter(e => e.designation === d).length })));

  view(empId: string): void {
    this.dialog.open(EmployeeProfile, { width: '920px', maxWidth: 'calc(100vw - 32px)', maxHeight: '92vh', autoFocus: false, data: { empId } });
  }

  addEmployee(): void {
    this.dialog.open(EmployeeForm, { width: '900px', maxWidth: 'calc(100vw - 32px)', maxHeight: '92vh', autoFocus: false, disableClose: true, data: { employee: null } });
  }
}
