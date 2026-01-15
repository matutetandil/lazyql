# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
