import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { AuthBackground } from './auth-background';

describe('AuthBackground', () => {
  let component: AuthBackground;
  let fixture: ComponentFixture<AuthBackground>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthBackground],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(AuthBackground);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
