import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { PurchaseTabs } from './purchase-tabs';

describe('PurchaseTabs', () => {
  let component: PurchaseTabs;
  let fixture: ComponentFixture<PurchaseTabs>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PurchaseTabs],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(PurchaseTabs);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
