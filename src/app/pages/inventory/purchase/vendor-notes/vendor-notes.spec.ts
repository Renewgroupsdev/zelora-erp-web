import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { VendorNotes } from './vendor-notes';

describe('VendorNotes', () => {
  let component: VendorNotes;
  let fixture: ComponentFixture<VendorNotes>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VendorNotes],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(VendorNotes);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
