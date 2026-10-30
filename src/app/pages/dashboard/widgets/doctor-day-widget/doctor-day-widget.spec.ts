import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { DoctorDayWidget } from './doctor-day-widget';

describe('DoctorDayWidget', () => {
  let component: DoctorDayWidget;
  let fixture: ComponentFixture<DoctorDayWidget>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DoctorDayWidget],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(DoctorDayWidget);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
