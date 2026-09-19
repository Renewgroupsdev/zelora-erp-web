import { PaymentStatus } from '../../shared/data/treatment-catalog';

export type CustomerStatus = 'Active' | 'Inactive';
export type CustomerSegment = 'Regular' | 'New';

export interface CustomerVisit {
  date: string;
  service: string;
  branch: string;
  /** Final billed amount for this visit, after any discount. */
  amount: number;
  discount: number;
  amountPaid: number;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  gender: string;
  branch: string;
  segment: CustomerSegment;
  status: CustomerStatus;
  memberSince: string;
  totalVisits: number;
  lastVisit: string;
  lifetimeValue: number;
  preferredService: string;
  visitHistory: CustomerVisit[];
}
