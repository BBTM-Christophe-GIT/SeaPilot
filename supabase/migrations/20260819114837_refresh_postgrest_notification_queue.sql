-- Supabase recommends touching the notification queue when PostgREST cannot
-- receive schema reload notifications because pg_xact status is unavailable.
-- This is non-disruptive and makes the subsequent reload visible to Data API.
select pg_notification_queue_usage();
notify pgrst, 'reload schema';
