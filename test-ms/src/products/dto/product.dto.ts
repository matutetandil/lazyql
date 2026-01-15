import { ObjectType, Field, Int, Float } from '@nestjs/graphql';

@ObjectType({ description: 'Product category' })
export class CategoryDTO {
  @Field(() => Int)
  id: number;

  @Field()
  name: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => Int)
  product_count: number;
}

@ObjectType({ description: 'Product inventory information' })
export class InventoryDTO {
  @Field(() => Int)
  quantity: number;

  @Field()
  warehouse_location: string;

  @Field({ nullable: true })
  restock_date?: string;
}

@ObjectType({ description: 'Product information' })
export class ProductDTO {
  @Field(() => Int)
  id: number;

  @Field()
  sku: string;

  @Field()
  name: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => Float)
  price: number;

  @Field({ nullable: true })
  currency?: string;

  // Nested object - demonstrates lazy loading of related data
  @Field(() => CategoryDTO, { nullable: true })
  category?: CategoryDTO;

  // Nested object - demonstrates expensive data
  @Field(() => InventoryDTO, { nullable: true })
  inventory?: InventoryDTO;

  // Computed expensive field
  @Field({ nullable: true })
  recommendation_score?: string;
}

@ObjectType({ description: 'Paginated products response' })
export class ProductsResponseDTO {
  @Field(() => [ProductDTO])
  items: ProductDTO[];

  @Field(() => Int)
  total_count: number;
}
