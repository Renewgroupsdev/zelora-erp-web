import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { SplashPage } from './splash-page';

describe('SplashPage', () => {
  let component: SplashPage;
  let fixture: ComponentFixture<SplashPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SplashPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(SplashPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
