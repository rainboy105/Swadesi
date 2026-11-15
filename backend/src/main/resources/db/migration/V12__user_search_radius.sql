-- V12: per-user vicinity search radius (metres). Consumers can widen it to see farther.
alter table users add column search_radius_m integer not null default 500
    check (search_radius_m between 100 and 20000);
