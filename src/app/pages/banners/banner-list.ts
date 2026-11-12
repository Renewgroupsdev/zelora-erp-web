import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, Subscription, debounceTime } from 'rxjs';
import { CanActionDirective } from '../../shared/directives/can-action.directive';
import { ToastService } from '../../shared/common-services/toast.service';
import { BANNER_SORTS, BANNER_TYPES, Banner, BannerSummary, Pagination, STATE_LABEL, STATE_TONE } from './banner.model';
import { BannersService } from './banners.service';

/** Banner Management: every banner with its thumbnail, schedule, status and click numbers; search, filters, sort, server paging, view / edit / delete / switch. */
@Component({
  selector: 'app-banner-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, CanActionDirective],
  templateUrl: './banner-list.html',
  styleUrl: './banners.scss',
})
export class BannerList implements OnInit, OnDestroy {
  private readonly api = inject(BannersService);
  private readonly toast = inject(ToastService);

  readonly types = BANNER_TYPES;
  readonly sorts = BANNER_SORTS;
  readonly stateLabel = STATE_LABEL;
  readonly stateTone = STATE_TONE;
  readonly sizes = [10, 25, 50];

  search = '';
  status = '';
  type = '';
  dateFrom = '';
  dateTo = '';
  sort = 'display_order';
  perPage = 10;
  page = 1;

  items: Banner[] = [];
  pagination: Pagination | null = null;
  summary: BannerSummary | null = null;
  loading = true;
  error = '';
  viewing: Banner | null = null;
  busyId: number | null = null;

  private readonly typed = new Subject<void>();
  private sub = new Subscription();
  private seq = 0;

  ngOnInit(): void {
    this.sub.add(this.typed.pipe(debounceTime(350)).subscribe(() => { this.page = 1; this.load(); }));
    this.load();
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  onSearch(): void {
    this.typed.next();
  }

  changed(): void {
    this.page = 1;
    this.load();
  }

  clear(): void {
    this.search = this.status = this.type = this.dateFrom = this.dateTo = '';
    this.changed();
  }

  get filtered(): boolean {
    return !!(this.search || this.status || this.type || this.dateFrom || this.dateTo);
  }

  goTo(p: number): void {
    if (p < 1 || (this.pagination && p > this.pagination.last_page)) return;
    this.page = p;
    this.load();
  }

  load(): void {
    const id = ++this.seq;
    this.loading = true;
    this.error = '';
    this.api.list({ search: this.search.trim(), status: this.status, banner_type: this.type, date_from: this.dateFrom, date_to: this.dateTo, sort: this.sort, page: this.page, per_page: Number(this.perPage) }).subscribe({
      next: (r) => { if (id !== this.seq) return; this.items = r.items; this.pagination = r.pagination; this.summary = r.summary; this.loading = false; },
      error: (e) => { if (id !== this.seq) return; this.loading = false; this.error = this.api.errorMessage(e, 'The banners could not be loaded.'); },
    });
  }

  view(b: Banner): void {
    this.viewing = b;
  }

  toggle(b: Banner): void {
    if (this.busyId) return;
    this.busyId = b.id;
    this.api.setStatus(b.id, !b.status).subscribe({
      next: (u) => { this.busyId = null; Object.assign(b, u); this.toast.success(u.status ? 'Banner activated' : 'Banner deactivated'); this.refreshSummary(); },
      error: (e) => { this.busyId = null; this.toast.error('Could not change the status', this.api.errorMessage(e, 'Please try again.')); this.load(); },
    });
  }

  async remove(b: Banner): Promise<void> {
    if (!(await this.toast.confirm('Delete this banner?', `"${b.title}" will stop showing in the customer app and its image will be removed.`))) return;
    this.api.remove(b.id).subscribe({
      next: () => {
        this.toast.success('Banner deleted');
        if (this.viewing?.id === b.id) this.viewing = null;
        if (this.items.length === 1 && this.page > 1) this.page--;
        this.load();
      },
      error: (e) => this.toast.error('Could not delete the banner', this.api.errorMessage(e, 'Please try again.')),
    });
  }

  private refreshSummary(): void {
    this.api.list({ per_page: 1 }).subscribe((r) => (this.summary = r.summary));
  }

  /** A broken image link must not break the row. */
  imgError(ev: Event): void {
    (ev.target as HTMLImageElement).style.visibility = 'hidden';
  }
}
