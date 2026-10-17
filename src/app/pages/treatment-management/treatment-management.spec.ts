import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { TreatmentManagement } from './treatment-management';

describe('TreatmentManagement', () => {
  let component: TreatmentManagement;
  let fixture: ComponentFixture<TreatmentManagement>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TreatmentManagement],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(TreatmentManagement);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
