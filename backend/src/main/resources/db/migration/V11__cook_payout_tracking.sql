-- V11: track manual cook settlements. A completed+paid order is owed to the cook until the
-- platform marks it paid out (pays the cook via UPI by hand).
alter table orders add column cook_paid_out boolean not null default false;
alter table orders add column cook_paid_out_at timestamptz;
