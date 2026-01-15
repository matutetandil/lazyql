import { ObjectType, Field, Int, Float } from '@nestjs/graphql';

@ObjectType({ description: 'Order summary' })
export class OrderDTO {
  @Field(() => Int)
  entity_id: number;

  @Field()
  increment_id: string;

  @Field()
  status: string;

  @Field(() => Float)
  grand_total: number;

  @Field()
  currency_code: string;

  @Field({ nullable: true })
  customer_email?: string;

  @Field({ nullable: true })
  customer_name?: string;

  @Field({ nullable: true })
  shipping_method?: string;

  // This field is "expensive" - requires external API call
  @Field({ nullable: true })
  estimated_delivery?: string;

  // This field is "very expensive" - requires complex computation
  @Field({ nullable: true })
  fraud_score?: string;
}

@ObjectType({ description: 'Paginated orders response' })
export class OrdersResponseDTO {
  @Field(() => [OrderDTO])
  items: OrderDTO[];

  @Field(() => Int)
  total_count: number;
}
