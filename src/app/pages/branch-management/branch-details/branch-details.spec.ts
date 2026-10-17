import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { BranchDetails } from './branch-details';

describe('BranchDetails', () => {
  let component: BranchDetails;
  let fixture: ComponentFixture<BranchDetails>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BranchDetails],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(BranchDetails);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
