# Entrypoint Analysis

## Bootstrap Location

**File:** `src/main.ts:8-25`

**Bootstrap call:** `src/main.ts:9`
```typescript
const app = await NestFactory.create<NestExpressApplication>(AppModule);
```

**Root Module:** `AppModule` (imported from `./app.module` at `src/main.ts:4`)

## Verification

The `bootstrap()` function at `src/main.ts:8` calls `NestFactory.create(AppModule)` passing `AppModule` as the root module. This is the sole application entrypoint.

## Additional Entrypoints

None detected. No worker processes, CLI tools, or alternative bootstraps found in the repository.
