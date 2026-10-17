import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { MissedCalls } from './missed-calls';

describe('MissedCalls', () => {
  let component: MissedCalls;
  let fixture: ComponentFixture<MissedCalls>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MissedCalls],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(MissedCalls);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
