-- Monthly counter of paid geocode (Ola Maps) calls, so we can cap usage within the free tier
-- and fall back to OpenStreetMap once the monthly limit is reached. One row per YYYY-MM.
create table geocode_usage (
    ym        text primary key,
    ola_count bigint not null default 0
);
