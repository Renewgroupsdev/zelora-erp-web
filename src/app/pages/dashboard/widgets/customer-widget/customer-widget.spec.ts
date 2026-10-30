import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { CustomerWidget } from './customer-widget';

describe('CustomerWidget', () => {
  let component: CustomerWidget;
  let fixture: ComponentFixture<CustomerWidget>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomerWidget],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(CustomerWidget);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
