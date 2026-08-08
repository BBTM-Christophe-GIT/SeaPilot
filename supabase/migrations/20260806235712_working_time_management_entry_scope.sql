-- Migration history reconciliation.
--
-- The production project received the working-time management entry scope under
-- version 20260806235712, while the canonical repository migration is
-- 20260806233355_working_time_management_entry_scope.sql. The two versions describe
-- the same create-or-replace function and grant changes. Keeping this no-op version
-- in the repository aligns local and remote history without executing the scope
-- migration twice on fresh databases.

select 1;
