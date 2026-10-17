import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { TopNavbar } from './top-navbar';

describe('TopNavbar', () => {
  let component: TopNavbar;
  let fixture: ComponentFixture<TopNavbar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TopNavbar],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(TopNavbar);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
