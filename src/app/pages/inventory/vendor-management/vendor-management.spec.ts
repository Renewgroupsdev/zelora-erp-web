import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { VendorManagement } from './vendor-management';

describe('VendorManagement', () => {
  let component: VendorManagement;
  let fixture: ComponentFixture<VendorManagement>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VendorManagement],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(VendorManagement);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
