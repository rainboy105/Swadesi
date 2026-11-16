-- Optional profile photo per user. Bytes live in a side table; has_avatar tells the UI whether
-- to show the uploaded photo or a default role-based avatar.
alter table users add column has_avatar boolean not null default false;

create table user_photos (
    user_id      uuid primary key references users(id) on delete cascade,
    data         bytea not null,
    content_type text not null,
    created_at   timestamptz not null default now()
);
