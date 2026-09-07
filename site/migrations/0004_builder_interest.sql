-- Builder interest registrations (/builders). Deliberately separate from
-- `waitlist`: this is a contact request from a legal-tech builder, not a
-- product-access booking, and it must never be merged with product
-- authentication or a future newsletter list.
--
-- One email is one row. A repeated submission from the same address returns
-- the existing registration rather than creating a duplicate or silently
-- discarding the new product_url.

create table if not exists builder_interest (
  id               serial primary key,
  created_at       timestamptz not null default now(),
  email            text        not null,
  email_normalized text        not null,
  product_url      text,
  consent          boolean     not null,
  consent_at       timestamptz not null default now()
);

create unique index if not exists builder_interest_email_uidx
  on builder_interest (email_normalized);
