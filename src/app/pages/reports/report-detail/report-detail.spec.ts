import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { ReportDetail } from './report-detail';

describe('ReportDetail', () => {
  let component: ReportDetail;
  let fixture: ComponentFixture<ReportDetail>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportDetail],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ReportDetail);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
