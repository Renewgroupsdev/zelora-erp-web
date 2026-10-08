/**
 * Hardcoded sample records for the Branch Details tabs (design stage - no API yet).
 * A tab uses these only while the live store has nothing for that branch, so real data always wins.
 * Output is deterministic per branch name, so a branch shows the same figures on every visit.
 */
import { addDays, isoDate } from '../utils/format.util';
import { lastMonths } from './branch-franchise.model';

export interface DemoLead { id: string; name: string; phone: string; treatment: string; source: string; telecaller: string; followUp: string; status: 'Follow-Up' | 'Appointment' | 'Valid' | 'Invalid'; }
export interface DemoAppointment { id: string; customer: string; treatment: string; date: string; time: string; staff: string; amount: number; payment: 'Paid' | 'Partial' | 'Pending'; }
export interface DemoCustomer { name: string; phone: string; bills: number; billed: number; last: string; treatment: string; }
export interface DemoStock { name: string; code: string; batches: number; qty: number; unitPrice: number; expiring: number; }
export interface DemoExpense { date: string; category: string; vendor: string; mode: string; amount: number; status: 'Paid' | 'Pending'; }
export interface DemoReview { customer: string; treatment: string; rating: number; comment: string; date: string; replied: boolean; }
export interface DemoDocument { name: string; number: string; issuedOn: string; expiresOn: string; status: 'Valid' | 'Expiring' | 'Expired'; }
export interface DemoAttendance { name: string; designation: string; checkIn: string; checkOut: string; status: 'Present' | 'Late' | 'On Leave' | 'Absent'; }
export interface DemoTreatment { name: string; category: 'Hair' | 'Skin' | 'Slimming' | 'Combo'; price: number; sessions: number; revenue: number; rating: number; }
export interface DemoPeriod { key: string; label: string; sales: number; bills: number; appointments: number; }

export interface BranchDemo {
  leads: DemoLead[];
  appointments: DemoAppointment[];
  customers: DemoCustomer[];
  treatments: DemoTreatment[];
  products: { name: string; amount: number }[];
  stock: DemoStock[];
  monthly: { key: string; label: string; sales: number; target: number }[];
  periods: Record<'day' | 'month' | 'year', DemoPeriod[]>;
  expenses: DemoExpense[];
  expenseMonthly: { label: string; amount: number }[];
  reviews: DemoReview[];
  documents: DemoDocument[];
  attendance: DemoAttendance[];
}

const CATALOG: Omit<DemoTreatment, 'sessions' | 'revenue' | 'rating'>[] = [
  { name: 'Hair PRP Session', category: 'Hair', price: 4500 },
  { name: 'Hair Transplant - FUE', category: 'Hair', price: 85000 },
  { name: 'Anti-Hair-Fall Package', category: 'Hair', price: 18000 },
  { name: 'HydraFacial', category: 'Skin', price: 3500 },
  { name: 'Chemical Peel', category: 'Skin', price: 2800 },
  { name: 'Acne Scar Laser', category: 'Skin', price: 6000 },
  { name: 'Body Contouring', category: 'Slimming', price: 12000 },
  { name: 'Weight Loss Programme', category: 'Slimming', price: 15000 },
  { name: 'Skin + Hair Combo', category: 'Combo', price: 20000 },
];
const PRODUCTS: [string, string, number][] = [
  ['Minoxidil 5% Solution', 'PRD-101', 850], ['Anti-Dandruff Shampoo', 'PRD-102', 480], ['Vitamin C Serum', 'PRD-103', 1200],
  ['Sunscreen SPF 50', 'PRD-104', 650], ['PRP Kit', 'PRD-105', 2200], ['Biotin Tablets', 'PRD-106', 540], ['Collagen Peptide Sachets', 'PRD-107', 1600],
];
const FIRST = ['Karthika', 'Rahul', 'Divya', 'Suresh', 'Meera', 'Arjun', 'Lakshmi', 'Vikram', 'Nisha', 'Gokul', 'Priya', 'Manoj', 'Sneha', 'Harish', 'Kavya', 'Dinesh', 'Anu', 'Bala', 'Revathi', 'Sathish'];
const LAST = ['Suresh', 'Kumar', 'Nair', 'Iyer', 'Raman', 'Pillai', 'Menon', 'Das', 'Rao', 'Krishnan'];
const SOURCES = ['Facebook', 'Instagram', 'Google Ads', 'Walk-in', 'Referral', 'Website'];
const CALLERS = ['Nithya Joseph', 'Vimal P', 'Aritha K', 'Deepa S'];
const STAFF = ['Dr. Priya Sharma', 'Karthik Raman', 'Sneha Krishnan', 'Lakshmi Pillai'];
const VENDORS: [string, string][] = [
  ['Rent', 'Lakeview Properties'], ['Salaries', 'Payroll'], ['Electricity', 'TANGEDCO'], ['Marketing', 'Meta Ads'],
  ['Consumables', 'MedSupply Co'], ['Maintenance', 'CoolCare Services'], ['Housekeeping', 'CleanPro'],
];
const COMMENTS: [number, string][] = [
  [5, 'Excellent service and very friendly staff.'], [5, 'Saw visible results in just three sessions.'], [4, 'Clean clinic, but the waiting time was a little long.'],
  [5, 'Doctor explained the whole procedure clearly.'], [3, 'Treatment was good, billing took too long.'], [4, 'Good value for the package.'], [2, 'Appointment was rescheduled twice.'],
];

