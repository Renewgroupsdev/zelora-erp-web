import { Injectable, computed, effect, signal } from '@angular/core';
import { FranchiseInvoice, FranchiseInvoiceItem, FranchiseRecord, ShareSplit, invoiceTotal, splitShare } from '../models/branch-franchise.model';
import { isoDate, loadState, saveState, uid } from '../utils/format.util';

const STORAGE_KEY = 'zelora_franchise_store_v1';

interface FranchiseState {
  franchises: FranchiseRecord[];
  invoices: FranchiseInvoice[];
}

export interface FranchiseTotals extends ShareSplit {
  invoices: number;
  paid: number;
}

/**
 * Front-end store for Franchise Management (design stage - no API yet). Every invoice is split between
 * the franchise partner and Renew using the franchise's share percentage (default 70 / 30).
 */
@Injectable({ providedIn: 'root' })
export class FranchiseService {
  private readonly state = signal<FranchiseState>(loadState(STORAGE_KEY, seedState));

  readonly franchises = computed(() => this.state().franchises);
  readonly invoices = computed(() => this.state().invoices);

  constructor() {
    effect(() => saveState(STORAGE_KEY, this.state()));
  }

  franchise(id: string): FranchiseRecord | undefined {
    return this.franchises().find(f => f.id === id);
  }

  invoicesOf(franchiseId: string): FranchiseInvoice[] {
    return this.invoices().filter(i => i.franchiseId === franchiseId).sort((a, b) => b.date.localeCompare(a.date) || b.invoiceNo.localeCompare(a.invoiceNo));
  }

  invoice(franchiseId: string, invoiceNo: string): FranchiseInvoice | undefined {
    return this.invoices().find(i => i.franchiseId === franchiseId && i.invoiceNo === invoiceNo);
  }

  totalsFor(franchiseId: string): FranchiseTotals {
    const f = this.franchise(franchiseId);
    const list = this.invoicesOf(franchiseId);
    const total = list.reduce((s, i) => s + invoiceTotal(i.items), 0);
    const split = splitShare(total, f?.sharePercent ?? 70);
    return { ...split, invoices: list.length, paid: list.filter(i => i.status === 'Paid').length };
  }

  /** Company-wide totals for the list dashboard. */
  readonly overall = computed(() => {
    let total = 0;
    let renew = 0;
    for (const f of this.franchises()) {
      const t = this.totalsFor(f.id);
      total += t.total;
      renew += t.renew;
    }
    return { total, renew, renewPercent: total ? Math.round((renew / total) * 100) : 0 };
  });

  /** Sales per month (last `months`, oldest first) for one franchise. */
  monthlySales(franchiseId: string, months = 7): { label: string; value: number }[] {
    const now = new Date();
    return Array.from({ length: months }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const value = this.invoicesOf(franchiseId).filter(inv => inv.date.startsWith(key)).reduce((s, inv) => s + invoiceTotal(inv.items), 0);
      return { label: d.toLocaleDateString('en-IN', { month: 'short' }), value };
    });
  }

  add(input: Omit<FranchiseRecord, 'id' | 'code'>): FranchiseRecord | string {
    if (this.franchises().some(f => f.name.trim().toLowerCase() === input.name.trim().toLowerCase() && f.ownerCompany.trim().toLowerCase() === input.ownerCompany.trim().toLowerCase())) {
      return 'This franchise already exists for the same owner.';
    }
    const max = this.franchises().reduce((m, f) => Math.max(m, Number(f.code.replace(/\D/g, '')) || 0), 0);
    const record: FranchiseRecord = { ...input, name: input.name.trim(), id: uid('FR'), code: `FR${String(max + 1).padStart(2, '0')}` };
    this.mutate(s => s.franchises.push(record));
    return record;
  }

  update(id: string, patch: Partial<FranchiseRecord>): void {
    this.mutate(s => { s.franchises = s.franchises.map(f => (f.id === id ? { ...f, ...patch } : f)); });
  }

  addInvoice(franchiseId: string, input: { customer: string; items: FranchiseInvoiceItem[]; notes: string; status: 'Paid' | 'Unpaid' }): FranchiseInvoice {
    const year = new Date().getFullYear();
    const max = this.invoices().filter(i => i.invoiceNo.startsWith(`INV-${year}-`)).reduce((m, i) => Math.max(m, Number(i.invoiceNo.split('-')[2]) || 0), 0);
    const invoice: FranchiseInvoice = { ...input, id: uid('FINV'), franchiseId, date: isoDate(), invoiceNo: `INV-${year}-${String(max + 1).padStart(5, '0')}` };
    this.mutate(s => s.invoices.push(invoice));
    return invoice;
  }

  private mutate(fn: (draft: FranchiseState) => void): void {
    const draft = structuredClone(this.state());
    fn(draft);
    this.state.set(draft);
  }
}

