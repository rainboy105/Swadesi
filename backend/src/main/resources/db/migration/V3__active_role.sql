-- V3: the mode a user is currently acting in. Any account can be both; this is just which
-- side of the app they're viewing (switchable any time from their profile).
alter table users
    add column active_role text not null default 'consumer'
    check (active_role in ('cook', 'consumer'));
