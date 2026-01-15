# LazyQL

[![npm version](https://img.shields.io/npm/v/lazyql.svg)](https://www.npmjs.com/package/lazyql)
[![CI](https://github.com/matutetandil/lazyql/actions/workflows/ci.yml/badge.svg)](https://github.com/matutetandil/lazyql/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A lightweight TypeScript library for building truly lazy GraphQL resolvers.

## What is LazyQL?

LazyQL helps you build GraphQL APIs where **only the requested fields are computed**. Define your data as classes with getter methods, and LazyQL ensures each getter runs only when its field is actually requested.

## The DTO-Getter Connection

In GraphQL (especially with NestJS), you define **DTOs** (Data Transfer Objects) that describe the shape of your responses:

```typescript
// Your GraphQL ObjectType (DTO)
@ObjectType()
class OrderDTO {
  @Field(() => Int)
  entity_id: number;

  @Field()
  status: string;

  @Field({ nullable: true })
  customer_email?: string;

  @Field({ nullable: true })
  shipping_address?: string;
}
```

**LazyQL connects this DTO to your model class.** Each field in the DTO maps to a getter method:

| DTO Field | Getter Method | Why? |
|-----------|---------------|------|
| `entity_id` | `getEntityId()` | `snake_case` → `getCamelCase` |
| `status` | `getStatus()` | |
| `customer_email` | `getCustomerEmail()` | |
| `shipping_address` | `getShippingAddress()` | |

The `@LazyQL(OrderDTO)` decorator tells LazyQL to validate that your class has getters for all required DTO fields, and creates a Proxy that intercepts field access to call the right getter.

## Quick Example

```typescript
import { LazyQL, Shared } from 'lazyql';

@LazyQL(OrderDTO)  // Links this class to the DTO above
class Order {
  constructor(private id: number, private db: Database) {}

  getEntityId() {
    return this.id;
  }

  getStatus() {
    return this.db.getOrderStatus(this.id);
  }

  async getCustomerEmail() {
    return await this.db.getCustomerEmail(this.id);
  }

  async getShippingAddress() {
    return await this.db.getShippingAddress(this.id);
  }
}

// In your resolver
async order(id: number) {
  return new Order(id, this.db);
}
```

When a client requests `{ entity_id, status }`:
- `getEntityId()` runs
- `getStatus()` runs
- `getCustomerEmail()` does not run
- `getShippingAddress()` does not run

## Installation

```bash
npm install lazyql reflect-metadata
```

Import `reflect-metadata` at your application entry point:

```typescript
import 'reflect-metadata';
```

## Core Concepts

### `@LazyQL(DTO)`

The main decorator that enables lazy resolution for a class.

```typescript
@LazyQL(ProductDTO)
class Product {
  constructor(private id: number, private db: Database) {}

  getName() { return this.db.getProductName(this.id); }
  getPrice() { return this.db.getProductPrice(this.id); }
  getDescription() { return this.db.getProductDescription(this.id); }
}
```

### `@Shared()`

Cache expensive operations that multiple getters depend on.

```typescript
@LazyQL(OrderDTO)
class Order {
  getGrandTotal() {
    const details = this.getOrderDetails();
    return details.grand_total;
  }

  getCurrencyCode() {
    const details = this.getOrderDetails();
    return details.currency_code;
  }

  @Shared()
  getOrderDetails() {
    // Runs only once per instance, even if both fields are requested
    return this.db.getFullOrder(this.id);
  }
}
```

### `@Field(name)`

Override the default naming convention for specific getters.

```typescript
@LazyQL(OrderDTO)
class Order {
  @Field('customer_po')
  getPurchaseOrderNumber() {
    return this.db.getPO(this.id);
  }
}
```

## Configuration

### Global Settings

```typescript
import { configure } from 'lazyql';

configure({
  debug: true,    // Log getter executions
  timing: true,   // Include execution time in logs
  logger: (level, message, meta) => myLogger.log(level, message, meta),
  onError: (ctx) => {
    // Transform errors or return null to suppress
    return new CustomError(ctx.error.message);
  }
});
```

### Per-Class Options

```typescript
@LazyQL(OrderDTO, {
  debug: true,       // Enable logging for this class
  nestedProxy: true  // Auto-wrap nested LazyQL instances
})
class Order {
  // ...
}
```

## Advanced Features

### Class Inheritance

```typescript
@LazyQL(BaseOrderDTO)
class BaseOrder {
  getEntityId() { return this.id; }
  getStatus() { return this.status; }
}

@LazyQL(DetailedOrderDTO)
class DetailedOrder extends BaseOrder {
  // Inherits getEntityId() and getStatus()
  getLineItems() { return this.db.getLineItems(this.id); }
}
```

### Nested Objects

With `nestedProxy: true`, returned LazyQL instances are automatically wrapped:

```typescript
@LazyQL(CategoryDTO)
class Category {
  getName() { return this.name; }
  getProductCount() { return this.db.countProducts(this.id); }
}

@LazyQL(ProductDTO, { nestedProxy: true })
class Product {
  getCategory() {
    // Automatically wrapped - category fields are also lazy
    return new Category(this.categoryId, this.db);
  }
}
```

### DataLoader Integration

LazyQL works naturally with DataLoader for batching:

```typescript
@LazyQL(OrderDTO)
class Order {
  constructor(
    private id: number,
    private customerId: number,
    private loaders: DataLoaders
  ) {}

  async getCustomerEmail() {
    // Batched across all Order instances in the request
    const customer = await this.loaders.customer.load(this.customerId);
    return customer.email;
  }
}

// In resolver
async orders() {
  const loaders = createLoaders(); // Request-scoped
  const ids = await this.db.getOrderIds();
  return ids.map(id => new Order(id, loaders));
}
```

## How It Works

1. `@LazyQL` wraps your class to return a JavaScript Proxy
2. When GraphQL accesses a field, the Proxy intercepts it
3. The Proxy finds and executes the corresponding getter
4. Results are returned to GraphQL as normal

This works transparently with Apollo, Mercurius, or any GraphQL server.

## Validation

LazyQL validates your classes at startup:

- Required fields without getters cause an error
- Optional fields without getters return `null` (with a warning)

## Requirements

- Node.js 18+
- TypeScript 5+
- `reflect-metadata` peer dependency

## License

MIT
