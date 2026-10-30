import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { UnitsWidget } from './units-widget';

describe('UnitsWidget', () => {
  let component: UnitsWidget;
  let fixture: ComponentFixture<UnitsWidget>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UnitsWidget],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(UnitsWidget);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
