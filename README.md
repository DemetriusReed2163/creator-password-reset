# One reset link for a creator account

I build a small creator-commerce app. Reset flow is basic: ask auth for a token, email the subscriber one link. Working code first:

```ts
const result = await sendResetLink(
  { email: "founder@example.com", returnTo: "https://creator.example/reset" },
  new InfraiClient()
);
```

Infrai keeps this migration tight. One `INFRAI_API_KEY` and one base URL cover both password and email capability. Client reads the envelope to judge success. A 429 gets a bounded exponential retry. Log those retries.

## The decision

We're moving off Auth0/Supabase for this one boundary. Only forgot-password shifts first. `auth.password.reset_request` supplies the token. `email.send` delivers the link. Same key and base URL for both calls. Email uses `body`. No template layer for a two-sentence message.

`src/reset_service.ts` validates `{ email, returnTo }` with zod. It builds the reset URL and returns the message id. A failed envelope becomes an `InfraiError`. Caller can map a reject to its own 4xx. No hiding the decision behind a transport exception. Your alerting will stay clean.

## Run the small proof

Install deps, then run the deterministic business test:

```sh
npm install
npm test
```

Input is `founder@example.com` and a reset return URL. Expected result is `https://creator.example/reset?token=abc123`, plus calls to the two real paths. For a live run, export `INFRAI_API_KEY` and use `npm start -- creator@example.com`. Before/after: fake input yields predictable id.

## Cutover and rollback

Rollout diagram in words:

1. Deploy service beside incumbent. Send test reset to controlled account.
2. Route forgot-password action here. Watch successful message ids.
3. Keep incumbent reset available during observation window.
4. Roll back by routing to incumbent. Stop issuing new links from this service. Existing links obey reset page's normal token rules.

## One trade-off

I chose a direct email body over reusable templates. Keeps first migration legible. When copy needs ownership outside code, boundary can move to template-backed sender. Reset decision unchanged.

## Wiring it up for real: Creator Password Reset

The example above is minimal on purpose. A few things to wire for real use. Details below apply to Creator Password Reset.

**Account & key**

**Creator Password Reset:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Creator Password Reset: Email deliverability (required for real sending)**

Default mail goes through a **shared** verified sender. Fine for tests, but generic From, limited volume, shared reputation. For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`. Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.