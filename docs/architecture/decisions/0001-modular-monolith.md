# ADR 0001 - Modular monolith, feature-oriented backend

Status: accepted (2026-09-06)

## Context

Lorex is a single product built by a very small team. Splitting into services early
would add deployment and consistency cost with no benefit at this size.

## Decision

One deployable ASP.NET Core host (`Lorex.Api`) plus one SPA (`Lorex.Web`).
Backend code is organised by feature under `src/Lorex.Api/Features/<Feature>/`,
each feature owning its endpoints, handlers and EF Core entity configuration.

No generic `Repository<T>` or `IXxxService` layers over EF Core. `LorexDbContext`
is the data access abstraction; features use it directly.

## Consequences

- Feature folders stay cohesive and easy to delete or extract later.
- Module boundaries are conventions, not compiler-enforced. Cross-feature reaching
  must be caught in review.
- Extraction into a separate service later means moving one feature folder plus its
  migrations, not unpicking a shared layer cake.
