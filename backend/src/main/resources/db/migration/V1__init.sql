-- V1: placeholder first migration so Flyway has something to own.
-- Replace/extend with the real Swadesi schema once the product is defined.
create table if not exists app_meta (
    key   text primary key,
    value text not null
);

insert into app_meta (key, value) values ('schema', 'v1')
on conflict (key) do nothing;
