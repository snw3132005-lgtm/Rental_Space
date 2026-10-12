---
name: API date-only contracts
description: Keep calendar dates consistent across OpenAPI code generation, PostgreSQL date columns, and JSON responses.
---

Represent calendar-only values as `YYYY-MM-DD` strings across OpenAPI, the database, and API JSON. Avoid `format: date` when consumers must keep that exact string: code generation may coerce it into a JavaScript `Date`.

**Why:** Date coercion caused a response-validation failure when a database timestamp came back as a `Date` but the generated API schema expected a string, and it can also shift calendar dates across time zones.

**How to apply:** For calendar dates, use plain OpenAPI strings and validate their format and calendar validity explicitly at the API boundary. Use `Date` objects only for actual instants and serialize them as ISO date-time strings.
