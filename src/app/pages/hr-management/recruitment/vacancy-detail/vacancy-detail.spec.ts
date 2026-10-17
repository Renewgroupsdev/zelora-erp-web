import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { VacancyDetail } from './vacancy-detail';

describe('VacancyDetail', () => {
  let component: VacancyDetail;
  let fixture: ComponentFixture<VacancyDetail>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VacancyDetail],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: MAT_DIALOG_DATA, useValue: {} }, { provide: MatDialogRef, useValue: { close: () => undefined, afterClosed: () => ({ subscribe: () => undefined }) } }],
    }).compileComponents();

    fixture = TestBed.createComponent(VacancyDetail);
    component = fixture.componentInstance;
    // Rendered by its opener with real data (dialog data / inputs), so only creation is checked here.
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
