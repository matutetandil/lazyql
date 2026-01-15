import { LazyQL, Shared } from 'lazyql';
import { ProductDTO, CategoryDTO, InventoryDTO } from '../dto/product.dto';
import { MockProductService } from '../services/mock-product.service';

@LazyQL(ProductDTO)
export class ProductModel {
  constructor(
    private productId: number,
    private productService: MockProductService
  ) {}

  // Fast - direct return
  getId(): number {
    return this.productId;
  }

  // Fast - uses shared basic data
  async getSku(): Promise<string> {
    const basic = await this.getBasicData();
    return basic.sku;
  }

  // Fast - uses shared basic data
  async getName(): Promise<string> {
    const basic = await this.getBasicData();
    return basic.name;
  }

  // Fast - uses shared basic data
  async getDescription(): Promise<string | null> {
    const basic = await this.getBasicData();
    return basic.description ?? null;
  }

  // Medium - uses shared pricing data
  async getPrice(): Promise<number> {
    const pricing = await this.getPricingData();
    return pricing.price;
  }

  // Medium - uses shared pricing data
  async getCurrency(): Promise<string> {
    const pricing = await this.getPricingData();
    return pricing.currency;
  }

  // Slow - returns nested CategoryDTO
  // Demonstrates nested object resolution
  async getCategory(): Promise<CategoryDTO | null> {
    const category = await this.productService.getProductCategory(this.productId);
    return category;
  }

  // Very slow - returns nested InventoryDTO
  // Demonstrates expensive nested data
  async getInventory(): Promise<InventoryDTO | null> {
    const inventory = await this.productService.getProductInventory(this.productId);
    return inventory;
  }

  // Extremely slow - ML recommendation
  async getRecommendationScore(): Promise<string | null> {
    return await this.productService.getRecommendationScore(this.productId);
  }

  // Shared methods - cached per instance

  @Shared()
  async getBasicData(): Promise<{ sku: string; name: string; description?: string }> {
    const data = await this.productService.getProductBasic(this.productId);
    return data || { sku: '', name: '' };
  }

  @Shared()
  async getPricingData(): Promise<{ price: number; currency: string }> {
    const data = await this.productService.getProductPricing(this.productId);
    return data || { price: 0, currency: 'USD' };
  }
}
