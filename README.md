# Personal Runway

A small personal-finance dashboard that answers: **How much runway do I have left?**

The current snapshot was calculated from read-only Fold Money MCP data:

- available money = liquid bank balance + optionally investments − debt
- monthly burn = average adjusted outflow over the last three complete months
- runway = available money ÷ monthly burn

Categories that represent money movement rather than lifestyle burn are excluded from the baseline. The interface makes both the investment assumption and monthly burn adjustable.

## Architecture

```text
Fold Money MCP → Cloudflare Worker → KV snapshot → Web app / Android widget
                         ↑                           │
                    6-hour cron              15-minute cache check
```

The Worker stores only totals and the three adjusted monthly burn figures. It never stores transactions, account names, or account identifiers. A failed refresh does not overwrite the last good snapshot.

## Run the web app locally

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` once the Worker is running. Without those variables, the web app deliberately falls back to the privacy-safe aggregate snapshot in `src/foldSnapshot.ts`.

## Deploy the Cloudflare Worker

1. Create the KV namespaces:

   ```bash
   npx wrangler kv namespace create RUNWAY_CACHE
   npx wrangler kv namespace create RUNWAY_CACHE --preview
   ```

2. Put the returned IDs in `worker/wrangler.toml`.
3. Set secrets (never put them in `wrangler.toml`):

   ```bash
   npx wrangler secret put FOLD_MCP_URL --config worker/wrangler.toml
   npx wrangler secret put FOLD_MCP_TOKEN --config worker/wrangler.toml
   npx wrangler secret put RUNWAY_API_TOKEN --config worker/wrangler.toml
   npm run worker:deploy
   ```

`FOLD_MCP_URL` must be a Streamable HTTP MCP endpoint and `FOLD_MCP_TOKEN` must be a non-interactive credential accepted by that endpoint. If Fold only permits interactive OAuth, place an OAuth-capable MCP gateway in front of it rather than copying a browser token.

The scheduled Worker refreshes Fold every six hours. `GET /api/runway` returns the cached snapshot. Authenticated `POST /api/refresh` performs an immediate Fold refresh. Both private endpoints require `Authorization: Bearer <RUNWAY_API_TOKEN>`.

For a deployed browser app, protect the site with Cloudflare Access. A `VITE_*` token is visible to browser users and is suitable only for local/single-user development.

## Build the Android widget

Open `android/` in Android Studio (JDK 17, Android SDK 35). Add this to the gitignored `android/local.properties`:

```properties
sdk.dir=/path/to/Android/sdk
RUNWAY_API_URL=https://personal-runway-api.your-subdomain.workers.dev
RUNWAY_API_TOKEN=the-same-long-random-api-token
```

Build and install the `app` configuration, then add **Personal Runway** from the Android widget picker.

- Android checks the cached API every 15 minutes when network is available.
- Tapping ↻ performs a live Fold refresh.
- The last successful value remains visible offline or after errors.
- The widget displays both total runway and liquid-only days.

The bearer token is compiled into this single-user APK and can be extracted by a determined attacker. For distribution to multiple users, replace it with per-user sign-in and short-lived tokens (for example, Cloudflare Access or an identity provider).
