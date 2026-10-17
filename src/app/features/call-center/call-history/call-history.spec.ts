import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { CallHistory } from './call-history';

describe('CallHistory', () => {
  let component: CallHistory;
  let fixture: ComponentFixture<CallHistory>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CallHistory],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(CallHistory);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
