-- Browser Web Push (VAPID) subscriptions. One row per browser/device per user.
create table push_subscriptions (
    id         uuid primary key,
    user_id    uuid not null references users (id) on delete cascade,
    endpoint   text not null unique,
    p256dh     text not null,
    auth       text not null,
    created_at timestamptz not null default now()
);

create index idx_push_subscriptions_user on push_subscriptions (user_id);
