import { Resolver, Query, Args, Int } from '@nestjs/graphql';
import { OrderDTO, OrdersResponseDTO } from './dto/order.dto';
import { OrderModel } from './models/order.model';
import { MockDatabaseService } from './services/mock-database.service';

@Resolver(() => OrderDTO)
export class OrdersResolver {
  constructor(private readonly db: MockDatabaseService) {}

  @Query(() => OrderDTO, { name: 'order', description: 'Get a single order by ID' })
  async getOrder(@Args('id', { type: () => Int }) id: number): Promise<OrderModel> {
    console.log(`\n📦 Query: order(id: ${id})`);
    console.log('─'.repeat(40));
    this.db.clearCallLog();

    // With LazyQL: just return the model instance
    // Only requested fields will trigger their getters
    return new OrderModel(id, this.db);
  }

  @Query(() => OrdersResponseDTO, { name: 'orders', description: 'Get all orders' })
  async getOrders(): Promise<{ items: OrderModel[]; total_count: number }> {
    console.log(`\n📦 Query: orders()`);
    console.log('─'.repeat(40));
    this.db.clearCallLog();

    const ids = await this.db.getOrderIds();

    return {
      // With LazyQL: return array of model instances
      items: ids.map(id => new OrderModel(id, this.db)),
      total_count: ids.length,
    };
  }

  // For comparison: traditional approach that fetches everything
  @Query(() => OrderDTO, { name: 'orderTraditional', description: 'Traditional approach - fetches ALL data' })
  async getOrderTraditional(@Args('id', { type: () => Int }) id: number): Promise<Record<string, unknown>> {
    console.log(`\n📦 Query: orderTraditional(id: ${id}) - TRADITIONAL APPROACH`);
    console.log('─'.repeat(40));
    this.db.clearCallLog();

    // Traditional: fetch everything, even if client only needs 2 fields
    const order = await this.db.getFullOrderDetails(id);
    return order || {};
  }
}
