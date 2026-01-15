# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-01-15

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
