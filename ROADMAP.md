# LazyQL Roadmap v0.3.0

## Overview

This document outlines the planned improvements for LazyQL v0.3.0, focusing on edge cases, robustness, and advanced features.

---

## Phase 1: Robustness (Quick Wins)

### 1.1 Error Handling in Proxy Getters
**Priority:** High | **Complexity:** Low

Currently, if a getter throws an error, it propagates but isn't handled gracefully. We need to:
- Ensure errors propagate correctly to GraphQL
- Add option for custom error transformation
- Test error scenarios explicitly

```typescript
// Desired behavior
async getExpensiveField() {
  throw new Error('Database connection failed');
  // Should propagate to GraphQL as field error
}
```

### 1.2 Class Inheritance Support
**Priority:** High | **Complexity:** Medium

Support LazyQL classes extending other LazyQL classes:

```typescript
@LazyQL(BaseOrderDTO)
class BaseOrderModel {
  getEntityId() { return this.id; }
  getStatus() { return this.status; }
}

@LazyQL(ExtendedOrderDTO)
class ExtendedOrderModel extends BaseOrderModel {
  // Inherits getEntityId, getStatus
  getExtraField() { return this.extra; }
}
```

### 1.3 Improved Nullability Detection
**Priority:** Medium | **Complexity:** Medium

Better detection of `@Field({ nullable: true })` from NestJS GraphQL:
- Parse nullable option from TypeMetadataStorage
- Distinguish required vs optional fields accurately
- Proper warnings for missing optional field getters

---

## Phase 2: Developer Experience

### 2.1 Debug/Logging Mode
**Priority:** Medium | **Complexity:** Low

Add configurable logging to trace getter execution:

```typescript
@LazyQL(OrderDTO, { debug: true })
class OrderModel {
  // Logs: [LazyQL:OrderModel] Executing getter: getStatus
}

// Or global configuration
LazyQL.configure({ debug: true, logger: customLogger });
```

Features:
- Log which getters are called
- Log timing information
- Log cache hits for @Shared methods
- Custom logger support

---

## Phase 3: Advanced Features

### 3.1 Nested LazyQL Objects
**Priority:** High | **Complexity:** High

Support lazy loading for nested object fields:

```typescript
@LazyQL(ProductDTO)
class ProductModel {
  // Returns a LazyQL proxy, not a plain object
  async getCategory(): Promise<CategoryDTO> {
    return new CategoryModel(this.categoryId, this.db);
  }
}

@LazyQL(CategoryDTO)
class CategoryModel {
  getName() { return this.name; }
  getProductCount() { return this.db.countProducts(this.id); } // Only called if requested
}
```

### 3.2 DataLoader Integration
**Priority:** High | **Complexity:** High

Batch database calls across multiple instances:

```typescript
@LazyQL(OrderDTO)
class OrderModel {
  constructor(
    private id: number,
    private loaders: DataLoaders  // Injected DataLoader instances
  ) {}

  async getCustomerEmail() {
    // Uses DataLoader - batched across all OrderModel instances
    const customer = await this.loaders.customer.load(this.customerId);
    return customer.email;
  }
}

// In resolver
async orders() {
  const loaders = createLoaders(context);  // Request-scoped
  const ids = await db.getOrderIds();
  return ids.map(id => new OrderModel(id, loaders));
}
```

Benefits:
- N+1 query prevention
- Automatic batching
- Request-scoped caching

---

## Implementation Order

| # | Feature | Priority | Complexity | Est. Tests |
|---|---------|----------|------------|------------|
| 1 | Error Handling | High | Low | 5 |
| 2 | Class Inheritance | High | Medium | 6 |
| 3 | Nullability Detection | Medium | Medium | 4 |
| 4 | Debug Mode | Medium | Low | 5 |
| 5 | Nested LazyQL | High | High | 8 |
| 6 | DataLoader Integration | High | High | 10 |

**Total estimated new tests:** ~38

---

## API Design Decisions

### Configuration Options

```typescript
// Per-class configuration
@LazyQL(OrderDTO, {
  debug: boolean,           // Enable logging
  strict: boolean,          // Throw on missing getters (default: true for required)
  nestedProxy: boolean,     // Wrap nested objects in proxies (default: false)
})

// Global configuration
LazyQL.configure({
  debug: boolean,
  logger: (message: string, metadata: object) => void,
  onError: (error: Error, context: { field: string, class: string }) => Error,
});
```

### DataLoader Pattern

```typescript
// New decorator for DataLoader-backed getters
@LazyQL(OrderDTO)
class OrderModel {
  @Batched('customerLoader')  // Uses loader from context
  async getCustomerEmail() {
    // This method is called by DataLoader, receives batched IDs
  }
}
```

---

## Success Criteria

- [x] All 6 features implemented
- [x] 24 new tests added (total 63 tests)
- [ ] test-ms updated with examples of each feature
- [x] README updated with new API docs
- [x] CHANGELOG updated
- [x] No breaking changes to existing API

## Implementation Status

| # | Feature | Status | Tests Added |
|---|---------|--------|-------------|
| 1 | Error Handling | **Complete** | 4 |
| 2 | Class Inheritance | **Complete** | 4 |
| 3 | Nullability Detection | **Complete** | 3 |
| 4 | Debug Mode | **Complete** | 3 |
| 5 | Nested LazyQL | **Complete** | 6 |
| 6 | DataLoader Integration | **Complete** | 4 |
