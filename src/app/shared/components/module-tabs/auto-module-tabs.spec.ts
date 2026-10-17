import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { AutoModuleTabs } from './auto-module-tabs';

describe('AutoModuleTabs', () => {
  let component: AutoModuleTabs;
  let fixture: ComponentFixture<AutoModuleTabs>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AutoModuleTabs],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(AutoModuleTabs);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
