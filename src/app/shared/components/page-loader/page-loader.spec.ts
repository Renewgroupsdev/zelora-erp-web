import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { PageLoader } from './page-loader';

describe('PageLoader', () => {
  let component: PageLoader;
  let fixture: ComponentFixture<PageLoader>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PageLoader],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(PageLoader);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
