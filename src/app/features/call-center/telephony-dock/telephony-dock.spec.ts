import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { TelephonyDock } from './telephony-dock';

describe('TelephonyDock', () => {
  let component: TelephonyDock;
  let fixture: ComponentFixture<TelephonyDock>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TelephonyDock],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(TelephonyDock);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
