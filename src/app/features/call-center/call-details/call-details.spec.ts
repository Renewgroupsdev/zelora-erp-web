import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { CallDetails } from './call-details';

describe('CallDetails', () => {
  let component: CallDetails;
  let fixture: ComponentFixture<CallDetails>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CallDetails],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(CallDetails);
    component = fixture.componentInstance;
    // Rendered by its opener with real data (dialog data / inputs), so only creation is checked here.
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
