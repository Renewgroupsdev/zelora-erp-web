import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { ApprovalsWidget } from './approvals-widget';

describe('ApprovalsWidget', () => {
  let component: ApprovalsWidget;
  let fixture: ComponentFixture<ApprovalsWidget>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ApprovalsWidget],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ApprovalsWidget);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
