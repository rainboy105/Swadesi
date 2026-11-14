-- V8: richer order lifecycle (preparing, ready) + a pickup code the consumer shows the cook.
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check
    check (status in ('requested', 'accepted', 'preparing', 'ready',
                      'completed', 'rejected', 'cancelled'));

-- 4-digit code generated when the order is placed; cook must enter it to complete pickup.
alter table orders add column pickup_code text;
