import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { Appraisals } from './appraisals';

describe('Appraisals', () => {
  let component: Appraisals;
  let fixture: ComponentFixture<Appraisals>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Appraisals],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Appraisals);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
