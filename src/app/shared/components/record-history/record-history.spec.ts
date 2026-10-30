import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { AuditService } from '../../common-services/audit.service';
import { AuditRecordLife } from '../../models/audit.model';
import { RecordHistory, RecordHistoryDrawer } from './record-history';

const who = { type: 'user' as const, id: 1, name: 'Asha', role: 'Admin', branch: 'Chennai' };
const stamp = { at: '2026-10-28T10:00:00+05:30', display: '28 Oct 2026, 10:00:00 AM', relative: '1 day ago' };

function life(over: Partial<AuditRecordLife> = {}): AuditRecordLife {
  return {
    record: { type: 'Branch', id: '7', type_label: 'Branch', label: 'Anna Nagar', module: 'Branch Management', sub_module: null },
    state: 'active',
    origin: { ...stamp, stored: true, note: null, event_id: 'e1', who, source: 'web', record_branch: 'Chennai', initial: [{ label: 'Name', value: 'Anna Nagar' }] },
    summary: { events: 3, own_events: 3, updates: 1, moves: 1, child_events: 0, people: 1, first_at: stamp.at, last_at: stamp.at, last_by: 'Asha', last_event: 'Updated', values_visible: true },
    journey: [
      { ...stamp, id: 'e1', kind: 'stored', title: 'Stored', who, items: [] },
      { ...stamp, id: 'e2', kind: 'moved', title: 'Moved / reassigned', who, items: [{ field: 'status', label: 'Status', masked: false, from: 'Active', to: 'Inactive' }] },
    ],
    lineage: { upstream: [{ type: 'CustomerLead', id: '5', type_label: 'Lead', label: 'Ravi', tracked: true, stored_by: 'Asha', stored: stamp, last: stamp, last_event: 'Updated', events: 2, state: 'active' }], downstream: [] },
    path: [
      { ...stamp, id: 'p1', kind: 'stored', title: 'Stored', who, items: [], record: { type: 'CustomerLead', id: '5', type_label: 'Lead', label: 'Ravi', relation: 'upstream' } },
      { ...stamp, id: 'e1', kind: 'stored', title: 'Stored', who, items: [], record: { type: 'Branch', id: '7', type_label: 'Branch', label: 'Anna Nagar', relation: 'self' } },
    ],
    fields: [{ field: 'status', label: 'Status', masked: false, count: 1, last_at: stamp.at, history: [{ ...stamp, id: 'e2', by: 'Asha', from: 'Active', to: 'Inactive' }] }],
    people: [{ type: 'user', id: 1, name: 'Asha', role: 'Admin', total: 3, last_at: stamp.at }],
    ...over,
  };
}

function setup(audit: Partial<Record<keyof AuditService, unknown>>, allowed = true) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { hasActionAccess: () => allowed } },
      { provide: AuditService, useValue: audit },
    ],
  });
}

function drawer() {
  const fixture = TestBed.createComponent(RecordHistoryDrawer);
  fixture.componentRef.setInput('type', 'Branch');
  fixture.componentRef.setInput('recordId', 7);
  fixture.detectChanges();
  return fixture;
}

describe('RecordHistoryDrawer', () => {
  it('shows where the record was stored, its journey and the current state', () => {
    setup({ record: () => of(life()) });
    const f = drawer();
    const text = f.nativeElement.textContent;

    expect(text).toContain('Came from');
    expect(text).toContain('Ravi');
    expect(text).toContain('Now: Active');

    (f.componentInstance as any).select('journey');
    f.detectChanges();
    const own = f.nativeElement.textContent;
    expect(own).toContain('Anna Nagar');
    expect(own).toContain('Moved / reassigned');
    expect(own).toContain('Inactive');
  });

  it('warns when the record was stored before tracking started', () => {
    setup({ record: () => of(life({ origin: { ...life().origin, stored: false, note: 'This record was stored before the audit trail started.' } })) });
    const f = drawer();

    expect(f.nativeElement.textContent).toContain('stored before the audit trail started');
    expect(f.nativeElement.textContent).toContain('Tracked since');
  });

  it('loads every change with its before / after only when the All changes tab opens', () => {
    const history = jasmine.createSpy('history').and.returnValue(of({ data: [], pagination: { current_page: 1, last_page: 1, per_page: 20, total: 0 } }));
    setup({ record: () => of(life()), history });
    const f = drawer();
    expect(history).not.toHaveBeenCalled();

    (f.componentInstance as any).select('changes');
    f.detectChanges();

    expect(history).toHaveBeenCalledOnceWith('Branch', 7, { page: 1, per_page: 20, detail: 1 });
    expect(f.nativeElement.textContent).toContain('No events');
  });

  it('explains hidden values for a role without field-level access', () => {
    setup({ record: () => of(life({ summary: { ...life().summary, values_visible: false } })) });
    const f = drawer();

    expect(f.nativeElement.textContent).toContain('Field values are hidden');
  });

  it('shows the empty state for a record with no audit rows and an error state with retry otherwise', () => {
    setup({ record: () => throwError(() => ({ status: 404, error: { message: 'No audit history found for this record.' } })) });
    expect(drawer().nativeElement.textContent).toContain('Nothing recorded yet');

    TestBed.resetTestingModule();
    setup({ record: () => throwError(() => ({ status: 500 })) });
    const f = drawer();
    expect(f.nativeElement.textContent).toContain('Could not load the history');
    expect(f.nativeElement.textContent).toContain('Try again');
  });
});

@Component({ standalone: true, imports: [RecordHistory], template: `<app-record-history type="Branch" [recordId]="id" />` })
class Host {
  id: number | null = 7;
}

describe('RecordHistory button', () => {
  it('is hidden without view-audit-data-changes or without a record id', () => {
    setup({}, false);
    const denied = TestBed.createComponent(Host);
    denied.detectChanges();
    expect(denied.nativeElement.querySelector('button')).toBeNull();

    TestBed.resetTestingModule();
    setup({}, true);
    const noId = TestBed.createComponent(Host);
    noId.componentInstance.id = null;
    noId.detectChanges();
    expect(noId.nativeElement.querySelector('button')).toBeNull();

    const ok = TestBed.createComponent(Host);
    ok.detectChanges();
    expect(ok.nativeElement.querySelector('button')).not.toBeNull();
  });
});
