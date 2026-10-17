import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { CallCenter } from './call-center';

describe('CallCenter', () => {
  let component: CallCenter;
  let fixture: ComponentFixture<CallCenter>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CallCenter],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(CallCenter);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
