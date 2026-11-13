import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import { CommonDetailCard } from '../../../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../../shared/components/common-table-card/common-table-card';
import { LocalListBase } from '../../../../shared/components/local-list-base';
import { PurchaseService } from '../../../../shared/common-services/purchase.service';
import { DetailCardData, FilterOption, QuickAction, TableColumn, TableRow } from '../../../../shared/models/common-components.model';
import { LowStockRow, PurchaseOrder, inr } from '../../../../shared/models/purchase.model';
import { escapeHtml } from '../../../../shared/utils/export.util';
import { PurchaseTabs } from '../purchase-tabs/purchase-tabs';
import { LowStockOrderData, LowStockOrderForm } from './low-stock-order-form/low-stock-order-form';

/**
 * Low Stock Replenishment (Head Office / Admin / Super Admin): Central Store products under the low-stock level, laid out like
 * the Purchase Orders tab (stat cards, filter card, common table).
 *
 * "Create Purchase Order" (or the cart icon on a row) opens the order form: the vendor dropdown of every product lists the
 * least vendor price first and pre-selects it. One purchase order is raised per vendor - no request / quote step - and its
 * invoice goes to the vendor by e-mail + WhatsApp. The orders then show in the Purchase Orders tab.
 */
@Component({
  selector: 'app-low-stock-replenishment',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard, PurchaseTabs],
  templateUrl: './low-stock-replenishment.html',
  styleUrl: '../../../../shared/styles/erp-page.scss',
})
export class LowStockReplenishment extends LocalListBase implements OnInit {
  private readonly purchase = inject(PurchaseService);
  private readonly router = inject(Router);
  protected readonly noun = 'low-stock products';
  /** status = Out of Stock / Low Stock, source = least-price vendor */
  protected override filterFields = { status: 'status', source: 'vendor', branch: ['branch'] };

  readonly items = signal<LowStockRow[]>([]);
  readonly vendors = signal<{ id: number; name: string }[]>([]);
  readonly threshold = signal(10);
  readonly loading = signal(true);

  readonly pageFilters = computed<FilterOption[]>(() => [
    { key: 'status', label: 'Stock', options: ['Out of Stock', 'Low Stock'] },
    { key: 'source', label: 'Least-price vendor', options: [...new Set(this.items().map(r => r.vendorName).filter((v): v is string => !!v))].sort() },
  ]);

  columns: TableColumn[] = [
    { key: 'product', header: 'Product', width: '17%' },
    { key: 'code', header: 'Code', width: '8%' },
    { key: 'stock', header: 'Central Stock', width: '8%' },
    { key: 'onOrder', header: 'On Order', width: '7%' },
    { key: 'suggested', header: 'Suggested Qty', width: '8%' },
    { key: 'vendor', header: 'Least-Price Vendor', width: '15%' },
    { key: 'price', header: 'Least Price (incl. GST)', width: '11%' },
    { key: 'quotes', header: 'Vendors Priced', width: '8%' },
    { key: 'status', header: 'Status', type: 'badge', width: '9%' },
    { key: 'actions', header: 'Action', type: 'quickActions', width: '9%', sortable: false },
  ];

  override sortActive = 'stock';
  override sortDirection: 'asc' | 'desc' = 'asc';

