# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-01-15

### Added

- **Global Configuration**: `configure()` function for setting debug mode, custom logger, timing, and error handlers
- **Error Handling**: Proper error propagation from getters with custom error transformation support
  - `onError` callback for transforming or suppressing errors
  - Errors are logged with context (className, fieldName, getterName)
- **Debug Mode**: Per-class and global debug logging
  - `@LazyQL(DTO, { debug: true })` for per-class debugging
  - `configure({ debug: true })` for global debugging
  - Timing information with `configure({ timing: true })`
- **Class Inheritance Support**: LazyQL classes can extend other LazyQL classes, inheriting getters and @Shared methods
- **Improved Nullability Detection**: Track detection method (nestjs-graphql vs design-type) for better confidence
  - High-confidence fields (from NestJS metadata) throw errors when getters are missing
  - Low-confidence fields (from design:type) issue warnings instead
- **Nested LazyQL Objects**: `nestedProxy` option to auto-wrap returned objects
  - `@LazyQL(DTO, { nestedProxy: true })` enables automatic wrapping
  - Supports arrays of nested objects
  - Prevents double-wrapping of already-proxied objects
- **DataLoader Integration Pattern**: Documentation and tests demonstrating N+1 prevention
- **Registry exports**: `clearRegistry`, `isRegisteredClass`, `getClassMetadata` for testing
- **New test file**: `dataloader-pattern.test.ts` with 4 tests

### Changed

- `createLazyProxy` now accepts `className` parameter for better error messages
- `LazyQLMetadata` now includes `options` field for per-class configuration
- Proxy handler now wraps nested results when `nestedProxy` is enabled

### Tests

- **proxy-factory**: 35 tests (+17 new: error handling, debug mode, inheritance, nested proxy)
- **validator**: 14 tests (+3 new: nullability detection)
- **dataloader-pattern**: 4 tests (new)
- **Total**: 63 tests

## [0.2.0] - 2026-01-15

### Added

- Unit tests for proxy-factory module (18 tests)
- Unit tests for validator module (11 tests)
- Products module in test-ms demonstrating nested objects
- Extended common GraphQL field names list for better DTO detection
- Support for nested DTOs (CategoryDTO, InventoryDTO in ProductDTO)

### Fixed

- DTO field detection now works with NestJS GraphQL 12 lazy metadata
- Improved field detection using multiple strategies:
  - Existing TypeMetadataStorage fields
  - Intercepting addClassFieldMetadata during lazy function execution
  - Scanning for design:type metadata with common field patterns
- @Shared method caching now works correctly for internal calls

### Changed

- Validator now uses comprehensive common field names list including:
  - Identity fields (id, sku, uuid, etc.)
  - Product fields (price, inventory, category, etc.)
  - E-commerce fields (shipping_method, payment_method, etc.)

## [0.1.0] - 2026-01-15

### Added

- Initial project setup with TypeScript
- `@LazyQL(DTO)` class decorator for lazy field resolution
- `@Shared()` method decorator for per-instance caching
- `@Field(fieldName)` method decorator for explicit field mapping
- Proxy-based field interception (transparent to Apollo/Cosmo)
- Automatic `snake_case` to `getCamelCase` getter mapping
- Startup validation for required fields
- Unit tests for getter-mapper
- Technical specification (SPEC.md)
- Test microservice (test-ms) with Orders module
