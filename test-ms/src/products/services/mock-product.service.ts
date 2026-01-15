import { Injectable } from '@nestjs/common';
import { CategoryDTO, InventoryDTO } from '../dto/product.dto';

// Mock product data
const PRODUCTS = new Map([
  [1, { sku: 'SKU-001', name: 'Laptop Pro', description: 'High-performance laptop', categoryId: 1 }],
  [2, { sku: 'SKU-002', name: 'Wireless Mouse', description: 'Ergonomic wireless mouse', categoryId: 2 }],
  [3, { sku: 'SKU-003', name: 'USB-C Cable', description: null, categoryId: 2 }],
  [4, { sku: 'SKU-004', name: 'Monitor 4K', description: '32-inch 4K display', categoryId: 1 }],
  [5, { sku: 'SKU-005', name: 'Keyboard Mechanical', description: 'RGB mechanical keyboard', categoryId: 2 }],
]);

const PRICING = new Map([
  [1, { price: 1299.99, currency: 'USD' }],
  [2, { price: 49.99, currency: 'USD' }],
  [3, { price: 19.99, currency: 'USD' }],
  [4, { price: 599.99, currency: 'USD' }],
  [5, { price: 149.99, currency: 'USD' }],
]);

const CATEGORIES = new Map([
  [1, { id: 1, name: 'Computers', description: 'Laptops and monitors', product_count: 2 }],
  [2, { id: 2, name: 'Accessories', description: 'Peripherals and cables', product_count: 3 }],
]);

const INVENTORY = new Map<number, InventoryDTO>([
  [1, { quantity: 15, warehouse_location: 'A1-B2', restock_date: '2026-02-15' }],
  [2, { quantity: 150, warehouse_location: 'C3-D4' }],
  [3, { quantity: 500, warehouse_location: 'E5-F6' }],
  [4, { quantity: 8, warehouse_location: 'A1-B3', restock_date: '2026-01-25' }],
  [5, { quantity: 45, warehouse_location: 'C3-D5' }],
]);

function logDbCall(method: string, id?: number) {
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
  const idStr = id !== undefined ? `(${id})` : '()';
  console.log(`  📦 DB: [${timestamp}] ${method}${idStr}`);
}

@Injectable()
export class MockProductService {
  async getProductIds(): Promise<number[]> {
    logDbCall('getProductIds');
    await this.delay(10);
    return Array.from(PRODUCTS.keys());
  }

  async getProductBasic(id: number): Promise<{ sku: string; name: string; description?: string } | null> {
    logDbCall('getProductBasic', id);
    await this.delay(20);
    const product = PRODUCTS.get(id);
    return product ? { sku: product.sku, name: product.name, description: product.description ?? undefined } : null;
  }

  async getProductPricing(id: number): Promise<{ price: number; currency: string } | null> {
    logDbCall('getProductPricing', id);
    await this.delay(30);
    return PRICING.get(id) || null;
  }

  async getProductCategory(id: number): Promise<CategoryDTO | null> {
    logDbCall('getProductCategory', id);
    await this.delay(50);
    const product = PRODUCTS.get(id);
    if (!product) return null;
    const category = CATEGORIES.get(product.categoryId);
    return category || null;
  }

  async getProductInventory(id: number): Promise<InventoryDTO | null> {
    logDbCall('getProductInventory - SLOW', id);
    await this.delay(200); // Simulating slow inventory system
    return INVENTORY.get(id) || null;
  }

  async getRecommendationScore(id: number): Promise<string | null> {
    logDbCall('getRecommendationScore - ML MODEL', id);
    await this.delay(500); // Simulating ML model inference
    // Random score based on product id
    const scores = ['High', 'Medium', 'Low'];
    return scores[id % 3];
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
