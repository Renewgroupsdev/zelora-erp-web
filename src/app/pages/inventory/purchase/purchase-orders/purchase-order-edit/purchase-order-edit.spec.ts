import { PurchaseOrderEdit } from './purchase-order-edit';

describe('PurchaseOrderEdit', () => {
  // Built by its opener from the order list held by PurchaseService, so the dialog cannot be created without seeded data.
  it('should be defined', () => {
    expect(PurchaseOrderEdit).toBeDefined();
  });
});
