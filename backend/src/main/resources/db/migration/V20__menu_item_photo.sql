-- Optional photo per menu item. Bytes live in a side table; has_photo tells the UI whether to
-- show the uploaded image or a placeholder.
alter table menu_items add column has_photo boolean not null default false;

create table menu_photos (
    menu_item_id uuid primary key references menu_items(id) on delete cascade,
    data         bytea not null,
    content_type text not null,
    created_at   timestamptz not null default now()
);
