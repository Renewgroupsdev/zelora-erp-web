import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { CommonTrendChart } from './common-trend-chart';

describe('CommonTrendChart', () => {
  let component: CommonTrendChart;
  let fixture: ComponentFixture<CommonTrendChart>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonTrendChart],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(CommonTrendChart);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
