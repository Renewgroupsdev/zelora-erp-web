import { Directive, EmbeddedViewRef, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { SidebarAction } from '../models/permission.model';

/** What `*appCan` hands its template: the action as set in Roles & Permissions (name, logo, url). */
export interface CanActionContext {
  $implicit: SidebarAction;
  appCan: SidebarAction;
}

/** Remembers a button's own label / icon so a cleared Action Name or Icon falls back to it. */
interface OriginalLook {
  label: Text | null;
  labelText: string;
  icon: Element | null;
  iconClasses: string[];
  title: string | null;
  ariaLabel: string | null;
}

/**
 * Renders its element only when Roles & Permissions assigns the signed-in role this action, and shows it with
 * the action's Action Name and Icon from Roles & Permissions - so renaming an action or changing its icon there
 * updates the page's button with no code change. The page's own label / icon is the fallback when either is empty.
 *
 *   <button *appCan="'add-appointment'" (click)="add()"><i class="bi bi-plus-lg"></i> Add Appointment</button>
 *
 * Applied to a single button / link: the leading `bi` icon takes the action's icon, the label text (or, for an
 * icon-only button, its title / aria-label) takes the action's name. Opt out where the page computes its own
 * label (`*appCan="'run-payroll'; keepLabel: true"`) or its own icon (`keepIcon: true`). The action is also
 * exposed to the template (`let action`) for custom markup.
 */
@Directive({
  selector: '[appCan]',
  standalone: true,
})
export class CanActionDirective {
  private readonly auth = inject(AuthService);
  private readonly template = inject(TemplateRef<CanActionContext>);
  private readonly container = inject(ViewContainerRef);
  private view: EmbeddedViewRef<CanActionContext> | null = null;
  private original: OriginalLook | null = null;

  readonly appCan = input.required<string>();
  /** Keep the page's own label text (it is computed, e.g. "Run Payroll" / "Re-run Payroll"). */
  readonly appCanKeepLabel = input(false);
  /** Keep the page's own icon (it is computed by the page). */
  readonly appCanKeepIcon = input(false);

  static ngTemplateContextGuard(_dir: CanActionDirective, ctx: unknown): ctx is CanActionContext {
    return true;
  }

  constructor() {
    effect(() => {
      const action = this.auth.actionDetails(this.appCan());

      if (!action) {
        this.container.clear();
        this.view = null;
        this.original = null;
        return;
      }

      const context: CanActionContext = { $implicit: action, appCan: action };
      if (this.view) {
        // Already shown - refresh the name / icon in case Roles & Permissions changed them.
        this.view.context = context;
        this.view.markForCheck();
      } else {
        this.view = this.container.createEmbeddedView(this.template, context);
      }

      this.applyLook(action);
    });
  }

  /** Puts the action's name / icon on the rendered button (only a single button or link root). */
  private applyLook(action: SidebarAction): void {
    const root = this.view?.rootNodes.length === 1 ? this.view.rootNodes[0] : null;
    if (!(root instanceof HTMLElement) || !this.isButtonLike(root)) return;

    this.original ??= this.readOriginal(root);
    const original = this.original;

    if (!this.appCanKeepIcon() && original.icon) {
      const logo = action.logo?.trim();
      const iconClasses = logo ? ['bi', ...logo.split(/\s+/)] : original.iconClasses;
      const icon = original.icon;
      icon.classList.remove(...Array.from(icon.classList).filter(c => c === 'bi' || c.startsWith('bi-')));
      icon.classList.add(...iconClasses);
    }

    if (this.appCanKeepLabel()) return;
    const name = action.action_name?.trim();

    if (original.label) {
      // keep the spacing around the text (e.g. the gap after the icon)
      const lead = original.labelText.match(/^\s*/)?.[0] ?? '';
      const trail = original.labelText.match(/\s*$/)?.[0] ?? '';
      original.label.textContent = name ? `${lead}${name}${trail}` : original.labelText;
    }
    if (original.title !== null) root.setAttribute('title', name || original.title);
    if (original.ariaLabel !== null) root.setAttribute('aria-label', name || original.ariaLabel);
    if (!original.label && original.title === null && name) root.setAttribute('title', name);
  }

  private isButtonLike(el: HTMLElement): boolean {
    return el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button';
  }

  /** Read once, right after the view is created - before any rename is applied. */
  private readOriginal(root: HTMLElement): OriginalLook {
    const icon = root.querySelector('i.bi, i[class*="bi-"]');
    const label = this.findLabel(root);
    return {
      label,
      labelText: label?.textContent ?? '',
      icon,
      iconClasses: icon ? Array.from(icon.classList).filter(c => c === 'bi' || c.startsWith('bi-')) : [],
      title: root.getAttribute('title'),
      ariaLabel: root.getAttribute('aria-label'),
    };
  }

  /**
   * The button's static label: a non-empty text node directly in it, else the only text inside a plain child
   * span. Interpolated labels (`{{ ... }}`) are still empty when the view is created, so they are never taken -
   * a page that computes its label keeps it.
   */
  private findLabel(root: HTMLElement): Text | null {
    const direct = Array.from(root.childNodes).filter((n): n is Text => n.nodeType === Node.TEXT_NODE && !!n.textContent?.trim());
    if (direct.length === 1) return direct[0];
    if (direct.length) return null;

    const spans = Array.from(root.children).filter(c => c.tagName === 'SPAN' && c.children.length === 0 && !!c.textContent?.trim());
    const textNode = spans.length === 1 ? spans[0].firstChild : null;
    return textNode?.nodeType === Node.TEXT_NODE ? (textNode as Text) : null;
  }
}
