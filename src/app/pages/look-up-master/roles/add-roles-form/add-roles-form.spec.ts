import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddRolesForm } from './add-roles-form';

describe('AddRolesForm', () => {
  let component: AddRolesForm;
  let fixture: ComponentFixture<AddRolesForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddRolesForm]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddRolesForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
