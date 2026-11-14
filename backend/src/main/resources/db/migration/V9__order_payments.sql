-- V9: Razorpay prepaid orders. An order waits in 'pending_payment' until the payment is
-- verified, then becomes 'requested' (visible to the cook).
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check
    check (status in ('pending_payment', 'requested', 'accepted', 'preparing', 'ready',
                      'completed', 'rejected', 'cancelled'));

alter table orders add column razorpay_order_id   text;
alter table orders add column razorpay_payment_id text;
alter table orders add column amount_paise        integer;
alter table orders add column paid                boolean not null default false;
