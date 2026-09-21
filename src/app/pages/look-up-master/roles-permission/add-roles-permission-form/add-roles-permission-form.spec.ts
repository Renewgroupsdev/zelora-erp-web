import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddRolesPermissionForm } from './add-roles-permission-form';

describe('AddRolesPermissionForm', () => {
  let component: AddRolesPermissionForm;
  let fixture: ComponentFixture<AddRolesPermissionForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddRolesPermissionForm]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddRolesPermissionForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
