import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddSourceForm } from './add-source-form';

describe('AddSourceForm', () => {
  let component: AddSourceForm;
  let fixture: ComponentFixture<AddSourceForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddSourceForm]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddSourceForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
