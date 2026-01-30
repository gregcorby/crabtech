# Build Rules (Non-Negotiable)

1. **No provider SDK usage unless installed and verified in compilation.**
   Every external dependency must be in `package.json`, installed, and pass `pnpm typecheck` before any code using it is merged.

2. **No endpoint added without OpenAPI specification and tests.**
   Every API route must define its Zod schema (which feeds the auto-generated OpenAPI spec) and have at least one integration test covering the happy path and one error path.

3. **No infrastructure resources created without a reversible cleanup path.**
   Every `create*` call in a provider implementation must have a corresponding `destroy*` and a cleanup-on-failure handler. Orphan detection scripts must be able to find and remove any resource by tag.

4. **No secrets logged; enforce redaction at logger boundary.**
   The centralized logger must redact all configured secret patterns. Unit tests must inject sentinel strings and verify they never appear in output.

5. **No step proceeds until all checks pass.**
   CI and local development both enforce: `pnpm lint && pnpm typecheck && pnpm test` must exit 0 before any phase is considered complete.
