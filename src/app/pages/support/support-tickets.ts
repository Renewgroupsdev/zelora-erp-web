import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, Subscription, debounceTime } from 'rxjs';
import { AutoModuleTabs } from '../../shared/components/module-tabs/auto-module-tabs';
import { MY_TICKET_FILTERS, Pagination, TicketSummary, priorityTone, statusTone } from './support.model';
import { SupportService } from './support.service';

/** My Support Tickets: the signed-in user's own tickets, with status chips and a search by ticket number or title. */
@Component({
  selector: 'app-support-tickets',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AutoModuleTabs],
  templateUrl: './support-tickets.html',
  styleUrl: './support.scss',
})
export class SupportTickets implements OnInit, OnDestroy {
  private readonly api = inject(SupportService);

  readonly filters = MY_TICKET_FILTERS;
  filter = 'all';
  search = '';
  page = 1;
  items: TicketSummary[] = [];
  pagination: Pagination | null = null;
  loading = true;
  error = '';
  readonly statusTone = statusTone;
  readonly priorityTone = priorityTone;

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

  setFilter(key: string): void {
    this.filter = key;
    this.page = 1;
    this.load();
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
    this.api.myTickets({ status: this.filters.find((f) => f.key === this.filter)?.status ?? 'all', search: this.search.trim(), page: this.page, per_page: 10 }).subscribe({
      next: (r) => { if (id !== this.seq) return; this.items = r.items; this.pagination = r.pagination; this.loading = false; },
      error: async (e) => { if (id !== this.seq) return; this.loading = false; this.error = await this.api.errorMessage(e, 'Your tickets could not be loaded.'); },
    });
  }
}
