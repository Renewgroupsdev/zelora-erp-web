import { CommonModule } from '@angular/common';
import { ConnectedPosition, Overlay, OverlayModule, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { Component, ElementRef, forwardRef, Input, OnDestroy, TemplateRef, ViewChild, ViewContainerRef } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { BOOTSTRAP_ICON_NAMES } from '../../constants/bootstrap-icon-names';

const PANEL_POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -4 },
];

/** A searchable dropdown of every bootstrap-icons class name - implements ControlValueAccessor
 *  so it drops into a reactive form via [formControlName] exactly like a native input, and
 *  stores/emits the full class (e.g. "bi-eye-fill"), not just the bare icon name.
 *
 *  The results panel is rendered through CDK's Overlay (the same primitive MatDialog uses
 *  elsewhere in this app) instead of being absolutely positioned inside the trigger's own DOM
 *  subtree - this component gets used inside cards with `overflow: hidden`/scrollable
 *  containers, which would otherwise clip the panel. The overlay is portaled to the document
 *  body and auto-flips via `PANEL_POSITIONS` when it would run off-screen. */
@Component({
  selector: 'app-icon-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, OverlayModule],
  templateUrl: './icon-picker.html',
  styleUrl: './icon-picker.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => IconPicker),
      multi: true,
    },
  ],
})
export class IconPicker implements ControlValueAccessor, OnDestroy {
  @Input() placeholder = 'Search icon...';

  @ViewChild('trigger', { static: true }) triggerRef!: ElementRef<HTMLElement>;
  @ViewChild('panelTemplate') panelTemplate!: TemplateRef<unknown>;

  readonly pageSize = 150;
  value: string | null = null;
  searchTerm = '';
  isOpen = false;
  disabled = false;
  visibleCount = this.pageSize;

  private overlayRef: OverlayRef | null = null;

  private onChange: (value: string | null) => void = () => { };
  private onTouched: () => void = () => { };

  constructor(
    private overlay: Overlay,
    private viewContainerRef: ViewContainerRef,
  ) { }

  writeValue(value: string | null): void {
    this.value = value ?? null;
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    if (isDisabled) {
      this.closePanel();
    }
  }

  private get matchedIcons(): readonly string[] {
    const term = this.searchTerm.trim().toLowerCase();
    return term ? BOOTSTRAP_ICON_NAMES.filter((name) => name.includes(term)) : BOOTSTRAP_ICON_NAMES;
  }

  get filteredIcons(): readonly string[] {
    return this.matchedIcons.slice(0, this.visibleCount);
  }

  get resultCount(): number {
    return this.matchedIcons.length;
  }

  get hasMore(): boolean {
    return this.resultCount > this.visibleCount;
  }

  get remainingCount(): number {
    return this.resultCount - this.visibleCount;
  }

  showMore(): void {
    this.visibleCount += this.pageSize;
  }

  onSearchChange(): void {
    this.visibleCount = this.pageSize;
  }

  toggleOpen(): void {
    if (this.disabled) return;
    if (this.isOpen) {
      this.closePanel();
    } else {
      this.openPanel();
    }
  }

  private openPanel(): void {
    this.searchTerm = '';
    this.visibleCount = this.pageSize;
    this.isOpen = true;

    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(this.triggerRef)
      .withPositions(PANEL_POSITIONS)
      .withPush(true)
      .withViewportMargin(8);

    this.overlayRef = this.overlay.create({
      positionStrategy,
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
      width: 300,
    });

    this.overlayRef.backdropClick().subscribe(() => this.closePanel());
    this.overlayRef.attach(new TemplatePortal(this.panelTemplate, this.viewContainerRef));
  }

  private closePanel(): void {
    this.isOpen = false;
    this.overlayRef?.dispose();
    this.overlayRef = null;
    this.onTouched();
  }

  select(name: string): void {
    this.value = `bi-${name}`;
    this.onChange(this.value);
    this.closePanel();
  }

  clear(event: Event): void {
    event.stopPropagation();
    this.value = null;
    this.onChange(null);
    this.onTouched();
  }

  ngOnDestroy(): void {
    this.overlayRef?.dispose();
  }
}
