import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LeadManagement } from './lead-management';

describe('LeadManagement', () => {
  let component: LeadManagement;
  let fixture: ComponentFixture<LeadManagement>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeadManagement]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LeadManagement);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
