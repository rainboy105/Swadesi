-- V5: orders + an order cutoff time on listings.

-- Orders can be placed only until this time (null = no cutoff).
alter table listings add column order_by timestamptz;

create table orders (
    id             uuid primary key,
    listing_id     uuid not null references listings(id),
    consumer_id    uuid not null references users(id),
    consumer_name  text,
    consumer_phone text,
    qty            integer not null check (qty >= 1),
    status         text not null default 'requested'
                   check (status in ('requested', 'accepted', 'rejected', 'cancelled')),
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create index orders_listing_idx on orders (listing_id);
create index orders_consumer_idx on orders (consumer_id, created_at desc);
