-- Consumer-initiated requests for a dish from a specific cook. The cook accepts (with a
-- price/serving) or rejects; on accept a one-off request-only listing is created and the
-- consumer pays through the normal order flow.
create table dish_requests (
    id                uuid primary key,
    consumer_id       uuid not null references users (id),
    consumer_name     text,
    consumer_phone    text,
    cook_id           uuid not null references users (id),
    cook_name         text,
    dish_name         text not null,
    qty               int  not null,
    note              text,
    status            text not null default 'pending'
                           check (status in ('pending','accepted','rejected','cancelled','fulfilled')),
    price_per_serving int,
    listing_id        uuid,
    order_id          uuid,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

create index dish_requests_consumer_idx on dish_requests (consumer_id, created_at desc);
create index dish_requests_cook_idx on dish_requests (cook_id, created_at desc);

-- A one-off listing created to fulfil an accepted request; never shown in the public feed.
alter table listings add column request_only boolean not null default false;
