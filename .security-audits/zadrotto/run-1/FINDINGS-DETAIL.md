# Findings detail

## Next.js dependency

Input reaches the public Next.js App Router and Server Action implementation selected by
`package.json:35`; `next.config.ts:4-7` explicitly enables a 6 MiB Server Action body limit and the
application exposes many unauthenticated/authenticated actions. `npm audit --omit=dev` on
2026-09-09 reported `next@16.2.4` inside multiple affected ranges, including
`GHSA-m99w-x7hq-7vfj` (unauthenticated Server Action DoS), and offered `16.3.4` as a non-major fix.
Baseline services patch supported framework security releases before exposure.

## Sharp dependency

An ordinary author supplies `avatarFile` to
`src/app/author/(protected)/profile/actions.ts:35-52`; the entire file becomes a Buffer at
`src/lib/avatars/storage.ts:73` and is decoded at lines 74-100. Covers provide a second author-reachable
decoder at `src/lib/covers/storage.ts:94-103,223`. `npm audit --omit=dev` reported `sharp@0.34.5`
affected by `GHSA-f88m-g3jw-g9cj` and `GHSA-rgj7-g3m4-5g8c`, with `0.35.4` as the fix.

## Bug-report fan-out

```http
POST /api/bug-reports HTTP/1.1
Cookie: author_session_v2=<ordinary-author-session>
Content-Type: application/json

{"description":"x","url":"/"}
```

The route authenticates at `src/app/api/bug-reports/route.ts:53-55`, performs only field validation,
then calls `createBugReport` at lines 90-97. That function inserts both report and unique event at
`src/db/queries/bug-reports.ts:35-50`; there is no quota/unique cooldown. The consumer inserts one
admin inbox record per admin and optional transport outbox records at
`src/lib/notifications/consumer.ts:23-84`. Repetition produces a new `201` and fan-out every time.

