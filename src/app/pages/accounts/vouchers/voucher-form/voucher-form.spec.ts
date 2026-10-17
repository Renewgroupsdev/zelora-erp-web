import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { VoucherForm } from './voucher-form';

describe('VoucherForm', () => {
  let component: VoucherForm;
  let fixture: ComponentFixture<VoucherForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VoucherForm],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: MAT_DIALOG_DATA, useValue: {} }, { provide: MatDialogRef, useValue: { close: () => undefined, afterClosed: () => ({ subscribe: () => undefined }) } }],
    }).compileComponents();

    fixture = TestBed.createComponent(VoucherForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
