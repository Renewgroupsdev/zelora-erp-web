import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { Breadcrumb } from './breadcrumb';

describe('Breadcrumb', () => {
  let component: Breadcrumb;
  let fixture: ComponentFixture<Breadcrumb>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Breadcrumb],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Breadcrumb);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
