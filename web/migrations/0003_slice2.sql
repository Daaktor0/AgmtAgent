-- Slice 2: persist index-quality metrics so the Proof banner and Review gate
-- can reconstruct without re-ingest.

alter table document_version add column if not exists classified_share numeric;
alter table document_version add column if not exists material_unclassified boolean not null default false;
alter table document_version add column if not exists usable_outline boolean not null default false;
alter table document_version add column if not exists unclassified_chars integer not null default 0;
alter table document_version add column if not exists unclassified_leaf_count integer not null default 0;
alter table document_version add column if not exists index_quality_json jsonb;
