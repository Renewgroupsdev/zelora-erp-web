import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { QrLandingPage } from './qr-landing-page';

describe('QrLandingPage', () => {
  let component: QrLandingPage;
  let fixture: ComponentFixture<QrLandingPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QrLandingPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(QrLandingPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
