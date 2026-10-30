import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { LeadsWidget } from './leads-widget';

describe('LeadsWidget', () => {
  let component: LeadsWidget;
  let fixture: ComponentFixture<LeadsWidget>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeadsWidget],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(LeadsWidget);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
