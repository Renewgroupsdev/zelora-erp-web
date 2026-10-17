import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { ManpowerForm } from './manpower-form';

describe('ManpowerForm', () => {
  let component: ManpowerForm;
  let fixture: ComponentFixture<ManpowerForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManpowerForm],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: MAT_DIALOG_DATA, useValue: {} }, { provide: MatDialogRef, useValue: { close: () => undefined, afterClosed: () => ({ subscribe: () => undefined }) } }],
    }).compileComponents();

    fixture = TestBed.createComponent(ManpowerForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
