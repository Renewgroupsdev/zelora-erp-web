import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { AutoModuleTabs } from '../../shared/components/module-tabs/auto-module-tabs';
import { WhatsAppContextService } from './whatsapp-context.service';

/**
 * Settings -> WhatsApp Business shell: the account / number switcher, then the module's page tabs (Roles &
 * Permissions -> module tabs), then the page.
 */
@Component({
  selector: 'app-whatsapp-shell',
  standalone: true,
  imports: [RouterOutlet, FormsModule, AutoModuleTabs],
  template: `
    <div class="wa-shell">
      <div class="wa-switcher" role="group" aria-label="WhatsApp account and number">
        <span class="wa-brand"><i class="bi bi-whatsapp" aria-hidden="true"></i> WhatsApp Business</span>
        @if (ctx.accounts().length) {
          <label class="wa-switch">
            <i class="bi bi-meta" aria-hidden="true"></i>
            <select [ngModel]="ctx.accountId()" (ngModelChange)="ctx.selectAccount($event)" aria-label="Account">
              <option [ngValue]="null">All accounts</option>
              @for (a of ctx.accounts(); track a.id) {
                <option [ngValue]="a.id">{{ a.name }}{{ a.status !== 'connected' ? ' (needs attention)' : '' }}</option>
              }
            </select>
          </label>
          <label class="wa-switch">
            <i class="bi bi-telephone" aria-hidden="true"></i>
            <select [ngModel]="ctx.phoneNumberId()" (ngModelChange)="ctx.selectPhoneNumber($event)" aria-label="Business number">
              <option [ngValue]="null">All numbers</option>
              @for (p of ctx.phoneNumbers(); track p.id) {
                <option [ngValue]="p.id">{{ p.label }}{{ p.is_default ? ' - default' : '' }}</option>
              }
            </select>
          </label>
        } @else if (ctx.loaded()) {
          <span class="wa-switch-empty">No account connected yet</span>
        }
      </div>
      <!-- the module's pages as tabs, as given to the role on Roles & Permissions (Settings -> WhatsApp Business) -->
      <app-auto-module-tabs />
      <router-outlet />
    </div>
  `,
  styles: [`
    :host { display: block; }
    .wa-shell { display: flex; flex-direction: column; gap: 14px; }
    .wa-switcher {
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 10px 8px 14px;
      border: 1px solid var(--card-border); border-radius: 14px; background: var(--app-surface-solid);
    }
    .wa-brand { display: inline-flex; align-items: center; gap: 7px; margin-right: auto; font-weight: 700; font-size: 13px; color: var(--text-dark);
      i { color: #25d366; font-size: 17px; } }
    .wa-switch {
      display: inline-flex; align-items: center; gap: 6px; padding: 0 4px 0 10px; border: 1px solid var(--card-border); border-radius: 10px;
      background: var(--app-surface-solid); color: var(--text-muted); max-width: 100%;
      select { min-height: 34px; max-width: 260px; border: 0; background: transparent; color: var(--text-dark); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
      select:focus { outline: none; }
      &:focus-within { border-color: #128c7e; box-shadow: 0 0 0 3px rgba(37, 211, 102, .25); }
    }
    .wa-switch-empty { font-size: 12.5px; color: var(--text-muted); }
    @media (max-width: 640px) { .wa-brand { width: 100%; } .wa-switch { flex: 1 1 100%; } .wa-switch select { max-width: none; width: 100%; } }
  `],
})
export class WhatsAppShell implements OnInit {
  readonly ctx = inject(WhatsAppContextService);

  ngOnInit(): void {
    this.ctx.load();
  }
}
