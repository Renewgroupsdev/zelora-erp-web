import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { MyWorkWidget } from './my-work-widget';

describe('MyWorkWidget', () => {
  let component: MyWorkWidget;
  let fixture: ComponentFixture<MyWorkWidget>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyWorkWidget],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(MyWorkWidget);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
