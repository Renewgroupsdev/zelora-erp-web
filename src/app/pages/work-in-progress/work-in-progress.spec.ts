import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { WorkInProgress } from './work-in-progress';

describe('WorkInProgress', () => {
  let component: WorkInProgress;
  let fixture: ComponentFixture<WorkInProgress>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkInProgress],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkInProgress);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
