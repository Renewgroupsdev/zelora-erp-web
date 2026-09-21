import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddServiceCategoryForm } from './add-service-category-form';

describe('AddServiceCategoryForm', () => {
  let component: AddServiceCategoryForm;
  let fixture: ComponentFixture<AddServiceCategoryForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddServiceCategoryForm]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddServiceCategoryForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
