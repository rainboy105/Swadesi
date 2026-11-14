-- V4: food listings. A cook posts a dish with a serving cap; consumers nearby can see it.
-- lat/lng are snapshotted from the cook at creation so the vicinity search is stable.
create table listings (
    id                uuid primary key,
    cook_id           uuid not null references users(id),
    cook_name         text,
    title             text not null,
    description       text,
    price_per_serving integer not null check (price_per_serving >= 0),
    max_servings      integer not null check (max_servings >= 1),
    servings_claimed  integer not null default 0 check (servings_claimed >= 0),
    ready_by          timestamptz,
    status            text not null default 'open' check (status in ('open', 'closed')),
    lat               double precision not null,
    lng               double precision not null,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

-- Vicinity feed filters open listings by a lat/lng bounding box, so index those.
create index listings_open_box_idx on listings (status, lat, lng);
create index listings_cook_idx on listings (cook_id, created_at desc);
