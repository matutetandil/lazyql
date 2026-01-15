# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LazyQL is a lightweight TypeScript library that makes GraphQL resolvers truly lazy by default. Developers define models using getter methods, and the library ensures only the requested fields are computed at runtime via JavaScript Proxy.

## Development Environment

- **Node.js Version**: 20 (managed via autonode)
- **Package Manager**: npm
- **Language**: TypeScript (strict mode)

## Build & Test Commands

```bash
npm install          # Install dependencies
npm run build        # Build with tsup (outputs to dist/)
npm run dev          # Build in watch mode
npm test             # Run tests with vitest
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage
npm run typecheck    # Type check without emitting
npm run lint         # Lint with eslint
```

## Architecture

```
src/
├── index.ts                    # Public API exports
├── types.ts                    # TypeScript type definitions
├── errors.ts                   # Custom error classes
├── decorators/
│   ├── lazyql.decorator.ts     # @LazyQL(DTO) class decorator
│   ├── shared.decorator.ts     # @Shared() method decorator
│   └── field.decorator.ts      # @Field() method decorator
└── core/
    ├── proxy-factory.ts        # Creates Proxy instances that intercept field access
    ├── getter-mapper.ts        # Maps field names to getter methods (snake_case -> getCamelCase)
    ├── validator.ts            # Startup validation (checks all required fields have getters)
    └── registry.ts             # Global registry of LazyQL classes
```

## Key Concepts

1. **Proxy-based interception**: When `new MyModel()` is called, it returns a Proxy that intercepts property access
2. **Naming convention**: `snake_case` DTO fields map to `getCamelCase` methods (e.g., `entity_id` -> `getEntityId()`)
3. **@Shared() caching**: Methods marked with `@Shared()` execute once per instance and cache the result
4. **Startup validation**: Missing getters for required fields throw errors at startup (fail fast)

## Spec Document

See `SPEC.md` for the complete technical specification including API details, validation rules, and implementation phases.
