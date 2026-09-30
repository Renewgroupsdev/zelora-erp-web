import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiDataService } from '../../core/http/api.service';
import { ApiRoutesConstants } from '../../shared/common-services/api-route-constants';

type PageState = 'loading' | 'ready' | 'invalid';

@Component({
  selector: 'app-qr-landing-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './qr-landing-page.html',
  styleUrl: './qr-landing-page.scss',
})
export class QrLandingPage implements OnInit {
  state: PageState = 'loading';
  invalidMessage = 'This QR code could not be verified.';
  branchName: string | null = null;
  redirecting = false;

  private code: string | null = null;
  private scanId: number | null = null;
  private leadFormUrl: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private apiDataService: ApiDataService,
  ) { }

  ngOnInit(): void {
    this.code = this.route.snapshot.queryParamMap.get('code');

    if (!this.code) {
      this.state = 'invalid';
      this.invalidMessage = 'This QR code looks invalid - no code was found in the link.';
      return;
    }

    this.logScan();
  }

  /** Records the scan (branch + best-effort device data) and fetches where "Continue" should
   *  go. A scan that isn't a real/known code fails loudly (invalid state); any other failure
   *  (network, server hiccup) still lets a genuine visitor through to the form. */
  private logScan(): void {
    const body = {
      code: this.code,
      screen_width: window.screen?.width ?? null,
      screen_height: window.screen?.height ?? null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      referrer: document.referrer || null,
    };

    this.apiDataService.POST(ApiRoutesConstants.QR_SCAN_STORE, body).subscribe({
      next: (response: any) => {
        if (response?.success) {
          this.scanId = response.data?.scan_id ?? null;
          this.branchName = response.data?.branch?.name ?? null;
          this.leadFormUrl = response.data?.leadform_url ?? null;
          this.state = 'ready';
        } else {
          this.markInvalid(response?.message);
        }
      },
      error: (err: any) => {
        if (err?.status === 400) {
          this.markInvalid(err?.error?.message);
          return;
        }
        // Our tracking call failed for an unrelated reason - don't punish the visitor for it.
        this.state = 'ready';
        this.loadLeadFormUrlFallback();
      },
    });
  }

  private markInvalid(message?: string): void {
    this.state = 'invalid';
    this.invalidMessage = message || 'This QR code could not be verified.';
  }

  private loadLeadFormUrlFallback(): void {
    this.apiDataService.GET(ApiRoutesConstants.SETTINGS_GET).subscribe({
      next: (response: any) => {
        this.leadFormUrl = response?.success ? (response.data?.leadform_url ?? null) : null;
      },
      error: () => { /* leave leadFormUrl null - the button will explain it can't continue yet */ },
    });
  }

  get canContinue(): boolean {
    return !!this.leadFormUrl;
  }

  continueToForm(): void {
    if (!this.leadFormUrl || !this.code) return;

    this.redirecting = true;

    const separator = this.leadFormUrl.includes('?') ? '&' : '?';
    const redirectUrl = `${this.leadFormUrl}${separator}code=${this.code}`;

    if (this.scanId) {
      this.apiDataService.POST(`${ApiRoutesConstants.QR_SCAN_CLICK}/${this.scanId}/click`, {
        redirect_url: redirectUrl,
      }).subscribe({
        next: () => { /* best-effort - never blocks the redirect below */ },
        error: () => { /* same */ },
      });
    }

    window.location.href = redirectUrl;
  }
}
