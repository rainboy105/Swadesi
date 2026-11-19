-- Daily recurring listings: when set, the dish is listed again every day at the same time,
-- with the same order-by time and servings, until the cook switches it off.
alter table listings add column recurring boolean not null default false;
