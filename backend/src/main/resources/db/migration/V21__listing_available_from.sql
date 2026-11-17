-- Optional "opening time" for a listing: before this moment the dish is hidden from the consumer
-- feed (lets a cook schedule a dish ahead). Null = available immediately. The order cutoff stays
-- order_by (the "ending time").
alter table listings add column available_from timestamptz;
