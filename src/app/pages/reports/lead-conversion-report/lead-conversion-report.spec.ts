import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { LeadConversionReport } from './lead-conversion-report';

describe('LeadConversionReport', () => {
  let component: LeadConversionReport;
  let fixture: ComponentFixture<LeadConversionReport>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeadConversionReport],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(LeadConversionReport);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