  readonly stats = computed<DetailCardData[]>(() => {
    const rows = this.items();
    const out = rows.filter(r => r.out).length;
    const value = rows.reduce((s, r) => s + r.suggestedQty * (r.quotes[0]?.amount ?? r.unitPrice * (1 + r.gstPercent / 100)), 0);
    return [
      { label: `Products below ${this.threshold()}`, value: rows.length, icon: 'bi-graph-down-arrow', iconVariant: 'orange' },
      { label: 'Out of Stock', value: out, icon: 'bi-x-octagon', iconVariant: 'purple' },
      { label: 'Units on Order', value: rows.reduce((s, r) => s + r.onOrder, 0), icon: 'bi-truck', iconVariant: 'blue' },
      { label: 'Suggested Order Value', value: inr(value), icon: 'bi-currency-rupee', iconVariant: 'green' },
    ];
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    const res = await this.purchase.lowStockOrders();
    this.items.set(res.rows);
    this.vendors.set(res.vendors);
    this.threshold.set(res.threshold);
    this.loading.set(false);
  }

  protected allRows(): TableRow[] {
    return this.items().map(r => {
      const best = r.quotes[0];
      const actions: QuickAction[] = [
        { key: 'order', icon: 'bi-cart-plus-fill', label: 'Create purchase order', variant: 'primary', fixedIcon: true, fixedLabel: true },
        { key: 'prices', icon: 'bi-list-ol', label: 'Compare vendor prices', fixedIcon: true, fixedLabel: true },
      ];
      return {
        id: r.productId,
        product: r.productName,
        code: r.productCode || '-',
        stock: r.out ? '0' : String(r.qty),
        __stock: r.qty,
        onOrder: r.onOrder ? String(r.onOrder) : '-',
        __onOrder: r.onOrder,
        suggested: String(r.suggestedQty),
        __suggested: r.suggestedQty,
        vendor: r.vendorName ?? '-',
        price: best ? inr(best.amount) : inr(r.unitPrice * (1 + r.gstPercent / 100)),
        __price: best?.amount ?? r.unitPrice,
        quotes: String(r.quotes.length),
        __quotes: r.quotes.length,
        status: r.out ? 'Out of Stock' : 'Low Stock',
        searchText: `${r.productName} ${r.productCode} ${r.vendorName ?? ''} ${r.quotes.map(q => q.vendorName).join(' ')}`,
        actions,
      };
    });
  }

  openCreate(productIds: string[] = []): void {
    if (!this.items().length) {
      void Swal.fire({ icon: 'info', title: 'Nothing to replenish', text: `Every Central Store product is at or above ${this.threshold()} units.`, confirmButtonColor: '#0f5c4d' });
      return;
    }
    const data: LowStockOrderData = { rows: this.items(), vendors: this.vendors(), threshold: this.threshold(), productIds };
    this.openDialog<LowStockOrderForm, PurchaseOrder[]>(LowStockOrderForm, data, '1180px')
      .afterClosed()
      .subscribe(orders => {
        // the new orders are worked from the Purchase Orders tab (invoice, price revision, inward)
        if (orders?.length) void this.router.navigate(['/app/inventory/purchase-orders']);
      });
  }

  onQuickAction(event: { row: TableRow; action: string }): void {
    const row = this.items().find(r => r.productId === event.row['id']);
    if (!row) return;
    if (event.action === 'order') return this.openCreate([row.productId]);
    if (event.action === 'prices') this.showPrices(row);
  }

  /** Every vendor price of the product, least first. */
  private showPrices(r: LowStockRow): void {
    const e = escapeHtml;
    const body = r.quotes.length
      ? `<table style="width:100%;border-collapse:collapse;font-size:13px;text-align:left">
          <thead><tr><th style="padding:6px">#</th><th style="padding:6px">Vendor</th><th style="padding:6px">Price from</th><th style="padding:6px;text-align:right">Unit</th><th style="padding:6px;text-align:right">GST</th><th style="padding:6px;text-align:right">Incl. GST</th></tr></thead>
          <tbody>${r.quotes.map((q, i) => `<tr style="border-top:1px solid #e5ebe8;${i === 0 ? 'font-weight:700;color:#15803d' : ''}">
            <td style="padding:6px">${i + 1}</td><td style="padding:6px">${e(q.vendorName)}${i === 0 ? ' (least)' : ''}${q.vendorId === r.usualVendorId ? ' <small>(usual)</small>' : ''}</td>
            <td style="padding:6px">${e(q.source)}${q.date ? ` <small>${e(q.date)}</small>` : ''}</td>
            <td style="padding:6px;text-align:right">${e(inr(q.unitPrice))}</td><td style="padding:6px;text-align:right">${q.gstPercent}%</td>
            <td style="padding:6px;text-align:right">${e(inr(q.amount))}</td></tr>`).join('')}</tbody></table>`
      : '<p>No vendor has priced this product yet - the product master price is used.</p>';
    void Swal.fire({
      title: e(r.productName), html: body, width: 760, showCancelButton: true,
      confirmButtonText: '<i class="bi bi-cart-plus-fill"></i> Create purchase order', cancelButtonText: 'Close', confirmButtonColor: '#0f5c4d',
    }).then(res => { if (res.isConfirmed) this.openCreate([r.productId]); });
  }
}
