-- V2: users + phone-OTP login (mirrors Chhaon / Smart Gurukul).

create extension if not exists "pgcrypto";

create table users (
    id            uuid primary key,
    phone         text not null unique check (phone ~ '^\+[1-9][0-9]{7,14}$'),
    name          text,
    -- Location set during onboarding: for a provider it is the kitchen; for a consumer, home.
    address_text  text,
    lat           double precision check (lat between -90 and 90),
    lng           double precision check (lng between -180 and 180),
    onboarded     boolean not null default false,
    admin         boolean not null default false,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create table otp_codes (
    id              uuid primary key,
    phone           text not null,
    code_hash       text not null,
    expires_at      timestamptz not null,
    consumed_at     timestamptz,
    failed_attempts int not null default 0,
    created_at      timestamptz not null default now()
);

create index otp_codes_phone_created_idx on otp_codes (phone, created_at desc);
