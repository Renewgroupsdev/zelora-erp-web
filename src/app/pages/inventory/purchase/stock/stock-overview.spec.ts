import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { StockOverview } from './stock-overview';

describe('StockOverview', () => {
  let component: StockOverview;
  let fixture: ComponentFixture<StockOverview>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StockOverview],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(StockOverview);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
