import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { AuditService } from '../../shared/common-services/audit.service';
import { AuditMeSummary, AuditModuleRow } from '../../shared/models/audit.model';
import { AuditMyActivity } from './audit-me';
import { AuditModules, relativeTime } from './audit-modules';

const emptyPage = { data: [], pagination: { current_page: 1, last_page: 1, per_page: 25, total: 0 } };

function summary(total: number): AuditMeSummary {
  return {
    period: { from: '2026-10-01', to: '2026-10-30', timezone: 'Asia/Kolkata' },
    person: { identities: [{ type: 'user', id: 1, name: 'Asha', role: 'Admin', code: 'asha@example.com' }] },
    kpis: { total, changes: total, failed_or_denied: 0, sign_ins: 1, first_seen: null, last_seen: null },
    by_day: total ? [{ day: '2026-10-28', total, success: total, failed: 0 }] : [],
    by_module: [], by_hour: Array.from({ length: 24 }, (_, hour) => ({ hour, total: hour === 10 ? total : 0 })),
    recent_sign_ins: [], recent: [],
  };
}

function module(slug: string, name: string, total: number, last: string | null = null): AuditModuleRow {
  return { slug, name, icon: 'bi-grid', url: null, total, today: 0, created: total, updated: 0, deleted: 0, failed_or_denied: 0, people: total ? 1 : 0, last_activity_at: last, top_user: null, sub_modules: [] };
}

function setup(allowed: boolean, audit: Partial<Record<keyof AuditService, unknown>>) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { hasActionAccess: () => allowed } },
      { provide: AuditService, useValue: { meFilters: () => of(null), filters: () => of(null), list: () => of(emptyPage), moduleActivity: () => of(emptyPage), ...audit } },
    ],
  });
}

describe('AuditMyActivity', () => {
  it('sends no request and shows access denied when the role lacks view-my-activity', () => {
    const meSummary = jasmine.createSpy('meSummary').and.returnValue(of(summary(1)));
    setup(false, { meSummary });
    const fixture = TestBed.createComponent(AuditMyActivity);
    fixture.detectChanges();

    expect(meSummary).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Access denied');
  });

  it('loads the summary for the default 30-day period and shows the figures', async () => {
    const meSummary = jasmine.createSpy('meSummary').and.returnValue(of(summary(42)));
    setup(true, { meSummary });
    const fixture = TestBed.createComponent(AuditMyActivity);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(meSummary).toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('42');
    expect(fixture.nativeElement.textContent).toContain('My recent sign-ins');
  });

  it('reloads when the period changes', async () => {
    const meSummary = jasmine.createSpy('meSummary').and.returnValue(of(summary(5)));
    setup(true, { meSummary });
    const fixture = TestBed.createComponent(AuditMyActivity);
    fixture.detectChanges();
    await fixture.whenStable();
    const first = meSummary.calls.count();
    const firstFrom = meSummary.calls.mostRecent().args[0].from;

    (fixture.componentInstance as any).setRange('today');
    await fixture.whenStable();

    expect(meSummary.calls.count()).toBeGreaterThan(first);
    expect(meSummary.calls.mostRecent().args[0].from).toBe(meSummary.calls.mostRecent().args[0].to);
    expect(firstFrom).not.toBe(meSummary.calls.mostRecent().args[0].from);
  });

  it('shows the empty state when nothing was recorded in the period', async () => {
    setup(true, { meSummary: () => of(summary(0)) });
    const fixture = TestBed.createComponent(AuditMyActivity);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No activity in this period');
  });

  it('shows the error state with a retry when the API fails', async () => {
    setup(true, { meSummary: () => throwError(() => ({ status: 500 })) });
    const fixture = TestBed.createComponent(AuditMyActivity);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Could not load your activity');
    expect(fixture.nativeElement.textContent).toContain('Try again');
  });
});

describe('AuditModules', () => {
  const rows = [module('inventory', 'Inventory', 3, '2026-10-28T10:00:00+05:30'), module('hr-management', 'HR Management', 9, '2026-10-29T10:00:00+05:30'), module('reports', 'Analysis', 0)];
  const api = () => ({ modules: () => of({ data: rows, period: { from: '2026-10-01', to: '2026-10-30', timezone: 'Asia/Kolkata' } }) });

  it('does not call the API without view-module-activity', () => {
    const modules = jasmine.createSpy('modules').and.returnValue(of({ data: [], period: {} }));
    setup(false, { modules });
    const fixture = TestBed.createComponent(AuditModules);
    fixture.detectChanges();

    expect(modules).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Access denied');
  });

  it('lists every module, most active first, and mutes the one with no events', async () => {
    setup(true, api());
    const fixture = TestBed.createComponent(AuditModules);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const cards: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.am-card'));
    expect(cards.map(c => c.querySelector('.nm')?.textContent?.trim())).toEqual(['HR Management', 'Inventory', 'Analysis']);
    expect(cards[2].classList).toContain('quiet');
    expect(fixture.nativeElement.textContent).toContain('12 events in 2 of 3 modules');
  });

  it('filters the cards by search and offers to clear it when nothing matches', async () => {
    setup(true, api());
    const fixture = TestBed.createComponent(AuditModules);
    fixture.detectChanges();
    await fixture.whenStable();

    (fixture.componentInstance as any).search.set('inv');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.am-card').length).toBe(1);

    (fixture.componentInstance as any).search.set('zzz');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No module matches');
  });

  it('shows the error state when the API fails', async () => {
    setup(true, { modules: () => throwError(() => ({ status: 500 })) });
    const fixture = TestBed.createComponent(AuditModules);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Could not load module activity');
  });
});

describe('relativeTime', () => {
  it('says "No activity" for no timestamp and "just now" for the last minute', () => {
    expect(relativeTime(null)).toBe('No activity');
    expect(relativeTime(new Date().toISOString())).toBe('just now');
  });
});
