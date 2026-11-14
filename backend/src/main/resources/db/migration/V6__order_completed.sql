-- V6: add a 'completed' order state (cook marks an accepted order as handed over).
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check
    check (status in ('requested', 'accepted', 'rejected', 'cancelled', 'completed'));
