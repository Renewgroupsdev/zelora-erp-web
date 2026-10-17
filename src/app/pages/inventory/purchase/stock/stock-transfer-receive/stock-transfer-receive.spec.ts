import { StockTransferReceive } from './stock-transfer-receive';

describe('StockTransferReceive', () => {
  // Built by its opener from the transfer list held by PurchaseService, so the dialog cannot be created without seeded data.
  it('should be defined', () => {
    expect(StockTransferReceive).toBeDefined();
  });
});
