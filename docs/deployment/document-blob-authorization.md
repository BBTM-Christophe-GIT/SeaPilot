# Private Blob authorization

SeaPilot stores attachment bytes in private Vercel Blob while Supabase continues
to authorize users and business records. Editable Word/Excel procedure sources
stay on Drive; procedure Blob keys accept PDF publications only.
The document API executes in Paris (`cdg1`), matching the private Blob store.
Server credentials remain in Vercel environment variables; no store credential
is shipped in the frontend.

Canonical Storage bucket/path references remain unchanged. Desktop aliases use
hr-drive/<hr_documents.id>, chemical-drive/<chemical_attachments.id>,
procedure-publications-drive/<published_procedures.id>,
project-drive/<project_drive_files.id>, and
disciplinary-drive/<disciplinary_documents.id>.
Historical external attachments use purchase-request-external/<attachment id>,
service-note-source/<note id>, and service-note-external/<attachment id>.

The mapping table is read-only to authenticated users and unavailable to anon.
Canonical access evaluates live permissive and restrictive Storage policies with
the actual JWT identity and business RLS. Existing migrated Drive references
retain their prior RPC authorization. A denied or inactive mapping raises 42501,
preventing fallback to historical bytes. Desktop aliases match the current path,
hash and available metadata; external aliases match a snapshot of the current
business URL. Renewing an RH record makes an obsolete ID alias inaccessible.

## Upload contract

1. document_blob_upload_scope(target_bucket, target_path, target_file_name,
   target_mime_type, target_bytes, target_sha256, target_context) returns an
   idempotent pending reservation including id/upload_id, uploader_id,
   source_bucket/path, blob_pathname, metadata and expires_at.
   The exact reserved pathname is documents/uploads/<upload_id>.
2. The server signs PUT for that object without overwrite. Context may carry
   product_id, case_id or person_id. The RPC validates the actual module target,
   existing company/role permissions and bucket limits. A pre-existing Storage
   object or append-only desktop attachment cannot be replaced using INSERT
   permission.
3. document_blob_upload_revalidate(target_upload_id) checks the same actor,
   current authorization and expiry without reserving another upload.
4. After reading every byte, comparing SHA-256/size/MIME and checking the object
   remained unchanged, the server revalidates and calls the service-only
   document_blob_register_verified(p_record).

Registration fields are source_bucket, source_path, blob_pathname, blob_url,
file_name, mime_type, bytes, sha256, verified_bytes, verified_sha256,
verified_mime_type, upload_id and uploader_id. The result contains all client
metadata: provider, private URL/pathname, name, MIME, SHA, size, verification time
and logical key. Retries return the same proof and cannot overwrite another one.

Migration registration adds migration=true, source_sha256 and optional
provenance/original_owner_id. The registrar snapshots desktop paths or external
URLs itself. Business and historical references, source bytes, old versions and
provider ACLs remain intact.

New uploads are visible only to their uploader until an authorized business
reference links them. Existing finalization RPCs read verified metadata through
document_blob_private.objects(), a typed read projection. No synthetic row is
inserted into storage.objects. Original target, owner, path, MIME, size, revision,
workflow and company guards remain; SHA-bearing Blob workflows also bind their
business hash to the verified binary hash.

## Procedure publication

prepare_procedure_blob_publication(target_procedure, pdf_path, pdf_bytes,
pdf_sha256) reserves an idempotent private draft receipt for an Admin/Direction
author. The existing bridge can read that author's draft through
procedure_drive_scope. Other profiles cannot read it.

After PDF verification under procedure-publications-drive/<publication id>,
publish_procedure_blob(target_publication) checks the exact receipt before
publishing the PDF and updating the source lifecycle. A new PDF is never
announced as published before its Blob bytes exist.

## Reads and verification

document_blob_lookup(target_bucket, target_path) returns authorized verified
metadata or null. document_blob_lookup_batch accepts up to 200 paths and returns
ordered path/document/error entries under the same RLS, withholding metadata for
denied entries.

Run supabase/tests/document_blob_access_test.sql against an isolated local
database after its prerequisites and the Blob migration. It covers independent
Admin/Direction/Armement/Capitaine/Marin fixtures, company/RH/anonymous boundaries,
batch denial, reservation/proof guards, pending privacy, new RH and chemicals,
working-time preview/commit, signature/project hash checks, procedure activation,
obsolete RH alias rejection and existing-object replacement refusal. The entire
fixture transaction rolls back.
