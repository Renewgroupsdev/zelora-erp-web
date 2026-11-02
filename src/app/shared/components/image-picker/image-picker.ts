import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, input, output, signal } from '@angular/core';

/** What the form sends: a new file, a request to clear the saved image, or nothing (keep it). */
export interface ImagePick {
  file: File | null;
  removed: boolean;
}

/**
 * Image field with preview: pick (JPG / PNG / WEBP, size limit checked here before upload), replace or remove.
 * The saved image (`currentUrl`) shows until another is picked or it is removed; the parent sends `file` as multipart
 * and `removed` as remove_image / remove_photo. The API validates the same type and size again.
 */
@Component({
  selector: 'app-image-picker',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="ip">
      <div class="ip-preview" [class.empty]="!preview()">
        @if (preview()) { <img [src]="preview()" [alt]="label()" /> } @else { <i class="bi" [class]="icon()"></i> }
      </div>
      <div class="ip-body">
        <span class="ip-label">{{ label() }}</span>
        <div class="ip-actions">
          <label class="ip-btn">
            <i class="bi bi-upload"></i> {{ preview() ? 'Change' : 'Upload' }}
            <input type="file" accept="image/jpeg,image/png,image/webp" (change)="onFile($event)" hidden />
          </label>
          @if (preview()) {
            <button type="button" class="ip-btn danger" (click)="remove()"><i class="bi bi-trash3"></i> Remove</button>
          }
        </div>
        @if (error()) { <small class="ip-error">{{ error() }}</small> } @else { <small class="ip-hint">JPG, PNG or WEBP, up to {{ maxMb() }} MB.</small> }
      </div>
    </div>
  `,
  styles: [`
    .ip { display: flex; gap: 12px; align-items: center; }
    .ip-preview { width: 72px; height: 72px; flex: 0 0 72px; border-radius: 12px; overflow: hidden; border: 1px solid var(--primary-border, #d6e7e1); background: var(--primary-soft, #eef7f4); display: grid; place-items: center; }
    .ip-preview img { width: 100%; height: 100%; object-fit: cover; }
    .ip-preview i { font-size: 26px; color: var(--primary, #1f6f5c); }
    .ip-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .ip-label { font-size: 12.5px; font-weight: 600; color: var(--text-dark, #163b35); }
    .ip-actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .ip-btn { display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--primary-border, #d6e7e1); background: var(--app-surface-solid, #fff); border-radius: 8px; padding: 4px 10px; font-size: 12.5px; font-weight: 600; cursor: pointer; color: var(--text-dark, #163b35); }
    .ip-btn:hover { border-color: var(--primary, #1f6f5c); }
    .ip-btn.danger { color: #c0392b; }
    .ip-hint { font-size: 11px; color: var(--text-muted, #6b7f7a); }
    .ip-error { font-size: 11.5px; color: #dc3545; }
  `],
})
export class ImagePicker implements OnDestroy {
  readonly label = input('Image');
  /** The saved image's URL (edit forms). */
  readonly currentUrl = input<string | null | undefined>(null);
  readonly icon = input('bi-image');
  readonly maxMb = input(2);
  readonly changed = output<ImagePick>();

  private readonly picked = signal<string | null>(null);
  private readonly removed = signal(false);
  readonly error = signal('');

  readonly preview = computed(() => this.picked() ?? (this.removed() ? null : this.currentUrl() || null));

  onFile(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.error.set('Choose a JPG, PNG or WEBP image.');
      return;
    }
    if (file.size > this.maxMb() * 1024 * 1024) {
      this.error.set(`The image must be ${this.maxMb()} MB or smaller.`);
      return;
    }

    this.error.set('');
    this.release();
    this.picked.set(URL.createObjectURL(file));
    this.removed.set(false);
    this.changed.emit({ file, removed: false });
  }

  remove(): void {
    this.error.set('');
    this.release();
    this.picked.set(null);
    this.removed.set(true);
    this.changed.emit({ file: null, removed: true });
  }

  ngOnDestroy(): void {
    this.release();
  }

  private release(): void {
    const url = this.picked();
    if (url) URL.revokeObjectURL(url);
  }
}