function hash(text: string): number {
  let h = 2166136261;
  for (const c of text) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const phone = (r: () => number) => `9${String(Math.floor(r() * 1e9)).padStart(9, '0')}`;
const round100 = (n: number) => Math.round(n / 100) * 100;

export function branchDemo(branch: string, staffNames: { name: string; designation: string }[] = []): BranchDemo {
  const r = rng(hash(branch));
  const pick = <T>(list: T[]) => list[Math.floor(r() * list.length)];
  const scale = 0.8 + r() * 0.7;
  const today = isoDate();
  const person = () => `${pick(FIRST)} ${pick(LAST)}`;

  // Treatments with this branch's sessions and revenue
  const treatments: DemoTreatment[] = CATALOG.map(t => {
    const sessions = Math.max(2, Math.round((t.price > 30000 ? 3 : t.price > 10000 ? 9 : 24) * scale * (0.6 + r() * 0.9)));
    return { ...t, sessions, revenue: sessions * t.price, rating: Math.round((4 + r()) * 10) / 10 };
  });
  const treatmentNames = treatments.map(t => t.name);

  const leads: DemoLead[] = Array.from({ length: 26 }, (_, i) => {
    const x = r();
    return {
      id: `DL-${i + 1}`, name: person(), phone: phone(r), treatment: pick(treatmentNames), source: pick(SOURCES), telecaller: pick(CALLERS),
      followUp: addDays(today, Math.floor(r() * 10) - 3),
      status: x < 0.38 ? 'Appointment' : x < 0.7 ? 'Follow-Up' : x < 0.9 ? 'Valid' : 'Invalid',
    };
  });

  const payments: DemoAppointment['payment'][] = ['Paid', 'Paid', 'Partial', 'Pending'];
  const appointments: DemoAppointment[] = Array.from({ length: 18 }, (_, i) => {
    const t = pick(treatments);
    const hour = 9 + Math.floor(r() * 9);
    return {
      id: `DA-${i + 1}`, customer: person(), treatment: t.name, date: addDays(today, Math.floor(r() * 14) - 7),
      time: `${String(hour).padStart(2, '0')}:${r() < 0.5 ? '00' : '30'}`, staff: pick(STAFF), amount: t.price, payment: pick(payments),
    };
  }).sort((a, b) => a.date.localeCompare(b.date));

  const customers: DemoCustomer[] = Array.from({ length: 16 }, () => {
    const t = pick(treatments);
    const bills = 1 + Math.floor(r() * 4);
    return { name: person(), phone: phone(r), bills, billed: round100(t.price * bills * (0.85 + r() * 0.3)), last: addDays(today, -Math.floor(r() * 60)), treatment: t.name };
  }).sort((a, b) => b.last.localeCompare(a.last));

  const stock: DemoStock[] = PRODUCTS.map(([name, code, unitPrice]) => ({
    name, code, unitPrice, batches: 1 + Math.floor(r() * 3), qty: Math.round((15 + r() * 90) * scale), expiring: r() < 0.25 ? 1 : 0,
  }));
  const products = PRODUCTS.map(([name, , price]) => ({ name, amount: round100(price * (10 + r() * 60) * scale) }));

  const months = lastMonths(7);
  const monthly = months.map((m, i) => {
    const target = round100(450000 * scale);
    const sales = round100(target * (0.55 + r() * 0.6 + i * 0.02));
    // The current month is held at 65% of target so the target-achievement bar reads 65%.
    return { ...m, target, sales: i === months.length - 1 ? round100(target * 0.65) : sales };
  });

  const monthKeys = lastMonths(12);
  const periods: BranchDemo['periods'] = {
    day: Array.from({ length: 14 }, (_, i) => {
      const key = addDays(today, i - 13);
      return { key, label: new Date(`${key}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), sales: round100((8000 + r() * 30000) * scale), bills: 2 + Math.floor(r() * 9), appointments: 3 + Math.floor(r() * 10) };
    }),
    month: monthKeys.map(m => ({ ...m, sales: round100((260000 + r() * 320000) * scale), bills: 40 + Math.floor(r() * 90), appointments: 60 + Math.floor(r() * 120) })),
    year: Array.from({ length: 5 }, (_, i) => {
      const y = String(new Date().getFullYear() - 4 + i);
      return { key: y, label: y, sales: round100((2400000 + i * 650000 + r() * 500000) * scale), bills: 520 + i * 90 + Math.floor(r() * 80), appointments: 700 + i * 110 + Math.floor(r() * 90) };
    }),
  };

  const expenses: DemoExpense[] = Array.from({ length: 14 }, () => {
    const [category, vendor] = pick(VENDORS);
    const base = category === 'Salaries' ? 180000 : category === 'Rent' ? 65000 : category === 'Marketing' ? 40000 : 12000;
    return { date: addDays(today, -Math.floor(r() * 45)), category, vendor, mode: pick(['Bank', 'Cash', 'UPI']), amount: round100(base * scale * (0.8 + r() * 0.4)), status: (r() < 0.8 ? 'Paid' : 'Pending') as DemoExpense['status'] };
  }).sort((a, b) => b.date.localeCompare(a.date));
  const expenseMonthly = months.map(m => ({ label: m.label, amount: round100((300000 + r() * 150000) * scale) }));

  const reviews: DemoReview[] = Array.from({ length: 10 }, () => {
    const [rating, comment] = pick(COMMENTS);
    return { customer: person(), treatment: pick(treatmentNames), rating, comment, date: addDays(today, -Math.floor(r() * 40)), replied: r() < 0.6 };
  }).sort((a, b) => b.date.localeCompare(a.date));

  const doc = (name: string, number: string, issuedAgo: number, validDays: number): DemoDocument => {
    const expiresOn = addDays(today, validDays);
    return { name, number, issuedOn: addDays(today, -issuedAgo), expiresOn, status: validDays < 0 ? 'Expired' : validDays <= 60 ? 'Expiring' : 'Valid' };
  };
  const documents = [
    doc('Clinical Establishment Licence', `CEL/${1000 + Math.floor(r() * 8999)}`, 700, 380),
    doc('Trade Licence', `TL-${1000 + Math.floor(r() * 8999)}`, 300, 45),
    doc('Fire Safety Certificate', `FS-${1000 + Math.floor(r() * 8999)}`, 500, 220),
    doc('Biomedical Waste Authorisation', `BMW-${100 + Math.floor(r() * 899)}`, 400, 25),
    doc('Rental Agreement', `RA-${100 + Math.floor(r() * 899)}`, 900, 560),
    doc('GST Registration', `33AABCR${Math.floor(r() * 9999)}K1Z5`, 1500, 4000),
    doc('Pollution Control Consent', `PCB-${100 + Math.floor(r() * 899)}`, 800, -12),
  ];

  const roster = staffNames.length ? staffNames : STAFF.map((name, i) => ({ name, designation: ['Dermatologist', 'Hair Transplant Technician', 'Skin Therapist', 'Receptionist'][i] }));
  const attendance: DemoAttendance[] = roster.map(s => {
    const x = r();
    const status: DemoAttendance['status'] = x < 0.7 ? 'Present' : x < 0.82 ? 'Late' : x < 0.93 ? 'On Leave' : 'Absent';
    const absent = status === 'On Leave' || status === 'Absent';
    return { name: s.name, designation: s.designation, status, checkIn: absent ? '-' : status === 'Late' ? '10:12' : '09:0' + Math.floor(r() * 9), checkOut: absent ? '-' : '18:' + String(Math.floor(r() * 50)).padStart(2, '0') };
  });

  return { leads, appointments, customers, treatments, products, stock, monthly, periods, expenses, expenseMonthly, reviews, documents, attendance };
}
