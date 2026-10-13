import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';

@Directive({
  selector: '[appCan]',
  standalone: true,
})
export class CanActionDirective {
  private readonly auth = inject(AuthService);
  private readonly template = inject(TemplateRef<unknown>);
  private readonly container = inject(ViewContainerRef);
  private shown = false;

  readonly appCan = input.required<string>();

  constructor() {
    effect(() => {
      const allowed = this.auth.hasActionAccess(this.appCan());
      if (allowed && !this.shown) this.container.createEmbeddedView(this.template);
      if (!allowed && this.shown) this.container.clear();
      this.shown = allowed;
    });
  }
}
