# Activate verified private document copies

`scripts/activate-vercel-document-migration.ts` activates an existing private
transfer proof. It uploads or deletes no files and preserves original references.
Its default mode reads and verifies copies without changing the database.

Use pnpm 10.34.5. The proof and report must both be outside the repository checkout;
their parent directories must already exist. The report cannot replace the input
proof. Keep both private: they contain document references and provider URLs.

Set `BLOB_READ_WRITE_TOKEN` in the process environment through the approved private
credential loader. For `--apply`, also set `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`. The script does not read an env file and accepts no
credential arguments. The checked-in `.env.example` contains empty server-only
placeholders. Vercel Blob API override/emulator variables are refused.

Run a complete read-only verification against the explicitly expected private
store, replacing `<expected-store-id>` with the store's configured ID:

```powershell
corepack pnpm exec node --experimental-strip-types scripts/activate-vercel-document-migration.ts --proof ../verification/blob-transfer-proof.json --store-id <expected-store-id> --report ../verification/blob-activation-dry-run.json
```

Each canonical record must have `verified: true`, a retained original source,
matching source/copy SHA-256, bytes, MIME and a private Blob URL in that exact
store. The script reads the entire uncached object, computes its hash, and checks
HEAD metadata and ETag before and after the read. A `304` or partial read is refused.
Duplicate logical bucket/path keys cannot be activated.
Four bounded workers verify independent records. All canonical verification and
registration finishes before aliases run. The private report keeps input order.
GET response MIME may include a charset parameter; its base type must match.
HEAD MIME still matches the proof metadata exactly, including stored parameters.

An alias identifies its canonical record using `canonical_bucket` and
`canonical_path`. It must match that record's SHA-256, bytes and MIME. The script
reuses the canonical binary proof and rechecks HEAD/ETag before registering the
alias. An unverifiable canonical record blocks its dependent aliases. Unverified
or malformed input records fail individually; they are never silently activated.

After the private Blob schema and service-only RPC have been deployed and reviewed,
activate the mappings with the same proof:

```powershell
corepack pnpm exec node --experimental-strip-types scripts/activate-vercel-document-migration.ts --proof ../verification/blob-transfer-proof.json --store-id <expected-store-id> --report ../verification/blob-activation-applied.json --apply
```

`--apply` calls only `document_blob_register_verified` with migration provenance,
source/observed SHA-256, observed bytes/MIME and original ownership. The RPC permits
an identical rerun and rejects replacement of an existing different mapping.
A failed canonical registration blocks registration of its aliases. Other valid
records can complete, and the report records each successful or failed outcome.
The command returns a nonzero exit code for any failed item or operational error.

Standard output contains only progress counts, final counts and error codes.
Provider messages, document names, source paths, URLs and credentials are never
logged. The report is written atomically at the requested private destination.
An interrupted run can be verified and applied again using the original proof.
Run the real profile/RLS and application opening checks after activation; this
server maintenance script does not substitute for those checks.

Validation:

```powershell
corepack pnpm exec vitest run supabase/tests/document_blob_activation.test.ts
```

The SDK reads private objects with `access: 'private'` and `useCache: false` as
documented in the [Vercel Blob SDK reference](https://vercel.com/docs/vercel-blob/using-blob-sdk).
