import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { ModuleTabs } from './module-tabs';

describe('ModuleTabs', () => {
  let component: ModuleTabs;
  let fixture: ComponentFixture<ModuleTabs>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModuleTabs],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ModuleTabs);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
