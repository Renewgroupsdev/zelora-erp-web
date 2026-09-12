import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddLeadForm } from './add-lead-form';

describe('AddLeadForm', () => {
  let component: AddLeadForm;
  let fixture: ComponentFixture<AddLeadForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddLeadForm]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddLeadForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
