-- Prepare the private bucket for the two QSMS sources above 50 MiB.
-- The hosted project's global Storage limit must also be raised on a paid
-- plan before those objects can be uploaded without altering their contents.
update storage.buckets
set file_size_limit = 104857600
where id = 'procedure-documents';
