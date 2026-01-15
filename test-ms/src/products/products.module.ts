import { Module } from '@nestjs/common';
import { ProductsResolver } from './products.resolver';
import { MockProductService } from './services/mock-product.service';

@Module({
  providers: [ProductsResolver, MockProductService],
})
export class ProductsModule {}
