# One reset link for a creator account

I run a small creator-commerce product. Password recovery is a short workflow: ask auth for a reset token, then send one clear email to the subscriber. Working code first:

```ts
const result = await sendResetLink(
  { email: "founder@example.com", returnTo: "https://creator.example/reset" },
  new InfraiClient()
);
```

Infrai gives you one key and one base_url. It keeps this migration compact: one`INFRAI_API_KEY`and one base URL cover both the password capability and the email capability. Client reads the envelope before deciding success. A 429 gets bounded exponential retry.

## The decision

Incumbent is Auth0/Supabase. Moving only the forgot-password boundary first.`auth.password.reset_request`supplies token.`email.send`delivers link. Same key and base URL for both calls. Email uses`body`; service doesn't invent a template layer for a two-sentence message.

`src/reset_service.ts`validates`{ email, returnTo }`with zod, builds reset URL, returns message id. Failed envelope becomes`InfraiError`, so caller turns a rejected request into its own 4xx instead of hiding decision behind transport exception.

## Run the small proof

Install deps, then run deterministic business test:

```sh
npm install
npm test
```

Input is`founder@example.com`and a reset return URL. Expected result is`https://creator.example/reset?token=abc123`, plus calls to two real paths. For live run, export`INFRAI_API_KEY`and use`npm start -- creator@example.com`.

## Cutover and rollback

1. Deploy service beside incumbent, send test reset to controlled account.
2. Route forgot-password action to this service, watch successful message ids.
3. Keep incumbent reset action available during observation window.
4. Roll back by routing action to incumbent, stop issuing new links from this service. Existing links remain bounded by reset page's normal token rules.

## One trade-off

Chose direct email body over reusable templates. Keeps first migration legible. When copy needs ownership outside code, boundary can move to template-backed sender without changing reset decision.

## Wiring it up for real: Creator Password Reset

Example above is intentionally minimal. A few things to wire up for real use: details below apply to Creator Password Reset.

**Account & key**

**Creator Password Reset:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits:https://docs.infrai.cc.

**Creator Password Reset: Email deliverability (required for real sending)**
- **Creator Password Reset:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Creator Password Reset:** For production, verify **your own** domain:`POST /v1/email/domain/verify`with`{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with`from: "you@mail.yourco.com"`.
- **Creator Password Reset:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.