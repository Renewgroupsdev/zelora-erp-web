import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LeadStatus } from './lead-status';

describe('LeadStatus', () => {
  let component: LeadStatus;
  let fixture: ComponentFixture<LeadStatus>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeadStatus]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LeadStatus);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
