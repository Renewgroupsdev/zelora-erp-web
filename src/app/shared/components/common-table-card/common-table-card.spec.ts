import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { CommonTableCard } from './common-table-card';

describe('CommonTableCard', () => {
  let component: CommonTableCard;
  let fixture: ComponentFixture<CommonTableCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonTableCard],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(CommonTableCard);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
