# LazyQL - Technical Specification

## Vision

A lightweight TypeScript library that makes GraphQL resolvers truly lazy by default. Developers define models using getter methods, and the library ensures only the requested fields are computed at runtime.

## Problem

GraphQL optimizes network payload but not server computation. Developers typically:
1. Fetch all data in root resolvers
2. Build complete response objects with ALL fields
3. Let GraphQL filter the response

The "correct" way (field-level resolvers) is verbose and requires significant boilerplate.

## Solution

A decorator-based library where developers:
1. Define classes with getter methods for each field
2. Decorate the class with `@LazyQL(OutputDTO)`
3. Return instances instead of plain objects

The library handles:
- Intercepting field access via Proxy
- Mapping field names to getter methods
- Caching shared computations within a request
- Validation at startup

---

## API

### Class Decorator: `@LazyQL(DTO)`

Links a class to its GraphQL output DTO.

```typescript
import { LazyQL } from 'lazyql';
import { OrderSummaryDTO } from './dto/order.dto';

@LazyQL(OrderSummaryDTO)
class OrderSummary {
  constructor(private id: number, private db: DatabaseService) {}

  getEntityId() { return this.id; }
  getStatus() { return this.db.getOrderStatus(this.id); }
}
```

**Behavior:**
- Registers the class with LazyQL
- At startup, validates all required DTO fields have corresponding getters
- Wraps instantiation to return a Proxy

### Method Decorator: `@Shared()`

Marks a method as shared/cached within the instance lifecycle.

```typescript
@LazyQL(OrderSummaryDTO)
class OrderSummary {
  constructor(private id: number, private db: DatabaseService) {}

  async getGrandTotal() {
    const details = await this.getOrderDetails();
    return details.grand_total;
  }

  async getOrderCurrencyCode() {
    const details = await this.getOrderDetails();
    return details.currency_code;
  }

  @Shared()
  async getOrderDetails() {
    // Executed only once, even if called by multiple getters
    return await this.db.getFullOrder(this.id);
  }
}
```

**Behavior:**
- First call executes the method and caches the result
- Subsequent calls return the cached result
- Cache is per-instance (not global)

### Method Decorator: `@Field(fieldName)`

Optional. Explicitly maps a getter to a specific DTO field.

```typescript
@LazyQL(OrderSummaryDTO)
class OrderSummary {
  @Field('customer_po')
  getPurchaseOrderNumber() {
    return this.db.getPO(this.id);
  }
}
```

**Use cases:**
- Field name doesn't follow convention
- Disambiguation when multiple getters could match
- Clearer code intent

---

## Naming Convention

Default mapping: `snake_case` field → `getCamelCase` method

| DTO Field | Getter Method |
|-----------|---------------|
| `status` | `getStatus()` |
| `entity_id` | `getEntityId()` |
| `increment_id` | `getIncrementId()` |
| `grand_total` | `getGrandTotal()` |
| `customer_email` | `getCustomerEmail()` |

Override with `@Field('field_name')` when needed.

---

## Validation

### At Startup (Application Bootstrap)

| Scenario | Behavior |
|----------|----------|
| Required field missing getter | **Error** - Application fails to start |
| Optional field missing getter | **Warning** - Logged, returns `null` at runtime |
| Getter exists but not in DTO | **Warning** - Logged, getter is ignored |

### At Runtime

| Scenario | Behavior |
|----------|----------|
| Getter throws error | Error propagates to GraphQL |
| Getter returns `undefined` | Converted to `null` |
| Nested field returns non-LazyQL object | **Warning** - Works but defeats purpose |

---

## Nested Objects

For nested fields, the developer decides whether to use LazyQL classes.

```typescript
// DTO definition
@ObjectType()
class OrderSummaryDTO {
  @Field(() => ShippingAddressDTO)
  shipping_address: ShippingAddressDTO;
}

// LazyQL implementation
@LazyQL(OrderSummaryDTO)
class OrderSummary {
  // Option A: Return another LazyQL class (recommended)
  getShippingAddress() {
    return new ShippingAddress(this.id, this.db);
  }

  // Option B: Return plain object (works but not lazy)
  getShippingAddress() {
    return this.db.getFullAddress(this.id); // Warning logged
  }
}
```

---

## Integration with GraphQL

### Transparent to Apollo/Cosmo

The library works via JavaScript Proxy. GraphQL servers don't need configuration or plugins.

```typescript
// Before LazyQL
@Query()
async getOrder(@Args('id') id: number) {
  const order = await this.db.getFullOrder(id);
  const customer = await this.db.getCustomer(order.customerId);
  return {
    entity_id: order.id,
    status: order.status,
    customer_email: customer.email,
    // ... all fields computed
  };
}

// After LazyQL
@Query()
async getOrder(@Args('id') id: number) {
  return new OrderSummary(id, this.db);
}
```

### How It Works

