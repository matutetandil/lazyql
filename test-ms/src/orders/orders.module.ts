import { Module } from '@nestjs/common';
import { OrdersResolver } from './orders.resolver';
import { MockDatabaseService } from './services/mock-database.service';

@Module({
  providers: [OrdersResolver, MockDatabaseService],
})
export class OrdersModule {}
