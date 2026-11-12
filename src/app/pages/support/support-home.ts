import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AutoModuleTabs } from '../../shared/components/module-tabs/auto-module-tabs';
import { SupportConfig, TicketSummary, priorityTone, statusTone } from './support.model';
import { SupportService } from './support.service';

/** Help & Support landing page: how to reach support, report an issue, and the latest tickets. */
@Component({
  selector: 'app-support-home',
  standalone: true,
  imports: [CommonModule, RouterLink, AutoModuleTabs],
  templateUrl: './support-home.html',
  styleUrl: './support.scss',
})
export class SupportHome implements OnInit {
  private readonly api = inject(SupportService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  config: SupportConfig | null = null;
  recent: TicketSummary[] = [];
  unread = 0;
  loading = true;
  readonly statusTone = statusTone;
  readonly priorityTone = priorityTone;

  get isSupportTeam(): boolean {
    return this.auth.hasActionAccess('view-support-tickets');
  }

  ngOnInit(): void {
    this.api.config().subscribe({ next: (c) => (this.config = c), error: () => (this.config = null) });
    this.api.myTickets({ per_page: 5 }).subscribe({
      next: (r) => { this.recent = r.items; this.loading = false; },
      error: () => (this.loading = false),
    });
    this.api.unreadCount().subscribe({ next: (n) => (this.unread = n), error: () => (this.unread = 0) });
  }

  open(no: string): void {
    this.router.navigate(['/app/support/tickets', no]);
  }

  /** The number is shown as typed and dialled as digits (and a leading + if any). */
  tel(phone: string): string {
    return 'tel:' + phone.replace(/[^\d+]/g, '');
  }

  whatsapp(phone: string): string {
    return 'https://wa.me/' + phone.replace(/\D/g, '');
  }
}
