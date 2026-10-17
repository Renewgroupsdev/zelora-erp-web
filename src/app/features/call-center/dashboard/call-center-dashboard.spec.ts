import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { CallCenterDashboard } from './call-center-dashboard';

describe('CallCenterDashboard', () => {
  let component: CallCenterDashboard;
  let fixture: ComponentFixture<CallCenterDashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CallCenterDashboard],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(CallCenterDashboard);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
