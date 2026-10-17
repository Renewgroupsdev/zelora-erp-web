import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { TreatmentCreate } from './treatment-create';

describe('TreatmentCreate', () => {
  let component: TreatmentCreate;
  let fixture: ComponentFixture<TreatmentCreate>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TreatmentCreate],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(TreatmentCreate);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
