import { LazyQL, Shared } from 'lazyql';
import { OrderDTO } from '../dto/order.dto';
import { MockDatabaseService } from '../services/mock-database.service';

@LazyQL(OrderDTO)
export class OrderModel {
  constructor(
    private id: number,
    private db: MockDatabaseService
  ) {}

  // Fast - direct return
  getEntityId(): number {
    return this.id;
  }

  // Fast - uses shared basic data
  async getIncrementId(): Promise<string> {
    const basic = await this.getBasicData();
    return basic.increment_id;
  }

  // Fast - uses shared basic data
  async getStatus(): Promise<string> {
    const basic = await this.getBasicData();
    return basic.status;
  }

  // Medium - uses shared totals data
  async getGrandTotal(): Promise<number> {
    const totals = await this.getTotalsData();
    return totals.total;
  }

  // Medium - uses shared totals data
  async getCurrencyCode(): Promise<string> {
    const totals = await this.getTotalsData();
    return totals.currency;
  }

  // Slow - customer data
  async getCustomerEmail(): Promise<string | null> {
    const customer = await this.getCustomerData();
    return customer?.email ?? null;
  }

  // Slow - customer data
  async getCustomerName(): Promise<string | null> {
    const customer = await this.getCustomerData();
    return customer?.name ?? null;
  }

  // Slow - separate call
  async getShippingMethod(): Promise<string | null> {
    return await this.db.getShippingMethod(this.id);
  }

  // Very slow - external API
  async getEstimatedDelivery(): Promise<string | null> {
    return await this.db.getEstimatedDelivery(this.id);
  }

  // Extremely slow - ML model
  async getFraudScore(): Promise<string | null> {
    return await this.db.getFraudScore(this.id);
  }

  // Shared methods - cached per instance

  @Shared()
  async getBasicData(): Promise<{ increment_id: string; status: string }> {
    const data = await this.db.getOrderBasic(this.id);
    return data || { increment_id: '', status: '' };
  }

  @Shared()
  async getTotalsData(): Promise<{ total: number; currency: string }> {
    const data = await this.db.getOrderTotals(this.id);
    return data || { total: 0, currency: 'USD' };
  }

  @Shared()
  async getCustomerData(): Promise<{ email: string; name: string } | null> {
    return await this.db.getOrderCustomer(this.id);
  }
}
