import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { RolePermissionMatrix } from './role-permission-matrix';

describe('RolePermissionMatrix', () => {
  let component: RolePermissionMatrix;
  let fixture: ComponentFixture<RolePermissionMatrix>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RolePermissionMatrix],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(RolePermissionMatrix);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
