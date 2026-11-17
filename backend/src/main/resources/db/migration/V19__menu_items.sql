-- A cook's curated menu: dishes they can make on request, independent of dated feed listings.
create table menu_items (
    id                uuid primary key,
    cook_id           uuid not null,
    name              text not null,
    description       text,
    food_type         text not null default 'veg' check (food_type in ('veg', 'nonveg')),
    price_per_serving int,                 -- indicative; the binding price is set on Accept
    available         boolean not null default true,
    created_at        timestamptz not null,
    updated_at        timestamptz not null
);
create index idx_menu_items_cook on menu_items (cook_id);

-- Link a dish request back to the menu item it was raised from (nullable: free-text requests remain).
alter table dish_requests add column menu_item_id uuid;
