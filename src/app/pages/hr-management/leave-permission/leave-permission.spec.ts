import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { LeavePermission } from './leave-permission';

describe('LeavePermission', () => {
  let component: LeavePermission;
  let fixture: ComponentFixture<LeavePermission>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeavePermission],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(LeavePermission);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
