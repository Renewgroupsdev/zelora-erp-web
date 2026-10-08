import { inrShort } from '../../models/branch-franchise.model';

/** Colour ramp shared by every chart on the Branch / Franchise detail pages (follows the theme tokens). */
export const BF_PALETTE = [
  'var(--status-blue-text)', 'var(--status-green-text)', 'var(--status-orange-text)', 'var(--status-purple-text)',
  'var(--status-red-text)', '#0891b2', '#db2777', '#65a30d',
];

export interface BfDatum { label: string; value: number; }
export interface BfBarDatum extends BfDatum { /** Optional second figure drawn as a darker inner bar (e.g. converted of total). */ secondary?: number; }
export interface BfColumnDatum { label: string; a: number; b?: number; }

export function fmt(value: number, money: boolean): string {
  return money ? inrShort(value) : Math.round(value).toLocaleString('en-IN');
}