const CATALOG: [string, number][] = [['Hair Serum', 1000], ['Shampoo', 500], ['Hair Oil', 800], ['Hair Treatment', 2000], ['Scalp Care Kit', 1500], ['Anti-Dandruff Lotion', 650]];

function seedState(): FranchiseState {
  const today = isoDate();
  const rows: Omit<FranchiseRecord, 'id'>[] = [
    { code: 'FR01', name: 'Karaikudi', ownerCompany: 'ABC Traders', ownerName: 'Suresh Babu', ownerPhone: '+91 98765 43301', ownerEmail: 'suresh@abctraders.in', city: 'Karaikudi', state: 'Tamil Nadu', gstin: '33ABCDE1234F1Z5', status: 'Active', agreementFrom: '2025-01-01', agreementTo: '2027-12-31', sharePercent: 70, shareEffectiveFrom: '2025-01-01', employees: 6 },
    { code: 'FR02', name: 'Madurai', ownerCompany: 'XYZ Enterprises', ownerName: 'Raj Kumar', ownerPhone: '+91 98765 43211', ownerEmail: 'raj@xyz.com', city: 'Madurai', state: 'Tamil Nadu', gstin: '33ABCDE1234F1Z5', status: 'Active', agreementFrom: '2026-01-01', agreementTo: '2027-12-31', sharePercent: 70, shareEffectiveFrom: '2026-01-01', employees: 8 },
    { code: 'FR03', name: 'Trichy', ownerCompany: 'PQR Solutions', ownerName: 'Karthik S', ownerPhone: '+91 98765 43303', ownerEmail: 'karthik@pqr.in', city: 'Trichy', state: 'Tamil Nadu', gstin: '33PQRSX5678K1Z2', status: 'Active', agreementFrom: '2025-06-01', agreementTo: '2028-05-31', sharePercent: 70, shareEffectiveFrom: '2025-06-01', employees: 5 },
    { code: 'FR04', name: 'Coimbatore', ownerCompany: 'LMN Retail', ownerName: 'Divya R', ownerPhone: '+91 98765 43304', ownerEmail: 'divya@lmn.in', city: 'Coimbatore', state: 'Tamil Nadu', gstin: '33LMNRT9012L1Z8', status: 'Active', agreementFrom: '2025-09-01', agreementTo: '2028-08-31', sharePercent: 65, shareEffectiveFrom: '2025-09-01', employees: 7 },
    { code: 'FR05', name: 'Bangalore', ownerCompany: 'JKL Beauty', ownerName: 'Anil Kumar', ownerPhone: '+91 98765 43305', ownerEmail: 'anil@jkl.in', city: 'Bangalore', state: 'Karnataka', gstin: '29JKLBE3456M1Z4', status: 'Pending', agreementFrom: '2026-10-01', agreementTo: '2029-09-30', sharePercent: 70, shareEffectiveFrom: '2026-10-01', employees: 0 },
  ];
  const franchises = rows.map(r => ({ ...r, id: `FR-seed-${r.code}` }));

  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const invoices: FranchiseInvoice[] = [];
  const customers = ['Priya S', 'Rahul M', 'Aritha K', 'Deepa R', 'Vimal P', 'Anand V'];
  let counter = 100;
  for (const f of franchises) {
    if (f.status === 'Pending') continue;
    const count = 6 + Math.floor(rand() * 4);
    for (let i = 0; i < count; i++) {
      const lines = 1 + Math.floor(rand() * 3);
      const items = Array.from({ length: lines }, () => {
        const [name, unitPrice] = CATALOG[Math.floor(rand() * CATALOG.length)];
        return { name, qty: 1 + Math.floor(rand() * 3), unitPrice };
      });
      const monthsAgo = Math.floor(rand() * 6);
      const d = new Date();
      d.setMonth(d.getMonth() - monthsAgo);
      d.setDate(1 + Math.floor(rand() * 25));
      const date = isoDate(d) > today ? today : isoDate(d);
      invoices.push({ id: `FINV-seed-${counter}`, invoiceNo: `INV-${date.slice(0, 4)}-${String(++counter).padStart(5, '0')}`, franchiseId: f.id, date, customer: customers[Math.floor(rand() * customers.length)], status: rand() > 0.15 ? 'Paid' : 'Unpaid', items, notes: '' });
    }
  }
  // The invoice used in the design: Madurai, 5,300 split 3,710 / 1,590.
  invoices.push({
    id: 'FINV-seed-125', invoiceNo: 'INV-2026-00125', franchiseId: 'FR-seed-FR02', date: '2026-10-05', customer: 'Priya S', status: 'Paid', notes: '',
    items: [{ name: 'Hair Serum', qty: 2, unitPrice: 1000 }, { name: 'Shampoo', qty: 1, unitPrice: 500 }, { name: 'Hair Oil', qty: 1, unitPrice: 800 }, { name: 'Hair Treatment', qty: 1, unitPrice: 2000 }],
  });
  return { franchises, invoices };
}