1. Resolver returns `new OrderSummary(id, db)`
2. `@LazyQL` decorator wraps constructor to return a Proxy
3. Apollo accesses `proxy.status` for requested fields
4. Proxy intercepts, maps `status` → `getStatus()`, executes getter
5. Only requested field getters are executed

### Arrays

```typescript
@Query()
async getOrders() {
  const ids = await this.db.getOrderIds();
  return ids.map(id => new OrderSummary(id, this.db));
}
```

Each item in the array is a separate LazyQL instance with its own cache.

---

## Project Structure

```
src/
  index.ts              # Public API exports
  decorators/
    lazyql.decorator.ts # @LazyQL class decorator
    shared.decorator.ts # @Shared method decorator
    field.decorator.ts  # @Field method decorator
  core/
    proxy-factory.ts    # Creates Proxy instances
    getter-mapper.ts    # Maps field names to getters
    validator.ts        # Startup validation logic
    cache.ts            # @Shared caching implementation
  types.ts              # TypeScript definitions
  errors.ts             # Custom error classes

test/
  unit/
    decorators.test.ts
    proxy-factory.test.ts
    getter-mapper.test.ts
    validator.test.ts
  integration/
    apollo.test.ts
    nestjs.test.ts
```

---

## Technical Requirements

- TypeScript first
- Zero runtime dependencies (peer deps only: `reflect-metadata`)
- Compatible with:
  - Apollo Server 4.x
  - NestJS 10+
  - Cosmo Router
- Node.js 18+
- ES Modules

---

## Phase 1 - MVP

**Goal:** Core functionality working end-to-end

1. `@LazyQL(DTO)` decorator with Proxy implementation
2. Getter convention mapping (`snake_case` → `getCamelCase`)
3. `@Field()` decorator for explicit mapping
4. Startup validation (required fields)
5. Basic test suite
6. README with examples

**Out of scope for Phase 1:**
- `@Shared()` caching
- Performance optimizations
- Batching

## Phase 2 - Caching & Polish

1. `@Shared()` decorator with per-instance memoization
2. Optional field warnings
3. Nested object warnings
4. Better error messages
5. Integration tests with Apollo/NestJS

## Phase 3 - Advanced Features

1. Batching (aggregate calls within same tick)
2. Async getter optimization
3. Debug mode / logging
4. Performance metrics
5. Cosmo-specific testing

---

## Example: Full Implementation

```typescript
// dto/order.dto.ts (existing NestJS DTO)
@ObjectType()
export class OrderSummaryDTO {
  @Field(() => Int) entity_id: number;
  @Field() increment_id: string;
  @Field() status: string;
  @Field(() => Float) grand_total: number;
  @Field({ nullable: true }) customer_email?: string;
  @Field({ nullable: true }) sales_consultant_name?: string;
}

// models/order-summary.model.ts (new LazyQL class)
import { LazyQL, Shared, Field } from 'lazyql';
import { OrderSummaryDTO } from '../dto/order.dto';

@LazyQL(OrderSummaryDTO)
export class OrderSummary {
  constructor(
    private id: number,
    private db: DatabaseService,
    private jde: JDEService
  ) {}

  getEntityId() {
    return this.id;
  }

  getIncrementId() {
    return this.getOrderData().increment_id;
  }

  getStatus() {
    return this.getOrderData().status;
  }

  getGrandTotal() {
    return this.getOrderData().grand_total;
  }

  async getCustomerEmail() {
    const order = await this.getOrderData();
    return await this.db.getCustomerEmail(order.customer_id);
  }

  async getSalesConsultantName() {
    return await this.jde.getConsultantName(this.id);
  }

  @Shared()
  async getOrderData() {
    return await this.db.getOrder(this.id);
  }
}

// commands/SearchCustomerOrdersCommand.ts (modified)
protected async executeImplementation(input) {
  const orderIds = await this.db.searchOrderIds(input.filters);

  return {
    items: orderIds.map(id => new OrderSummary(id, this.db, this.jde)),
    total_count: orderIds.length,
    page_info: { ... }
  };
}
```

**Result:** If client requests only `{ entity_id, status }`:
- `getEntityId()` executes → returns id
- `getStatus()` executes → calls `getOrderData()` once
- `getCustomerEmail()` never executes
- `getSalesConsultantName()` never executes
- JDE service never called

---

## Open Questions

1. **Should `@Shared()` support TTL?** (cache expiration within long-running requests)
2. **Should we provide a `@Lazy()` decorator for fields that are always expensive?** (explicit opt-in to lazy behavior vs default)
3. **Debug/logging strategy?** (how to trace which getters were called)
4. **Error handling strategy?** (should one failing getter prevent others from executing?)

---

## Principles

1. **Simple > Clever** - The API should be obvious
2. **The library should disappear** - Developers write normal-looking classes
3. **Zero config to start** - Works out of the box
4. **Progressive enhancement** - Advanced features are opt-in
5. **Fail fast** - Catch errors at startup, not runtime
