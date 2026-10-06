import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { BranchRecord } from '../models/branch-franchise.model';
import { addDays, isoDate, loadState, saveState, uid } from '../utils/format.util';
import { AccountsService } from './accounts.service';
import { HrService } from './hr.service';

const STORAGE_KEY = 'zelora_branches_store_v1';

interface BranchState {
  branches: BranchRecord[];
}

export interface BranchActivity {
  icon: string;
  tone: 'blue' | 'green' | 'red' | 'orange';
  title: string;
  detail: string;
  when: string;
}

/**
 * Front-end store for Branch Management (design stage - no API yet). Sales, customers and employees
 * are read live from Accounts and HR, so the branch screens always agree with those modules.
 */
@Injectable({ providedIn: 'root' })
export class BranchService {
  private readonly acc = inject(AccountsService);
  private readonly hr = inject(HrService);
  private readonly state = signal<BranchState>(loadState(STORAGE_KEY, seedState));

  readonly branches = computed(() => this.state().branches);

  constructor() {
    effect(() => saveState(STORAGE_KEY, this.state()));
  }

  branch(id: string): BranchRecord | undefined {
    return this.branches().find(b => b.id === id);
  }

  employees(name: string) {
    return this.hr.employees().filter(e => e.branch === name && e.status !== 'Exited');
  }

  customers(name: string): number {
    return new Set(this.acc.bills().filter(b => b.branch === name && b.kind === 'Service').map(b => b.customerName.toLowerCase())).size;
  }

  /** Cash + bank receipts (contra excluded) posted to the branch, optionally for one month (YYYY-MM) or one day. */
  sales(name: string, datePrefix?: string): number {
    const cash = new Set(this.acc.cashLedgers().map(l => l.id));
    return this.acc.vouchers()
      .filter(v => v.branch === name && v.type !== 'Contra' && (!datePrefix || v.date.startsWith(datePrefix)))
      .reduce((sum, v) => sum + v.entries.filter(e => cash.has(e.ledgerId)).reduce((s, e) => s + e.debit, 0), 0);
  }

  receivables(name: string): number {
    return this.acc.bills()
      .filter(b => b.branch === name && b.kind === 'Service' && (b.status === 'Unpaid' || b.status === 'Partially Paid'))
      .reduce((s, b) => s + b.items.reduce((x, i) => x + i.qty * i.rate * (1 - (i.discountPercent || 0) / 100) * (1 + (i.gstPercent || 0) / 100), 0) - b.paidAmount, 0);
  }

  /** Last `days` days of collections, oldest first. */
  dailySales(name: string, days = 7): { label: string; date: string; value: number }[] {
    const today = isoDate();
    return Array.from({ length: days }, (_, i) => {
      const date = addDays(today, i - (days - 1));
      return { label: new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), date, value: this.sales(name, date) };
    });
  }

  activities(name: string, limit = 6): BranchActivity[] {
    return this.acc.vouchers()
      .filter(v => v.branch === name)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(v => {
        const received = v.type === 'Receipt';
        const sale = v.type === 'Sales';
        return {
          icon: received ? 'bi-cash-coin' : sale ? 'bi-bag-check-fill' : 'bi-journal-text',
          tone: received ? 'green' : sale ? 'blue' : v.type === 'Payment' ? 'red' : 'orange',
          title: received ? 'Payment received' : sale ? 'Sale completed' : `${v.type} voucher`,
          detail: v.narration,
          when: new Date(v.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        } as BranchActivity;
      });
  }

  add(input: Omit<BranchRecord, 'id' | 'code'>): BranchRecord | string {
    if (this.branches().some(b => b.name.trim().toLowerCase() === input.name.trim().toLowerCase())) return 'A branch with this name already exists.';
    const max = this.branches().reduce((m, b) => Math.max(m, Number(b.code.replace(/\D/g, '')) || 0), 0);
    const record: BranchRecord = { ...input, name: input.name.trim(), id: uid('BR'), code: `BR${String(max + 1).padStart(2, '0')}` };
    this.mutate(s => s.branches.push(record));
    return record;
  }

  update(id: string, patch: Partial<BranchRecord>): string | null {
    if (patch.name && this.branches().some(b => b.id !== id && b.name.trim().toLowerCase() === patch.name!.trim().toLowerCase())) return 'A branch with this name already exists.';
    this.mutate(s => { s.branches = s.branches.map(b => (b.id === id ? { ...b, ...patch } : b)); });
    return null;
  }

  private mutate(fn: (draft: BranchState) => void): void {
    const draft = structuredClone(this.state());
    fn(draft);
    this.state.set(draft);
  }
}

function seedState(): BranchState {
  const base = { state: 'Tamil Nadu', headEmail: '', headPhone: '' };
  const rows: Omit<BranchRecord, 'id'>[] = [
    { ...base, code: 'BR01', name: 'Anna Nagar', city: 'Chennai', phone: '+91 98765 43210', email: 'annanagar@renew.com', address: 'No.12, Anna Nagar, Chennai - 600040', headName: 'Anitha Mohan', headPhone: '+91 98765 43210', headEmail: 'anitha@renew.com', status: 'Active', openedOn: '2019-04-10' },
    { ...base, code: 'BR02', name: 'Velachery', city: 'Chennai', phone: '+91 98765 43211', email: 'velachery@renew.com', address: '45, Velachery Main Road, Chennai - 600042', headName: 'Dr. Priya Sharma', headPhone: '+91 98765 43211', headEmail: 'priya@renew.com', status: 'Active', openedOn: '2020-08-01' },
    { ...base, code: 'BR03', name: 'T. Nagar', city: 'Chennai', phone: '+91 98765 43212', email: 'tnagar@renew.com', address: '8, Usman Road, T. Nagar, Chennai - 600017', headName: 'Meena Iyer', headPhone: '+91 98765 43212', headEmail: 'meena@renew.com', status: 'Active', openedOn: '2021-02-15' },
    { ...base, code: 'BR04', name: 'Adyar', city: 'Chennai', phone: '+91 98765 43213', email: 'adyar@renew.com', address: '21, LB Road, Adyar, Chennai - 600020', headName: 'Vignesh Kumar', headPhone: '+91 98765 43213', headEmail: 'vignesh@renew.com', status: 'Active', openedOn: '2022-06-20' },
    { ...base, code: 'BR05', name: 'Coimbatore', city: 'Coimbatore', phone: '+91 98765 43214', email: 'coimbatore@renew.com', address: '17, RS Puram, Coimbatore - 641002', headName: 'Arun K', headPhone: '+91 98765 43214', headEmail: 'arun@renew.com', status: 'Active', openedOn: '2023-01-09' },
    { ...base, code: 'BR06', name: 'Salem', city: 'Salem', phone: '+91 98765 43215', email: 'salem@renew.com', address: '3, Five Roads, Salem - 636004', headName: 'Prakash T', headPhone: '+91 98765 43215', headEmail: 'prakash@renew.com', status: 'Inactive', openedOn: '2023-09-04' },
  ];
  return { branches: rows.map(r => ({ ...r, id: `BR-seed-${r.code}` })) };
}
