import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { PurchaseReturnForm } from './purchase-return-form';

describe('PurchaseReturnForm', () => {
  let component: PurchaseReturnForm;
  let fixture: ComponentFixture<PurchaseReturnForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PurchaseReturnForm],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: MAT_DIALOG_DATA, useValue: {} }, { provide: MatDialogRef, useValue: { close: () => undefined, afterClosed: () => ({ subscribe: () => undefined }) } }],
    }).compileComponents();

    fixture = TestBed.createComponent(PurchaseReturnForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
