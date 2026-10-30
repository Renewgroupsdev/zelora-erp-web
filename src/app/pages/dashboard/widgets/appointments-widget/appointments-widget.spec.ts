import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { AppointmentsWidget } from './appointments-widget';

describe('AppointmentsWidget', () => {
  let component: AppointmentsWidget;
  let fixture: ComponentFixture<AppointmentsWidget>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppointmentsWidget],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(AppointmentsWidget);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
