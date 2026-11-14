# Swadesi — Product Plan

## The idea

Hyperlocal home-cooked food within a society/neighborhood. Home cooks list how much food
they're preparing; neighbors within walking distance order a portion of it.

## Personas (one account, both hats)

1. **Consumer** — browses food listings near them and places orders.
2. **Provider (home cook)** — lists what they're cooking, with a cap on servings
   ("I'm cooking for N people"). Orders draw down the cap.

Any user can do both. No separate account types.

## Core mechanic: vicinity

- Every user sets their location at onboarding (address + lat/lng). For a provider this is
  the kitchen location; for a consumer it's where they are.
- Discovery is radius-limited: a configurable threshold (e.g. 200 m / 500 m) decides which
  listings a user can see and order from. The radius is a server-side config, not user-set.

## Login / onboarding flow (build first)

1. Phone number (+ India-first normalization, same rules as Chhaon/Smart Gurukul).
2. OTP delivered over WhatsApp via the self-hosted WA-AKG gateway (deployed on our own EC2
   box, like Chhaon). Gateway not configured = dry-run (code is logged, never fails).
3. Verify OTP → JWT session (our own HS256 token, APP_JWT_SECRET).
4. First login → onboarding: name + location (browser geolocation with manual address
   fallback; we store address text + lat/lng).

## After login (next builds, in order)

1. **Listings**: provider creates a listing — title/dish, description, price per serving,
   max servings, ready-by time, open/closed. Remaining servings tracked.
2. **Discovery**: consumer sees open listings within the radius of their location
   (Postgres earthdistance/PostGIS or Haversine query).
3. **Orders**: consumer requests N servings; provider accepts/rejects; cap enforced
   atomically. Status flow: requested → accepted → ready → delivered/collected (or
   rejected/cancelled).
4. **WhatsApp notifications**: provider notified of new orders, consumer notified of
   acceptance (reuse the sender).

## Out of scope for v1

Payments (cash/UPI direct between neighbors for now), delivery logistics, ratings/reviews,
photos of dishes (maybe v1.1), multiple saved addresses, admin console.

## Tech notes

- Stack and infra: see CLAUDE.md and deploy/aws/INFRA.md (all live).
- Radius config: `swadesi.vicinity.radius-meters` (default 500).
- DPDP: never log phone numbers or codes in full; only hashed OTPs stored.
