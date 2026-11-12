import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ToastService } from '../../shared/common-services/toast.service';
import { BANNER_TYPES, Banner, IMAGE_MAX_BYTES, IMAGE_MIMES } from './banner.model';
import { BannersService } from './banners.service';

/** Only a plain http(s) link is allowed (the server checks it again). */
function webLink(c: { value: string }): ValidationErrors | null {
  const v = (c.value ?? '').trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !/\s/.test(v) ? null : { link: true };
  } catch {
    return { link: true };
  }
}

/** Add / edit a banner: fields, image upload with a live preview (as the customer app shows it), schedule and status. */
@Component({
  selector: 'app-banner-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './banner-form.html',
  styleUrl: './banners.scss',
})
export class BannerForm implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(BannersService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly types = BANNER_TYPES;

  id: number | null = null;
  loading = false;
  saving = false;
  error = '';
  imageError = '';
  file: File | null = null;
  preview: string | null = null;
  private objectUrl: string | null = null;

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(150)]],
    description: ['', Validators.maxLength(1000)],
    redirect_url: ['', [Validators.maxLength(2048), webLink]],
    banner_type: ['home', Validators.required],
    display_order: [0, [Validators.required, Validators.min(0), Validators.max(100000)]],
    start_date: [''],
    end_date: [''],
    open_link_in: ['external'],
    status: [true],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.id = Number(id);
    this.loading = true;
    this.api.get(this.id).subscribe({
      next: (b) => { this.fill(b); this.loading = false; },
      error: (e) => { this.loading = false; this.error = this.api.errorMessage(e, 'The banner could not be loaded.'); },
    });
  }

  ngOnDestroy(): void {
    this.revoke();
  }

  get editing(): boolean {
    return this.id !== null;
  }

  private fill(b: Banner): void {
    this.form.patchValue({
      title: b.title, description: b.description ?? '', redirect_url: b.redirect_url ?? '', banner_type: b.banner_type, display_order: b.display_order,
      start_date: b.start_date ?? '', end_date: b.end_date ?? '', open_link_in: b.open_link_in, status: b.status,
    });
    this.preview = b.image_url;
  }

  pick(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    this.imageError = '';
    if (!IMAGE_MIMES.includes(f.type)) { this.imageError = 'Upload a JPG, PNG or WEBP image.'; return; }
    if (f.size > IMAGE_MAX_BYTES) { this.imageError = 'The image must be 3 MB or smaller.'; return; }
    this.revoke();
    this.file = f;
    this.objectUrl = URL.createObjectURL(f);
    this.preview = this.objectUrl;
  }

  removePicked(): void {
    this.revoke();
    this.file = null;
    this.preview = null;
  }

  private revoke(): void {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }

  invalid(name: string): boolean {
    const c = this.form.get(name);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  get dateOrderBad(): boolean {
    const { start_date, end_date } = this.form.getRawValue();
    return !!start_date && !!end_date && end_date < start_date;
  }

  save(): void {
    this.form.markAllAsTouched();
    this.imageError = !this.file && !this.editing ? 'Choose a banner image.' : this.imageError;
    if (this.form.invalid || this.dateOrderBad || this.imageError || this.saving) return;

    const v = this.form.getRawValue();
    const fd = new FormData();
    fd.set('title', v.title.trim());
    fd.set('description', v.description.trim());
    fd.set('redirect_url', v.redirect_url.trim());
    fd.set('banner_type', v.banner_type);
    fd.set('display_order', String(v.display_order));
    fd.set('start_date', v.start_date);
    fd.set('end_date', v.end_date);
    fd.set('open_link_in', v.open_link_in);
    fd.set('status', v.status ? '1' : '0');
    if (this.file) fd.set('image', this.file);

    this.saving = true;
    this.api.save(fd, this.id ?? undefined).subscribe({
      next: () => {
        this.saving = false;
        this.toast.success(this.editing ? 'Banner updated' : 'Banner created');
        this.router.navigate(['/app/banners']);
      },
      error: (e) => {
        this.saving = false;
        this.toast.error('The banner was not saved', this.api.errorMessage(e, 'Please check the form and try again.'));
      },
    });
  }
}
