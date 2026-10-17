import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { TelecallerStatus } from './telecaller-status';

describe('TelecallerStatus', () => {
  let component: TelecallerStatus;
  let fixture: ComponentFixture<TelecallerStatus>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TelecallerStatus],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(TelecallerStatus);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
