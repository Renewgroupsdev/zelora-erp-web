import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { Vouchers } from './vouchers';

describe('Vouchers', () => {
  let component: Vouchers;
  let fixture: ComponentFixture<Vouchers>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Vouchers],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Vouchers);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
