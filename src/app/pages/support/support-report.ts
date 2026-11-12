import { CommonModule } from '@angular/common';
import { HttpEventType } from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AutoModuleTabs } from '../../shared/components/module-tabs/auto-module-tabs';
import { SupportConfig } from './support.model';
import { SupportService } from './support.service';

interface PickedFile { file: File; preview: string | null; }

/**
 * Report an issue (employee web). Reached from the Help & Support menu or from the "Report this issue" button in the top bar, which
 * passes the page the user was on (?from=) and its module (?module=) so they do not have to type it.
 */
@Component({
  selector: 'app-support-report',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AutoModuleTabs],
  templateUrl: './support-report.html',
  styleUrl: './support.scss',
})
export class SupportReport implements OnInit, OnDestroy {
  private readonly api = inject(SupportService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  config: SupportConfig | null = null;
  loadingConfig = true;

  title = '';
  description = '';
  categoryId: number | '' = '';
  module = '';
  screen = '';
  priority = 'medium';
  files: PickedFile[] = [];

  /** What is sent along automatically (shown to the user so nothing is hidden). */
  pageUrl = '';
  readonly browser = describeBrowser();
  readonly capturedAt = new Date();

  submitted = false;
  uploading = false;
  progress = 0;
  error = '';
  fileErrors: string[] = [];
  touched = false;
  created: { number: string; message: string } | null = null;

  get user() {
    return this.auth.currentUser();
  }

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    this.pageUrl = q.get('from') ? location.origin + q.get('from') : document.referrer || '';
    this.module = q.get('module') ?? '';
    this.screen = q.get('screen') ?? this.guessScreen(q.get('from'));
    this.api.config().subscribe({
      next: (c) => {
        this.config = c;
        this.loadingConfig = false;
        if (this.module && !c.modules.includes(this.module)) this.module = this.matchModule(c.modules, this.module);
      },
      error: () => (this.loadingConfig = false),
    });
  }

  ngOnDestroy(): void {
    this.files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
  }

  private guessScreen(from: string | null): string {
    if (!from) return '';
    return from.split('?')[0].replace(/^\/app\//, '').split('/').filter((p) => p && !/^\d+$/.test(p)).join(' / ').replace(/-/g, ' ');
  }

  private matchModule(modules: string[], hint: string): string {
    const h = hint.toLowerCase();
    return modules.find((m) => m.toLowerCase().includes(h) || h.includes(m.toLowerCase())) ?? '';
  }

  /** Files are checked here for the user's comfort; the server checks them again. */
  onFiles(input: HTMLInputElement): void {
    const cfg = this.config?.attachments;
    this.fileErrors = [];
    for (const file of Array.from(input.files ?? [])) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (cfg && !cfg.allowed_extensions.includes(ext)) { this.fileErrors.push(`${file.name}: this file type is not allowed.`); continue; }
      if (cfg && file.size > cfg.max_kb * 1024) { this.fileErrors.push(`${file.name}: larger than ${Math.round(cfg.max_kb / 1024)} MB.`); continue; }
      if (cfg && this.files.length >= cfg.max_files) { this.fileErrors.push(`You can attach up to ${cfg.max_files} files.`); break; }
      this.files.push({ file, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null });
    }
    input.value = '';
  }

  remove(i: number): void {
    const [f] = this.files.splice(i, 1);
    if (f?.preview) URL.revokeObjectURL(f.preview);
  }

  get invalid(): boolean {
    return this.title.trim().length < 3 || this.description.trim().length < 5;
  }

  submit(): void {
    this.touched = true;
    this.error = '';
    if (this.invalid || this.uploading) return;

    const form = new FormData();
    form.set('title', this.title.trim());
    form.set('description', this.description.trim());
    if (this.categoryId) form.set('category_id', String(this.categoryId));
    if (this.module) form.set('affected_module', this.module);
    if (this.screen.trim()) form.set('affected_screen', this.screen.trim());
    form.set('priority', this.priority);
    form.set('application_type', 'web');
    if (this.pageUrl) form.set('page_url', this.pageUrl);
    form.set('browser_information', this.browser.text);
    form.set('device_information[browser]', this.browser.name);
    form.set('device_information[os]', this.browser.os);
    form.set('device_information[viewport]', `${window.innerWidth}x${window.innerHeight}`);
    form.set('device_information[screen]', `${screen.width}x${screen.height}`);
    form.set('device_information[language]', navigator.language);
    this.files.forEach((f) => form.append('attachments[]', f.file));

    this.uploading = true;
    this.progress = 0;
    this.api.createTicket(form).subscribe({
      next: (ev) => {
        if (ev.type === HttpEventType.UploadProgress && ev.total) this.progress = Math.round((100 * ev.loaded) / ev.total);
        if (ev.type === HttpEventType.Response) {
          this.uploading = false;
          this.created = { number: ev.body?.data?.ticket_number, message: ev.body?.message ?? 'Your support ticket has been successfully created.' };
        }
      },
      error: async (err) => {
        this.uploading = false;
        this.error = await this.api.errorMessage(err, 'The ticket could not be created. Please try again.');
      },
    });
  }

  another(): void {
    this.created = null;
    this.title = this.description = '';
    this.files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    this.files = [];
    this.touched = false;
  }

  view(): void {
    if (this.created) this.router.navigate(['/app/support/tickets', this.created.number]);
  }
}

/** Browser + operating system from the user agent, in plain words (no tracking ids). */
function describeBrowser(): { name: string; os: string; text: string } {
  const ua = navigator.userAgent;
  const name = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const version = (ua.match(/(?:Edg|OPR|Chrome|Firefox|Version)\/([\d.]+)/) ?? [])[1]?.split('.')[0] ?? '';
  const os = /Windows NT 10/.test(ua) ? 'Windows 10/11' : /Windows/.test(ua) ? 'Windows' : /Android ([\d.]+)/.test(ua) ? 'Android ' + RegExp.$1 : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';

  return { name: `${name} ${version}`.trim(), os, text: `${name} ${version} on ${os}`.trim() };
}
