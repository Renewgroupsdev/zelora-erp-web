import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { DashCard } from './dash-card';

describe('DashCard', () => {
  let component: DashCard;
  let fixture: ComponentFixture<DashCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashCard],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(DashCard);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('title', 'Test');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
