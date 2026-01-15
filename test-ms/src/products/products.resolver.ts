import { Resolver, Query, Args, Int } from '@nestjs/graphql';
import { ProductDTO, ProductsResponseDTO } from './dto/product.dto';
import { ProductModel } from './models/product.model';
import { MockProductService } from './services/mock-product.service';

@Resolver(() => ProductDTO)
export class ProductsResolver {
  constructor(private readonly productService: MockProductService) {}

  @Query(() => ProductDTO, { nullable: true, description: 'Get a single product by ID - LazyQL' })
  async product(@Args('id', { type: () => Int }) id: number): Promise<ProductDTO | null> {
    console.log(`\n🛍️  Query: product(id: ${id})`);
    console.log('────────────────────────────────────────');

    // Return a LazyQL proxy - only requested fields will be fetched
    return new ProductModel(id, this.productService) as unknown as ProductDTO;
  }

  @Query(() => ProductsResponseDTO, { description: 'Get all products - LazyQL' })
  async products(): Promise<ProductsResponseDTO> {
    console.log('\n🛍️  Query: products()');
    console.log('────────────────────────────────────────');

    const productIds = await this.productService.getProductIds();

    // Return array of LazyQL proxies
    const items = productIds.map(
      id => new ProductModel(id, this.productService) as unknown as ProductDTO
    );

    return {
      items,
      total_count: productIds.length,
    };
  }

  // Traditional approach for comparison
  @Query(() => ProductDTO, { nullable: true, description: 'Get product - TRADITIONAL (fetches everything)' })
  async productTraditional(@Args('id', { type: () => Int }) id: number): Promise<ProductDTO | null> {
    console.log(`\n🛍️  Query: productTraditional(id: ${id}) - TRADITIONAL APPROACH`);
    console.log('────────────────────────────────────────');

    // Traditional approach - fetch EVERYTHING upfront
    const [basic, pricing, category, inventory, score] = await Promise.all([
      this.productService.getProductBasic(id),
      this.productService.getProductPricing(id),
      this.productService.getProductCategory(id),
      this.productService.getProductInventory(id),
      this.productService.getRecommendationScore(id),
    ]);

    if (!basic) return null;

    return {
      id,
      sku: basic.sku,
      name: basic.name,
      description: basic.description ?? undefined,
      price: pricing?.price ?? 0,
      currency: pricing?.currency,
      category: category ?? undefined,
      inventory: inventory ?? undefined,
      recommendation_score: score ?? undefined,
    };
  }
}
