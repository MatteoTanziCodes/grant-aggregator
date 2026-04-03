# Grant Aggregator

This repo runs a Next.js app on Cloudflare Workers via OpenNext.

## Getting Started

Read the OpenNext Cloudflare docs at https://opennext.js.org/cloudflare.

## Develop

Run the Next.js development server:

```bash
npm run dev
# or similar package manager command
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `src/app/page.tsx`. The page auto-updates as you edit the file.

## Build

Generate a plain Next.js production build:

```bash
npm run build
```

Generate the Cloudflare worker bundle that Wrangler deploys:

```bash
npm run build:cloudflare
```

## Preview

Preview the application locally on the Cloudflare runtime:

```bash
npm run preview
# or similar package manager command
```

## Deploy

Deploy the application to Cloudflare:

```bash
npm run deploy
# or similar package manager command
```

## Local D1

Initialize the local D1 database schema used by `next dev`:

```bash
npm run db:local:init
```

Inspect the local D1 tables:

```bash
npm run db:local:tables
```

Reset the local D1 state and recreate the schema:

```bash
npm run db:local:reset
```

For Cloudflare Workers Builds / CI, use:

- Build command: `npm run build:cloudflare`
- Deploy command: `npm run deploy`

Do not use `next build` followed by `wrangler deploy` directly. The deployed worker entrypoint is generated into `.open-next/worker.js` by the OpenNext Cloudflare build step.

## Runtime Config

The production runtime expects these bindings or secrets:

- `FUNDING_DB`
- `EMAIL_FROM`
- `EMAIL_VERIFICATION_BASE_URL`
- `RESEND_API_KEY`
- `UNSUBSCRIBE_SECRET`
- `ADMIN_BASIC_AUTH_USERNAME`
- `ADMIN_BASIC_AUTH_PASSWORD`
- `ADMIN_TOTP_SECRET`
- `ADMIN_SESSION_SECRET`

The admin panel at `/admin/login` requires username/password plus a 6-digit authenticator code derived from `ADMIN_TOTP_SECRET`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!
