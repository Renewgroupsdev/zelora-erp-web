import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LeadReport } from './lead-report';

describe('LeadReport', () => {
  let component: LeadReport;
  let fixture: ComponentFixture<LeadReport>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeadReport]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LeadReport);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
