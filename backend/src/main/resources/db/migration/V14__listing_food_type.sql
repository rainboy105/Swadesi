-- Veg / non-veg classification for each dish. Existing dishes default to veg.
alter table listings
    add column food_type text not null default 'veg'
        check (food_type in ('veg', 'nonveg'));
