-- T07 / R2-01: allow the Cloudflare R2 object-store adapter.
-- Existing S3 and memory manifests remain valid; this only widens the provider
-- contract for newly written Proof objects.

alter table public.object_manifest
  drop constraint if exists object_manifest_storage_provider_check;

alter table public.object_manifest
  add constraint object_manifest_storage_provider_check
  check (storage_provider in ('s3', 'memory', 'r2'));
