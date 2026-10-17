import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { GeoMap } from './geo-map';

describe('GeoMap', () => {
  let component: GeoMap;
  let fixture: ComponentFixture<GeoMap>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GeoMap],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(GeoMap);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
