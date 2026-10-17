import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { Ledgers } from './ledgers';

describe('Ledgers', () => {
  let component: Ledgers;
  let fixture: ComponentFixture<Ledgers>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Ledgers],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Ledgers);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
