# Document readers and mobile uploads

The application uses the shared authenticated `/api/documents` storage adapter for
verified private Vercel Blob copies. It checks the current user's business scope
through `document_blob_lookup` before choosing a retained desktop reader. A refused
lookup or a failed cloud download stops the action; it never opens an older copy.

Legacy desktop references use these logical addresses:

| Module | Bucket | Path |
| --- | --- | --- |
| Human resources | `hr-drive` | HR document ID |
| Chemicals | `chemical-drive` | Attachment UUID |
| Published procedure PDFs | `procedure-publications-drive` | Publication ID |
| Projects | `project-drive` | Desktop receipt registry ID |
| Disciplinary documents | `disciplinary-drive` | Document UUID |
| External purchase attachments | `purchase-request-external` | Attachment ID |
| Service note original source | `service-note-source` | Note ID |
| External service note attachments | `service-note-external` | Attachment ID |

Canonical historical storage addresses continue to work through the shared
adapter. External SharePoint links remain external until their actual bytes have
been copied and verified. An unmapped desktop receipt still needs its configured
Windows launcher. The local project demonstration stays entirely local.
External aliases are bound to the current business URL by SQL. A copied service
note source keeps its original DOCX bytes; its generated PDF remains a separate
document. Source/PJ open actions create their mobile tab before awaiting a fresh
authorized HTTPS URL, and ZIP exports read the private bytes directly.

New HR uploads use `hr-documents/people/<person ID>/<UUID>-<filename>` with
`metadata.person_id`; chemicals use `chemical-drive/<attachment UUID>` with
`metadata.product_id`; projects keep their existing `project-files/projects/...`
addresses with `metadata.project_id`.
Disciplinary Word letters and attachments use `disciplinary-drive/<document UUID>`
with `metadata.case_id`, after the case is saved. Current Administration/Direction
access and the existing letter validation flow remain enforced. The SDK completes
byte/hash verification before the module links the business record. These uploads do not connect to
Windows. Failed HR or chemical registration leaves the verified copy available for
recovery. The shared adapter retains verified copies and their original sources
when a business reference is removed. Unlinked private uploads remain available
for a separate, controlled purge; current business permissions govern visibility.

Procedure Word/Excel source editing and Office conversion keep the existing
desktop flow. `prepare_procedure_blob_publication` reserves an idempotent draft
publication for the converted PDF. The browser reads the receipt through the
existing publication ID, checks its SHA-256 and size, uploads
`procedure-publications-drive/<ID>`, then calls `publish_procedure_blob`. The SQL
activation checks the verified registry metadata before making the PDF current.
A failed transfer leaves a draft; retrying activation reuses a verified copy.

Open actions obtain a fresh signed URL at the click. HR and chemical exports read
authorized bytes independently and do not pre-connect to Windows. HR ZIP entries
use ArrayBuffer bytes so archives work in the browser on Windows and mobile.

Deploy the accompanying Blob schema and API before the frontend. Module tests
cover mobile uploads, lookup refusals, retained desktop fallback, publication
activation ordering, and ZIP contents; the real account/RLS verification remains
part of deployment verification.

Signed links honor the caller's lifetime, capped at one hour; single reads default
to two minutes. Reads always use current JWT authorization and changed-account
responses are discarded. The live provider probe confirmed an opaque upload
pathname preserves PDF MIME using the standard Content-Type header and supports
browser CORS. A repeated non-overwrite PUT may return HTTP 400; recovery still
requires the server to reread and validate the reserved object's exact SHA/size/
MIME, never accepts a failed PUT as proof, and never overwrites a document.

The installed `@vercel/blob` 2.8.1 SDK signs uploads against the exact
`https://vercel.com/api/blob/` provider endpoint. The browser checks the endpoint,
the reserved upload UUID, and its single `pathname=documents/uploads/<UUID>`
query value before sending any bytes. Historical Blob API hosts retain their
root endpoint compatibility under the same reservation checks. Private store
GET URLs are not upload destinations; redirects, credentials, ports, fragments,
other endpoints and other reservation paths are rejected. SDK regression tests
generate both PUT and private GET URLs with the installed presigner using a
synthetic delegation and no provider credentials or network access.

Signature lists and retention checks query `working-time-signatures` in groups
of four. The existing signature policies remain enforced for each object; the
smaller groups fit the authenticated PostgREST statement timeout while preserving
list order, individual refusals and the same retained-original behavior. Other
buckets keep their 200-path batches.
