import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { LeadSourceWidget } from './lead-source-widget';

describe('LeadSourceWidget', () => {
  let component: LeadSourceWidget;
  let fixture: ComponentFixture<LeadSourceWidget>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeadSourceWidget],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(LeadSourceWidget);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
