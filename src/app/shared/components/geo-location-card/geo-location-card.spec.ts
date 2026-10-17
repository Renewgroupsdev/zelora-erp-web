import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { GeoLocationCard } from './geo-location-card';

describe('GeoLocationCard', () => {
  let component: GeoLocationCard;
  let fixture: ComponentFixture<GeoLocationCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GeoLocationCard],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(GeoLocationCard);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
