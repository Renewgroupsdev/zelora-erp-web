import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { LeftSideNavbar } from './left-side-navbar';

describe('LeftSideNavbar', () => {
  let component: LeftSideNavbar;
  let fixture: ComponentFixture<LeftSideNavbar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeftSideNavbar],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(LeftSideNavbar);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
