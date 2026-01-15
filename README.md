# LazyQL

A lightweight TypeScript library that makes GraphQL resolvers truly lazy by default.

## The Problem

GraphQL optimizes network payload but not server computation. Developers typically:

1. Fetch all data in root resolvers
2. Build complete response objects with ALL fields
3. Let GraphQL filter the response

```typescript
// Traditional approach - ALL fields are computed
async getOrder(id: number) {
  const order = await db.getFullOrder(id);
  const customer = await db.getCustomer(order.customerId);
  const consultant = await jde.getConsultant(order.jdeCode);

  return {
    entity_id: order.id,
    status: order.status,
    grand_total: order.total,
    customer_email: customer.email,        // Computed even if not requested
    sales_consultant_name: consultant.name  // Computed even if not requested
  };
}
```

## The Solution

LazyQL lets you define models with getter methods. Only the getters for requested fields are executed.

```typescript
import { LazyQL, Shared } from 'lazyql';
import { OrderSummaryDTO } from './dto/order.dto';

@LazyQL(OrderSummaryDTO)
class OrderSummary {
  constructor(
    private id: number,
    private db: DatabaseService,
    private jde: JDEService
  ) {}

  getEntityId() {
    return this.id;
  }

  getStatus() {
    return this.db.getOrderStatus(this.id);
  }

  getGrandTotal() {
    return this.db.getOrderTotal(this.id);
  }

  async getCustomerEmail() {
    return await this.db.getCustomerEmail(this.id);
  }

  async getSalesConsultantName() {
    return await this.jde.getConsultantName(this.id);
  }

  @Shared()
  async getOrderDetails() {
    return await this.db.getFullOrder(this.id);
  }
}

// In your resolver - just return instances
async getOrder(id: number) {
  return new OrderSummary(id, this.db, this.jde);
}

async getOrders() {
  const ids = await this.db.getOrderIds();
  return ids.map(id => new OrderSummary(id, this.db, this.jde));
}
```

**Result:** If the client requests only `{ entity_id, status }`:
- `getEntityId()` executes
- `getStatus()` executes
- `getCustomerEmail()` **never** executes
- `getSalesConsultantName()` **never** executes
- JDE service is **never** called

## Installation

```bash
npm install lazyql reflect-metadata
```

Make sure to import `reflect-metadata` at your application entry point:

```typescript
import 'reflect-metadata';
```

## API

### `@LazyQL(DTO)`

Class decorator that enables lazy field resolution.

```typescript
@LazyQL(OrderSummaryDTO)
class OrderSummary {
  // ...
}
```

### `@Shared()`

Method decorator for caching results within an instance lifecycle.

```typescript
@LazyQL(OrderDTO)
class Order {
  async getGrandTotal() {
    const details = await this.getOrderDetails();
    return details.grand_total;
  }

  async getCurrencyCode() {
    const details = await this.getOrderDetails();
    return details.currency_code;
  }

  @Shared()
  async getOrderDetails() {
    // Executes only once, even if called by multiple getters
    return await this.db.getFullOrder(this.id);
  }
}
```

### `@Field(fieldName)`

Optional decorator to explicitly map a getter to a DTO field.

```typescript
@LazyQL(OrderDTO)
class Order {
  @Field('customer_po')
  getPurchaseOrderNumber() {
    return this.db.getPO(this.id);
  }
}
```

## Naming Convention

By default, LazyQL maps `snake_case` DTO fields to `getCamelCase` methods:

| DTO Field | Getter Method |
|-----------|---------------|
| `status` | `getStatus()` |
| `entity_id` | `getEntityId()` |
| `grand_total` | `getGrandTotal()` |

Use `@Field('field_name')` to override this convention when needed.

## Validation

LazyQL validates your classes at startup:

- **Required field without getter:** Application fails to start
- **Optional field without getter:** Warning logged, returns `null`

## How It Works

1. The `@LazyQL` decorator wraps your class to return a JavaScript Proxy
2. When GraphQL accesses a field (e.g., `instance.status`), the Proxy intercepts it
3. The Proxy maps `status` → `getStatus()` and executes the getter
4. Only requested fields have their getters executed

This is completely transparent to Apollo/Cosmo - no plugins or configuration needed.

## Test Coverage

LazyQL includes comprehensive unit tests:

```bash
npm test
```

- **getter-mapper:** 10 tests for field name conversion
- **proxy-factory:** 18 tests for Proxy behavior and @Shared caching
- **validator:** 11 tests for DTO field detection and validation

### Test Microservice

The `test-ms/` directory contains a NestJS application demonstrating LazyQL with:

- **Orders module:** 10 fields with @Shared methods
- **Products module:** Nested DTOs (CategoryDTO, InventoryDTO)
- **Comparison endpoints:** LazyQL vs traditional approach

```bash
cd test-ms
npm install
npm run start
# Visit http://localhost:3000/graphql
```

Example queries to compare performance:

```graphql
# LazyQL - only fetches requested fields
query {
  product(id: 1) {
    name
    price
  }
}

# Traditional - fetches EVERYTHING
query {
  productTraditional(id: 1) {
    name
    price
  }
}
```

## Requirements

- Node.js 18+
- TypeScript 5+
- `reflect-metadata` peer dependency

## License

MIT
