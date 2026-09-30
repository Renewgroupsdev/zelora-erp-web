import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as QRCode from 'qrcode';
import { NavLayoutService } from '../../services/nav-layout.service';
import { IdleService } from '../../core/idle-service/idle.service';
import { ApiDataService } from '../../core/http/api.service';
import { ApiRoutesConstants } from '../../shared/common-services/api-route-constants';
import { ToastService } from '../../shared/common-services/toast.service';

interface OrganizationUnitOption {
  id: number;
  name: string;
  code: string;
  /** Encrypted stand-in for `code` (from the backend's `qr_token` accessor) - this is what
   *  actually goes in the QR, so scanning it never exposes the real branch code in plain text. */
  qrToken: string;
}

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage implements OnInit {
  readonly idlePresets = [5, 15, 30, 60];

  constructor(
    public navLayout: NavLayoutService,
    public idleService: IdleService,
    private apiDataService: ApiDataService,
    private toast: ToastService,
  ) { }

  // App download links
  playstoreUrl = '';
  appstoreUrl = '';
  savingStoreUrls = false;

  // Lead form URL (base URL the mobile app opens when it scans a branch QR)
  leadFormUrl = '';
  savingLeadFormUrl = false;

  // Public App URL - what the QR itself points at (our own /scan page). Explicit and
  // saved, instead of trusting window.location.origin, because generating the QR from an
  // admin browser open on "localhost" would otherwise bake in an address no phone can reach.
  appBaseUrl = '';
  savingAppBaseUrl = false;

  // Organization unit QR code
  branches: OrganizationUnitOption[] = [];
  loadingBranches = false;
  selectedBranchId: number | null = null;
  generatingQr = false;
  qrDataUrl: string | null = null;
  qrTargetUrl: string | null = null;

  ngOnInit(): void {
    this.loadSettings();
    this.loadBranches();
  }

  setIdleMinutes(minutes: number): void {
    if (minutes > 0) {
      this.idleService.setIdleMinutes(minutes);
    }
  }

  private loadSettings(): void {
    this.apiDataService.GET(ApiRoutesConstants.SETTINGS_GET).subscribe({
      next: (response: any) => {
        const settings = response?.success ? response.data : {};
        this.playstoreUrl = settings?.playstore_url ?? '';
        this.appstoreUrl = settings?.appstore_url ?? '';
        this.leadFormUrl = settings?.leadform_url ?? '';
        this.appBaseUrl = settings?.app_base_url ?? '';
      },
      error: (err: any) => {
        console.error('Failed to load settings:', err);
      },
    });
  }

  /** What the QR actually gets built against: the saved Public App URL if set, otherwise
   *  wherever this page itself happens to be open right now. */
  get effectiveAppOrigin(): string {
    return this.appBaseUrl.trim().replace(/\/+$/, '') || window.location.origin;
  }

  /** "localhost"/127.0.0.1 only ever means the device itself - a QR built against either
   *  will never open on a phone, no matter how it's reached. */
  get originLooksLocal(): boolean {
    try {
      const host = new URL(this.effectiveAppOrigin).hostname;
      return host === 'localhost' || host === '127.0.0.1';
    } catch {
      return false;
    }
  }

  saveAppBaseUrl(): void {
    this.savingAppBaseUrl = true;
    const payload = { settings: { app_base_url: this.appBaseUrl.trim() } };

    this.apiDataService.PUT(ApiRoutesConstants.SETTINGS_UPDATE, payload).subscribe({
      next: (response: any) => {
        this.savingAppBaseUrl = false;
        if (response?.success !== false) {
          this.toast.success('Public App URL saved');
        } else {
          this.toast.error(response?.message || 'Failed to save Public App URL.');
        }
      },
      error: (err: any) => {
        this.savingAppBaseUrl = false;
        this.toast.error(err?.error?.message || 'Failed to save Public App URL.');
        console.error('Failed to save Public App URL:', err);
      },
    });
  }

  saveStoreUrls(): void {
    this.savingStoreUrls = true;
    const payload = {
      settings: {
        playstore_url: this.playstoreUrl.trim(),
        appstore_url: this.appstoreUrl.trim(),
      },
    };

    this.apiDataService.PUT(ApiRoutesConstants.SETTINGS_UPDATE, payload).subscribe({
      next: (response: any) => {
        this.savingStoreUrls = false;
        if (response?.success !== false) {
          this.toast.success('App store links saved');
        } else {
          this.toast.error(response?.message || 'Failed to save app store links.');
        }
      },
      error: (err: any) => {
        this.savingStoreUrls = false;
        this.toast.error(err?.error?.message || 'Failed to save app store links.');
        console.error('Failed to save app store links:', err);
      },
    });
  }

  saveLeadFormUrl(): void {
    this.savingLeadFormUrl = true;
    const payload = { settings: { leadform_url: this.leadFormUrl.trim() } };

    this.apiDataService.PUT(ApiRoutesConstants.SETTINGS_UPDATE, payload).subscribe({
      next: (response: any) => {
        this.savingLeadFormUrl = false;
        if (response?.success !== false) {
          this.toast.success('Lead form URL saved');
        } else {
          this.toast.error(response?.message || 'Failed to save lead form URL.');
        }
      },
      error: (err: any) => {
        this.savingLeadFormUrl = false;
        this.toast.error(err?.error?.message || 'Failed to save lead form URL.');
        console.error('Failed to save lead form URL:', err);
      },
    });
  }

  private loadBranches(): void {
    this.loadingBranches = true;
    this.apiDataService.GetAllPages(ApiRoutesConstants.Branch_List_Options).subscribe({
      next: (units: any[]) => {
        this.loadingBranches = false;
        this.branches = (units ?? []).map((unit: any) => ({
          id: unit.id,
          name: unit.name,
          code: unit.code,
          qrToken: unit.qr_token,
        }));

        if (!this.selectedBranchId && this.branches.length) {
          this.selectedBranchId = this.branches[0].id;
        }
      },
      error: (err: any) => {
        this.loadingBranches = false;
        this.toast.error('Failed to load organization units.');
        console.error('Failed to load organization units:', err);
      },
    });
  }

  async generateQr(): Promise<void> {
    const branch = this.branches.find((b) => b.id === this.selectedBranchId);
    if (!branch) {
      this.toast.warning('Select an organization unit first.');
      return;
    }

    const baseUrl = this.leadFormUrl.trim();
    if (!baseUrl) {
      this.toast.warning('Enter the lead form URL first.');
      return;
    }

    if (!branch.qrToken) {
      this.toast.error('This branch has no encrypted code yet. Try reloading the page.');
      return;
    }

    this.generatingQr = true;
    this.qrDataUrl = null;

    // The QR points at our own /scan page, not the lead form directly - that page logs the
    // scan (device/branch data) before handing the visitor on to the lead form URL above.
    // Only the encrypted branch code travels in the QR itself; only our backend (same
    // APP_KEY) can decrypt it back to the real branch code. It's already URL-safe (the
    // backend urlencodes it), so it's appended as-is.
    const targetUrl = `${this.effectiveAppOrigin}/scan?code=${branch.qrToken}`;
    this.qrTargetUrl = targetUrl;

    try {
      this.qrDataUrl = await QRCode.toDataURL(targetUrl, {
        width: 320,
        margin: 2,
        errorCorrectionLevel: 'M',
      });
    } catch (err) {
      this.toast.error('Failed to generate QR code.');
      console.error('Failed to generate QR code:', err);
    } finally {
      this.generatingQr = false;
    }
  }

  downloadQr(): void {
    if (!this.qrDataUrl) return;

    const branch = this.branches.find((b) => b.id === this.selectedBranchId);
    const fileName = `qr-${branch?.code ?? this.selectedBranchId}.png`;

    const link = document.createElement('a');
    link.href = this.qrDataUrl;
    link.download = fileName;
    link.click();
  }
}
