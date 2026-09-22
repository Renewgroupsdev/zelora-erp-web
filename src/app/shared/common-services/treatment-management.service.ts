import { Injectable, signal } from '@angular/core';
import {
  ComboTreatmentItem,
  DiscountType,
  Treatment,
  TreatmentCategory,
  TreatmentMaterial,
  TREATMENTS,
} from '../data/treatment-catalog';

export interface TreatmentDraft {
  key: string;
  name: string;
  category: TreatmentCategory;
  price: number;
  description: string;
  discount: number;
  discountType: DiscountType;
  gstRate: number;
  maxSessions: number;
  isCombo: boolean;
  treatmentKeys: string[];
  comboItems: ComboTreatmentItem[];
  materials: TreatmentMaterial[];
}

@Injectable({ providedIn: 'root' })
export class TreatmentManagementService {
  private readonly storageKey = 'renew-plus-treatment-master';
  readonly treatments = signal<TreatmentDraft[]>(this.load());

  addTreatment(treatment: TreatmentDraft): void {
    const next = [...this.treatments(), treatment];
    this.treatments.set(next);
    localStorage.setItem(this.storageKey, JSON.stringify(next));
  }

  getTreatment(key: string): TreatmentDraft | undefined {
    return this.treatments().find(item => item.key === key);
  }

  updateTreatment(key: string, treatment: TreatmentDraft): void {
    const next = this.treatments().map(item => item.key === key ? treatment : item);
    this.treatments.set(next);
    localStorage.setItem(this.storageKey, JSON.stringify(next));
  }

  removeTreatment(key: string): void {
    const next = this.treatments().filter(item => item.key !== key);
    this.treatments.set(next);
    localStorage.setItem(this.storageKey, JSON.stringify(next));
  }

  private load(): TreatmentDraft[] {
    
    const saved = localStorage.getItem(this.storageKey);
    if (saved) return JSON.parse(saved);
   

    return TREATMENTS.map(t => ({
      key: t.key,
      name: t.name,
      category: t.category,
      price: t.price,
      description: t.description ?? '',
      discount: t.discount ?? 0,
      discountType: t.discountType ?? 'percentage',
      gstRate: t.gstRate ?? 18,
      maxSessions: t.maxSessions ?? 1,
      isCombo: t.isCombo ?? false,
      treatmentKeys: t.treatmentKeys ?? [],
      comboItems: t.comboItems ?? [],
      materials: t.materials ?? [],
    }));
  }
}
