import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { BfDonut } from './bf-donut';

describe('BfDonut', () => {
  let component: BfDonut;
  let fixture: ComponentFixture<BfDonut>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BfDonut],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(BfDonut);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
