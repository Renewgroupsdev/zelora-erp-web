import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { IconPicker } from './icon-picker';

describe('IconPicker', () => {
  let component: IconPicker;
  let fixture: ComponentFixture<IconPicker>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IconPicker],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(IconPicker);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
