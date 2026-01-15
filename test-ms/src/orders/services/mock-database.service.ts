import { Injectable } from '@nestjs/common';

// Simulated delay helper
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Mock data
const MOCK_ORDERS = [
  { id: 1, increment_id: 'ORD-001', status: 'complete', total: 150.00, currency: 'USD', customer_id: 101 },
  { id: 2, increment_id: 'ORD-002', status: 'pending', total: 299.99, currency: 'USD', customer_id: 102 },
  { id: 3, increment_id: 'ORD-003', status: 'processing', total: 75.50, currency: 'USD', customer_id: 101 },
  { id: 4, increment_id: 'ORD-004', status: 'complete', total: 1200.00, currency: 'USD', customer_id: 103 },
  { id: 5, increment_id: 'ORD-005', status: 'cancelled', total: 50.00, currency: 'USD', customer_id: 104 },
];

const MOCK_CUSTOMERS = [
  { id: 101, email: 'john@example.com', name: 'John Doe' },
  { id: 102, email: 'jane@example.com', name: 'Jane Smith' },
  { id: 103, email: 'bob@example.com', name: 'Bob Wilson' },
  { id: 104, email: 'alice@example.com', name: 'Alice Brown' },
];

@Injectable()
export class MockDatabaseService {
  private callLog: string[] = [];

  getCallLog(): string[] {
    return [...this.callLog];
  }

  clearCallLog(): void {
    this.callLog = [];
  }

  private log(method: string): void {
    const timestamp = new Date().toISOString().substr(11, 12);
    const message = `[${timestamp}] ${method}`;
    this.callLog.push(message);
    console.log(`  📊 DB: ${message}`);
  }

  // Fast query - returns order IDs
  async getOrderIds(): Promise<number[]> {
    this.log('getOrderIds()');
    await delay(10); // Very fast
    return MOCK_ORDERS.map(o => o.id);
  }

  // Fast query - basic order data
  async getOrderBasic(id: number): Promise<{ increment_id: string; status: string } | null> {
    this.log(`getOrderBasic(${id})`);
    await delay(20); // Fast
    const order = MOCK_ORDERS.find(o => o.id === id);
    if (!order) return null;
    return { increment_id: order.increment_id, status: order.status };
  }

  // Medium query - order totals
  async getOrderTotals(id: number): Promise<{ total: number; currency: string } | null> {
    this.log(`getOrderTotals(${id})`);
    await delay(50); // Medium
    const order = MOCK_ORDERS.find(o => o.id === id);
    if (!order) return null;
    return { total: order.total, currency: order.currency };
  }

  // Slow query - customer info (simulates JOIN)
  async getOrderCustomer(id: number): Promise<{ email: string; name: string } | null> {
    this.log(`getOrderCustomer(${id})`);
    await delay(100); // Slow - simulates JOIN
    const order = MOCK_ORDERS.find(o => o.id === id);
    if (!order) return null;
    const customer = MOCK_CUSTOMERS.find(c => c.id === order.customer_id);
    return customer ? { email: customer.email, name: customer.name } : null;
  }

  // Slow query - shipping info (simulates external lookup)
  async getShippingMethod(id: number): Promise<string | null> {
    this.log(`getShippingMethod(${id})`);
    await delay(150); // Slow - simulates external API
    const methods = ['Standard Shipping', 'Express Delivery', 'Next Day Air', 'Ground'];
    return methods[id % methods.length];
  }

  // Very slow - external API call for delivery estimate
  async getEstimatedDelivery(id: number): Promise<string | null> {
    this.log(`getEstimatedDelivery(${id}) - EXPENSIVE!`);
    await delay(500); // Very slow - external API
    const days = 3 + (id % 7);
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  }

  // Extremely slow - fraud detection (simulates ML model)
  async getFraudScore(id: number): Promise<string | null> {
    this.log(`getFraudScore(${id}) - VERY EXPENSIVE!`);
    await delay(1000); // Extremely slow - ML model
    const scores = ['Low Risk', 'Medium Risk', 'High Risk', 'Very Low Risk'];
    return scores[id % scores.length];
  }

  // Combined query - all order details (what you'd do without LazyQL)
  async getFullOrderDetails(id: number): Promise<Record<string, unknown> | null> {
    this.log(`getFullOrderDetails(${id}) - FETCHING EVERYTHING!`);

    const [basic, totals, customer, shipping, delivery, fraud] = await Promise.all([
      this.getOrderBasic(id),
      this.getOrderTotals(id),
      this.getOrderCustomer(id),
      this.getShippingMethod(id),
      this.getEstimatedDelivery(id),
      this.getFraudScore(id),
    ]);

    if (!basic) return null;

    return {
      entity_id: id,
      ...basic,
      ...totals,
      customer_email: customer?.email,
      customer_name: customer?.name,
      shipping_method: shipping,
      estimated_delivery: delivery,
      fraud_score: fraud,
    };
  }
}
