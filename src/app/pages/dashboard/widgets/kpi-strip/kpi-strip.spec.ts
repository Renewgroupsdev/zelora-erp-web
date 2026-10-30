import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { KpiStrip } from './kpi-strip';

describe('KpiStrip', () => {
  let component: KpiStrip;
  let fixture: ComponentFixture<KpiStrip>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KpiStrip],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(KpiStrip);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
