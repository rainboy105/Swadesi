-- V7: optional dish photo per listing. Bytes live in a side table so listing/feed queries
-- never load them; has_photo on the listing tells the UI whether to show an image.
alter table listings add column has_photo boolean not null default false;

create table listing_photos (
    listing_id   uuid primary key references listings(id) on delete cascade,
    data         bytea not null,
    content_type text not null,
    created_at   timestamptz not null default now()
);
