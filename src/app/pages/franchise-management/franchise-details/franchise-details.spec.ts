import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { FranchiseDetails } from './franchise-details';

describe('FranchiseDetails', () => {
  let component: FranchiseDetails;
  let fixture: ComponentFixture<FranchiseDetails>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FranchiseDetails],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(FranchiseDetails);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
