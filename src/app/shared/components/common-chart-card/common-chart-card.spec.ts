import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { CommonChartCard } from './common-chart-card';

describe('CommonChartCard', () => {
  let component: CommonChartCard;
  let fixture: ComponentFixture<CommonChartCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonChartCard],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(CommonChartCard);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
