import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { FollowUpReport } from './follow-up-report';

describe('FollowUpReport', () => {
  let component: FollowUpReport;
  let fixture: ComponentFixture<FollowUpReport>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FollowUpReport],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(FollowUpReport);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
