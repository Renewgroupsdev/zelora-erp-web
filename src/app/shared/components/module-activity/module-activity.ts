import { CommonModule } from '@angular/common';
import { Component, DestroyRef, afterNextRender, OnDestroy, OnInit, ElementRef, HostListener, ViewChild, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Subject, catchError, debounceTime, distinctUntilChanged, finalize, of, switchMap, tap } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { AuditService } from '../../common-services/audit.service';
import { AuditEvent, AuditFlow, AuditPagination, AuditQuery, ModuleActivityStats } from '../../models/audit.model';
import { RANGES, RangeKey, actorInitials, auditError, clock, dayHeading, eventMeta, rangeDates, sourceLabel } from '../../../pages/audit/audit-meta';

type Row = AuditEvent & { flow?: AuditFlow };

/**
 * "Activity" drawer of a module page: who handled the module's data, what changed and where it moved (hand-offs of
 * assignee / branch / store / status). Opened from the top bar on every module page; read-only and server-paginated.
 */
@Component({
  selector: 'app-module-activity',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './module-activity.html',
  styleUrls: ['../../../pages/audit/audit.scss', './module-activity.scss'],
})
export class ModuleActivity implements OnInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly audit = inject(AuditService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly slug = input.required<string>();
  readonly closed = output<void>();

  protected readonly rows = signal<Row[]>([]);
  protected readonly stats = signal<ModuleActivityStats | null>(null);
  protected readonly pagination = signal<AuditPagination | null>(null);
  protected readonly moduleName = signal('');
  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  protected readonly error = signal<{ kind: string; message: string } | null>(null);
  protected readonly search = signal('');
  protected readonly events = signal<string[]>([]);
  protected readonly range = signal<RangeKey | null>(null);
  protected readonly canOpenAudit = inject(AuthService).hasActionAccess('view-audit-events');

  protected readonly ranges = RANGES;
  protected readonly eventChips = [
    { value: 'created', label: 'Created' }, { value: 'updated', label: 'Updated' },
    { value: 'deleted', label: 'Deleted' }, { value: 'restored', label: 'Restored' },
  ];
  protected readonly meta = eventMeta;
  protected readonly initials = actorInitials;
  protected readonly clock = clock;
  protected readonly sourceLabel = sourceLabel;
  protected readonly groups = computed(() => {
    const out: { key: string; label: string; rows: Row[] }[] = [];
    for (const e of this.rows()) {
      const h = dayHeading(e.occurred_at);
      const last = out[out.length - 1];
      if (last?.key === h.key) last.rows.push(e);
      else out.push({ ...h, rows: [e] });
    }
    return out;
  });

  @ViewChild('panel', { static: true }) private panel!: ElementRef<HTMLElement>;
  @ViewChild('closeBtn', { static: true }) private closeBtn!: ElementRef<HTMLButtonElement>;
  private readonly previouslyFocused = document.activeElement as HTMLElement | null;
  private readonly load$ = new Subject<number>();
  private readonly search$ = new Subject<string>();

  constructor() {
    this.search$.pipe(debounceTime(400), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef)).subscribe(q => {
      this.search.set(q);
      this.load$.next(1);
    });

    this.load$.pipe(
      tap(page => (page === 1 ? this.loading.set(true) : this.loadingMore.set(true))),
      tap(() => this.error.set(null)),
      switchMap(page => this.audit.moduleActivity(this.slug(), this.query(page)).pipe(
        catchError(err => { this.error.set(auditError(err)); return of(null); }),
        finalize(() => { this.loading.set(false); this.loadingMore.set(false); }),
        // keep the page number with the response so "load more" appends
        tap(res => res && (res.pagination.current_page === 1 ? this.rows.set(res.data) : this.rows.update(r => [...r, ...res.data]))),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(res => {
      if (!res) return;
      this.moduleName.set(res.module.name);
      this.stats.set(res.stats);
      this.pagination.set(res.pagination);
    });

    // The top bar has its own stacking context (blur / transform): move the drawer to <body> so position:fixed covers the page.
    afterNextRender(() => {
      document.body.appendChild(this.host.nativeElement);
      this.closeBtn.nativeElement.focus();
    });
  }

  /** Inputs are bound by now (a signal input cannot be read in the constructor). */
  ngOnInit(): void {
    this.load$.next(1);
  }

  ngOnDestroy(): void {
    this.host.nativeElement.remove();
  }

  private query(page: number): AuditQuery {
    const r = this.range();
    return { page, per_page: 20, search: this.search() || undefined, event: this.events().length ? this.events() : undefined, ...(r ? rangeDates(r) : {}) };
  }

  protected onSearch(value: string): void {
    this.search$.next(value.trim());
  }

  protected toggleEvent(value: string): void {
    this.events.update(e => (e.includes(value) ? e.filter(x => x !== value) : [...e, value]));
    this.load$.next(1);
  }

  protected setRange(key: RangeKey | null): void {
    this.range.set(key);
    this.load$.next(1);
  }

  protected more(): void {
    const p = this.pagination();
    if (p && p.current_page < p.last_page) this.load$.next(p.current_page + 1);
  }

  /** The module's own page (figures, people, records, full event list); the drawer's role already holds view-module-activity. */
  protected openModuleLog(): void {
    this.close();
    this.router.navigate(['/app/audit/modules', this.slug()]);
  }

  protected openInAudit(e?: Row): void {
    this.close();
    this.router.navigate(['/app/audit/logs'], { queryParams: e ? { ev: e.id } : { module: this.slug() } });
  }

  close(): void {
    this.closed.emit();
    setTimeout(() => this.previouslyFocused?.focus?.());
  }

  @HostListener('document:keydown', ['$event'])
  onKey(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') { ev.stopPropagation(); this.close(); return; }
    if (ev.key !== 'Tab') return;
    const nodes = Array.from(this.panel.nativeElement.querySelectorAll<HTMLElement>('button:not([disabled]), input, [href]'));
    if (!nodes.length) return;
    if (ev.shiftKey && document.activeElement === nodes[0]) { ev.preventDefault(); nodes[nodes.length - 1].focus(); }
    else if (!ev.shiftKey && document.activeElement === nodes[nodes.length - 1]) { ev.preventDefault(); nodes[0].focus(); }
  }
}
