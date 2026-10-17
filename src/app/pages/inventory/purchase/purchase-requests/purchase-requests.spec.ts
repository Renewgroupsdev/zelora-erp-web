import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { PurchaseRequests } from './purchase-requests';

describe('PurchaseRequests', () => {
  let component: PurchaseRequests;
  let fixture: ComponentFixture<PurchaseRequests>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PurchaseRequests],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(PurchaseRequests);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
