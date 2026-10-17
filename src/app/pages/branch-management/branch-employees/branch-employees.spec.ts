import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { BranchEmployees } from './branch-employees';

describe('BranchEmployees', () => {
  let component: BranchEmployees;
  let fixture: ComponentFixture<BranchEmployees>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BranchEmployees],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(BranchEmployees);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
