import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { StockWidget } from './stock-widget';

describe('StockWidget', () => {
  let component: StockWidget;
  let fixture: ComponentFixture<StockWidget>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StockWidget],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(StockWidget);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
