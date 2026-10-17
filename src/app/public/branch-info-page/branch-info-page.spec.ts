import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { BranchInfoPage } from './branch-info-page';

describe('BranchInfoPage', () => {
  let component: BranchInfoPage;
  let fixture: ComponentFixture<BranchInfoPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BranchInfoPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(BranchInfoPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
