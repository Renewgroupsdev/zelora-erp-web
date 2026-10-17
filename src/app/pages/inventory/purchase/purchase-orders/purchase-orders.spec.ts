import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { PurchaseOrders } from './purchase-orders';

describe('PurchaseOrders', () => {
  let component: PurchaseOrders;
  let fixture: ComponentFixture<PurchaseOrders>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PurchaseOrders],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(PurchaseOrders);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
