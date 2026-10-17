import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { CommonFilterCard } from './common-filter-card';

describe('CommonFilterCard', () => {
  let component: CommonFilterCard;
  let fixture: ComponentFixture<CommonFilterCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonFilterCard],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(CommonFilterCard);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
