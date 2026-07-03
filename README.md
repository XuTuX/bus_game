This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# bus_game

## Vercel + Redis deployment

This app stores live room state in Redis when Redis environment variables are
present. Without them, it falls back to local memory for development.

Create an Upstash Redis database, then set these environment variables in
Vercel:

```bash
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
ROOM_TTL_SECONDS=43200
MOVE_PHASE_SECONDS=180
ACTION_PHASE_SECONDS=120
```

- `ROOM_TTL_SECONDS`: how long a room is kept after the last saved state.
  The default is 12 hours.
- `MOVE_PHASE_SECONDS`: countdown shown during the move-card phase.
  The default is 3 minutes.
- `ACTION_PHASE_SECONDS`: countdown shown during the action phase.
  The default is 2 minutes.

Vercel KV-compatible names are also supported:

```bash
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
```
