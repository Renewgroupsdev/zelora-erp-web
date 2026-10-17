import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { LeadStatusReport } from './lead-status-report';

describe('LeadStatusReport', () => {
  let component: LeadStatusReport;
  let fixture: ComponentFixture<LeadStatusReport>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeadStatusReport],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(LeadStatusReport);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
