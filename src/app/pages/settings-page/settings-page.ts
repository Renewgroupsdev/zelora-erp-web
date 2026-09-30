import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as QRCode from 'qrcode';
import { NavLayoutService } from '../../services/nav-layout.service';
import { IdleService } from '../../core/idle-service/idle.service';
import { ApiDataService } from '../../core/http/api.service';
import { ApiRoutesConstants } from '../../shared/common-services/api-route-constants';
import { ToastService } from '../../shared/common-services/toast.service';
import { BranchQrPayload, encodeBranchQrPayload } from '../../shared/models/branch-qr-payload.model';

interface OrganizationUnitOption {
  id: number;
  type: string | null;
  name: string;
  code: string;
  address: string | null;
  pincode: string | null;
  phone_no: string | null;
  email: string | null;
  gst_number: string | null;
  description: string | null;
  status: number;
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

  // App download links (used by the branch QR page to send visitors to the right store)
  playstoreUrl = '';
  appstoreUrl = '';
  savingStoreUrls = false;

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

  /** The QR only works from another device if this origin is actually reachable from it -
   *  "localhost"/127.0.0.1 never is, so flag it instead of generating a QR that will always 404. */
  get originLooksLocal(): boolean {
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1';
  }

  private loadSettings(): void {
    this.apiDataService.GET(ApiRoutesConstants.SETTINGS_GET).subscribe({
      next: (response: any) => {
        const settings = response?.success ? response.data : {};
        this.playstoreUrl = settings?.playstore_url ?? '';
        this.appstoreUrl = settings?.appstore_url ?? '';
      },
      error: (err: any) => {
        console.error('Failed to load settings:', err);
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

  private loadBranches(): void {
    this.loadingBranches = true;
    this.apiDataService.GetAllPages(ApiRoutesConstants.Branch_List_Options).subscribe({
      next: (units: any[]) => {
        this.loadingBranches = false;
        this.branches = (units ?? []).map((unit: any) => ({
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

    this.generatingQr = true;
    this.qrDataUrl = null;

    // Everything the landing page needs travels inside the QR itself - no API call happens
    // when it's scanned, so it works regardless of what host/network the phone is on.
    const payload: BranchQrPayload = {
      id: branch.id,
      type: branch.type,
      name: branch.name,
      code: branch.code,
      address: branch.address,
      pincode: branch.pincode,
      phone_no: branch.phone_no,
      email: branch.email,
      gst_number: branch.gst_number,
      description: branch.description,
      status: branch.status,
      playstore_url: this.playstoreUrl.trim() || null,
      appstore_url: this.appstoreUrl.trim() || null,
    };

    const targetUrl = `${window.location.origin}/branch-info?d=${encodeBranchQrPayload(payload)}`;
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
