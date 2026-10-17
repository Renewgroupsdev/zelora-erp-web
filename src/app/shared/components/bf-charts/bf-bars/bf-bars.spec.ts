import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { BfBars } from './bf-bars';

describe('BfBars', () => {
  let component: BfBars;
  let fixture: ComponentFixture<BfBars>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BfBars],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(BfBars);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
