# Changelog

## 2.0.0 — Breaking: `azure/blob-storage` error handling

Part of the org-wide verification-theatre elimination pass (T3 detector:
silently-swallowed exceptions).

### Breaking changes

- **`createBlobClient().download(path)`** (Azure mode) now **rethrows** any
  error that is not a genuine "not found" (`statusCode 404` /
  `code: 'BlobNotFound'` / `code: 'ContainerNotFound'`). Previously it caught
  every error — including auth failures, network errors, and throttling —
  and returned `null`, identical to a legitimate "file doesn't exist." Only
  the true not-found case still returns `null`, matching the documented
  contract.
- **`createBlobClient().download(path)`** (local filesystem mode) now
  rethrows any filesystem error other than `ENOENT`. Previously any error
  (e.g. `EACCES`, `EISDIR`) was reported identically to "file doesn't exist."
- **`createBlobClient().delete(path)`** (Azure mode) now returns the SDK's
  actual `succeeded` flag from `deleteIfExists()` instead of unconditionally
  returning `true` on the success path — deleting an already-absent blob
  now correctly reports `false` instead of a false `true`. It also now
  **rethrows** if `deleteIfExists()` itself fails (that method is
  not-found-safe by design, so any exception reaching this code is a real
  failure, never legitimate absence).
- **`createBlobClient().delete(path)`** (local filesystem mode) now rethrows
  any filesystem error other than `ENOENT`, for the same reason as
  `download()`.
- **`createBlobClient().exists(path)`** (Azure mode) now **rethrows** on any
  SDK failure instead of returning `false`. The SDK's `exists()` is itself
  not-found-safe (returns `false` without throwing for a missing blob), so
  any exception it raises is a genuine failure — auth, network, throttling —
  that was previously indistinguishable from "the blob doesn't exist."

**Who is affected:** any consumer of `@credit-union-2-0-llc/shared-lib`'s
`azure/blob-storage` module that calls `download()`, `delete()`, or
`exists()` and relies on those functions never throwing (e.g. code that
treats every outcome as "found" vs "not found" with no surrounding
try/catch). Such code will now see exceptions surface for real
infrastructure failures instead of a silent `null`/`false`. This is the
intended fix — those failures were previously invisible.

### Fixes (non-breaking)

- **`testing/otp-helper.fetchLatestOtp`**: the last fetch/network error
  observed while polling is now attached as `Error.cause` on the thrown
  `OtpNotFoundError`, instead of being captured and discarded. The thrown
  error type is unchanged (`instanceof OtpNotFoundError` still holds), so
  this does not break existing `catch` blocks — it only adds diagnostic
  information for a failing E2E run.
