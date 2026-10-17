import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { OnboardingExit } from './onboarding-exit';

describe('OnboardingExit', () => {
  let component: OnboardingExit;
  let fixture: ComponentFixture<OnboardingExit>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OnboardingExit],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(OnboardingExit);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
