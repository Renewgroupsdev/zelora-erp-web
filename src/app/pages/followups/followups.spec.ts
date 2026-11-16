import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Followups } from './followups';

describe('Followups', () => {
  let component: Followups;
  let fixture: ComponentFixture<Followups>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Followups]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Followups);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('orders follow-ups by most recently updated by default', () => {
    component.allRows = [
      { id: 1, lead: { name: 'Older' }, updated_at: '2026-03-10T09:00:00Z' },
      { id: 2, lead: { name: 'Newest' }, updated_at: '2026-03-12T09:00:00Z' },
      { id: 3, lead: { name: 'No update date' }, updated_at: '' },
    ];

    component.onPageChange({ page: 1, pageSize: 10 });

    expect(component.rows.map(row => row['id'])).toEqual([2, 1, 3]);
  });
});
