import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddLeadStatusForm } from './add-lead-status-form';

describe('AddLeadStatusForm', () => {
  let component: AddLeadStatusForm;
  let fixture: ComponentFixture<AddLeadStatusForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddLeadStatusForm]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddLeadStatusForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
