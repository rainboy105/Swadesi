-- The cook's kitchen (pickup) location, kept separate from their society/home.
-- Dishes are picked up here; the society/home (users.lat/lng) still centers the feed.
alter table users
    add column kitchen_lat     double precision check (kitchen_lat between -90 and 90),
    add column kitchen_lng     double precision check (kitchen_lng between -180 and 180),
    add column kitchen_address text;

-- Human-readable pickup address shown on a listing (its lat/lng already exist).
alter table listings
    add column pickup_address text;
