import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { CommonDetailCard } from './common-detail-card';

describe('CommonDetailCard', () => {
  let component: CommonDetailCard;
  let fixture: ComponentFixture<CommonDetailCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonDetailCard],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(CommonDetailCard);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
