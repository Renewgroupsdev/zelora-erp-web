import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { PurchaseReturns } from './purchase-returns';

describe('PurchaseReturns', () => {
  let component: PurchaseReturns;
  let fixture: ComponentFixture<PurchaseReturns>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PurchaseReturns],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(PurchaseReturns);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
