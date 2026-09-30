import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiDataService } from '../../core/http/api.service';
import { ApiRoutesConstants } from '../../shared/common-services/api-route-constants';
import { BranchQrPayload, decodeBranchQrPayload } from '../../shared/models/branch-qr-payload.model';
import { AppDownloadLink, detectPlatform, resolveAppDownloadLink } from '../../shared/models/app-download-link.util';

@Component({
  selector: 'app-branch-info-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './branch-info-page.html',
  styleUrl: './branch-info-page.scss',
})
export class BranchInfoPage implements OnInit {
  loading = true;
  notFound = false;
  branch: BranchQrPayload | null = null;
  downloadLink: AppDownloadLink | null = null;
  leadFormUrl: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private apiDataService: ApiDataService,
  ) { }

  ngOnInit(): void {
    // New QR codes carry everything as a "d" query param, so scanning them needs no network
    // call at all. Older/manually-typed "/branch-info/:id" links still fall back to the API.
    const encoded = this.route.snapshot.queryParamMap.get('d');
    if (encoded) {
      const payload = decodeBranchQrPayload(encoded);
      this.loading = false;
      if (payload) {
        this.applyPayload(payload);
        this.loadLeadFormUrl();
      } else {
        this.notFound = true;
      }
      return;
    }

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loading = false;
      this.notFound = true;
      return;
    }

    this.loadBranchFromApi(id);
  }

  /** The button that hands the visitor off to the next step - "Continue to Form" - needs the
   *  branch's own (plain) code plus wherever the Lead form URL setting currently points. */
  get continueUrl(): string | null {
    if (!this.leadFormUrl || !this.branch?.code) return null;
    const separator = this.leadFormUrl.includes('?') ? '&' : '?';
    return `${this.leadFormUrl}${separator}code=${encodeURIComponent(this.branch.code)}`;
  }

  private applyPayload(payload: BranchQrPayload): void {
    this.branch = payload;
    const platform = detectPlatform(navigator.userAgent || '');
    this.downloadLink = resolveAppDownloadLink(platform, payload.playstore_url, payload.appstore_url);
  }

  /** Only used on the "d" payload path - the API path already fetches settings for the store
   *  links, so it captures leadform_url from that same response instead of a second call. */
  private loadLeadFormUrl(): void {
    this.apiDataService.GET(ApiRoutesConstants.SETTINGS_GET).subscribe({
      next: (response: any) => {
        this.leadFormUrl = response?.success ? (response.data?.leadform_url ?? null) : null;
      },
      error: () => { /* leave null - the button just won't show */ },
    });
  }

  private loadBranchFromApi(id: string): void {
    this.apiDataService.GET(`${ApiRoutesConstants.ORGANIZATION_UNIT_PUBLIC_SHOW}/${id}`).subscribe({
      next: (response: any) => {
        if (response?.success && response?.data) {
          this.loadSettingsThenApply(response.data);
        } else {
          this.loading = false;
          this.notFound = true;
        }
      },
      error: (err: any) => {
        this.loading = false;
        this.notFound = true;
        console.error('Failed to load branch details:', err);
      },
    });
  }

  private loadSettingsThenApply(unit: any): void {
    this.apiDataService.GET(ApiRoutesConstants.SETTINGS_GET).subscribe({
      next: (response: any) => {
        this.loading = false;
        const settings = response?.success ? response.data : {};
        this.leadFormUrl = settings?.leadform_url ?? null;
        this.applyPayload({
          id: unit.id,
          type: unit.type ?? null,
          name: unit.name,
          code: unit.code,
          address: unit.address ?? null,
          pincode: unit.pincode ?? null,
          phone_no: unit.phone_no ?? null,
          email: unit.email ?? null,
          gst_number: unit.gst_number ?? null,
          description: unit.description ?? null,
          status: unit.status,
          playstore_url: settings?.playstore_url ?? null,
          appstore_url: settings?.appstore_url ?? null,
        });
      },
      error: () => {
        this.loading = false;
        this.applyPayload({
          id: unit.id,
          type: unit.type ?? null,
          name: unit.name,
          code: unit.code,
          address: unit.address ?? null,
          pincode: unit.pincode ?? null,
          phone_no: unit.phone_no ?? null,
          email: unit.email ?? null,
          gst_number: unit.gst_number ?? null,
          description: unit.description ?? null,
          status: unit.status,
          playstore_url: null,
          appstore_url: null,
        });
      },
    });
  }

  formatType(type: string | null | undefined): string {
    if (!type) return '';
    return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
