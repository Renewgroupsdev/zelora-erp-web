import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { GeoLocationField } from './geo-location-field';

describe('GeoLocationField', () => {
  let component: GeoLocationField;
  let fixture: ComponentFixture<GeoLocationField>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GeoLocationField],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(GeoLocationField);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
