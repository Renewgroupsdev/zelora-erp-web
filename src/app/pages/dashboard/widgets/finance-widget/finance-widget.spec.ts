import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { FinanceWidget } from './finance-widget';

describe('FinanceWidget', () => {
  let component: FinanceWidget;
  let fixture: ComponentFixture<FinanceWidget>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FinanceWidget],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(FinanceWidget);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
