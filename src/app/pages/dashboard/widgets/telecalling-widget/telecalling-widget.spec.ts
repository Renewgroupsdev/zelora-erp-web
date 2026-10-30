import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { TelecallingWidget } from './telecalling-widget';

describe('TelecallingWidget', () => {
  let component: TelecallingWidget;
  let fixture: ComponentFixture<TelecallingWidget>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TelecallingWidget],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(TelecallingWidget);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
