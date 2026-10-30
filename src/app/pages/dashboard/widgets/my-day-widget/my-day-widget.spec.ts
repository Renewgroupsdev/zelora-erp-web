import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { MyDayWidget } from './my-day-widget';

describe('MyDayWidget', () => {
  let component: MyDayWidget;
  let fixture: ComponentFixture<MyDayWidget>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyDayWidget],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(MyDayWidget);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
