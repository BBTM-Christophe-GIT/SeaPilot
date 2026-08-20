-- Ensure the hosted Data API exposes the new clients_save argument immediately.
select pg_notification_queue_usage();
notify pgrst, 'reload schema';
