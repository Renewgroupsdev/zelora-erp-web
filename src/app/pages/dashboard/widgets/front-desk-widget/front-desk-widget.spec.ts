import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { FrontDeskWidget } from './front-desk-widget';

describe('FrontDeskWidget', () => {
  let component: FrontDeskWidget;
  let fixture: ComponentFixture<FrontDeskWidget>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FrontDeskWidget],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(FrontDeskWidget);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
