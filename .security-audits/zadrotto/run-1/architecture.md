# Architecture and trust boundaries

## Application and baseline

Zadrotto is a self-hosted Next.js 16 / React 19 editorial archive with public catalogues,
local demo state, authenticated author accounts, a separate administrator panel, PostgreSQL,
Redis rate limits, S3-compatible image storage, background jobs, and external metadata, email,
Telegram and AI providers (`PROJECT_CONTEXT.md`, `README.md`, `package.json`). Its closest security
baseline is a small Letterboxd/Goodreads-style UGC catalogue combined with a staff CMS: anonymous
reading is public, authors may mutate only their own state and submissions, and administrators may
moderate and operate the service.

Production is a standalone Node 22 Alpine container running as UID 1001. The web port and Redis are
bound to loopback in Compose; TLS and the complete reverse-proxy chain are outside the repository.
Scheduler and worker are separate privileged processes consuming database-backed jobs
(`Dockerfile`, `docker-compose.yml`, `src/jobs/worker.ts`, `src/jobs/scheduler.ts`).

## Actors and trust model

- Anonymous visitors read public content. The demo profile is browser-local and must never grant a
  server identity (`src/lib/user-state`, `src/app/demo-profile/actions.ts`).
- Authors authenticate through password or administrator-issued access token. Their opaque session
  token is hashed in PostgreSQL; requests re-check the author, code and blocked status
  (`src/lib/auth/author-auth.ts`, `src/lib/auth/author-session.ts`).
- Administrators use a distinct HMAC-signed session cookie whose invalidation timestamp is checked
  against PostgreSQL (`src/lib/auth/admin-session.ts`, `src/lib/auth/admin-auth.ts`).
- External providers and job workers hold service credentials and cross a higher-privilege boundary.
- Authentication and authorization are enforced in application code. There is no global middleware
  gate and no PostgreSQL RLS/GRANT policy in the repository. Protected layouts guard page rendering,
  while every callable Server Action and route must independently authenticate; resource ownership
  is generally enforced in query predicates (`src/app/admin/(protected)/layout.tsx`,
  `src/app/author/(protected)/layout.tsx`, `src/db/queries`, `src/db/operations`).

Session cookies are `HttpOnly`, `SameSite=Lax`, path `/`, and Secure under production configuration.
Opaque tokens use 32 CSPRNG bytes and are stored as SHA-256 hashes. Auth rate limits fail closed when
Redis is unavailable, but client identity is derived from forwarding headers and therefore depends
on the unversioned reverse-proxy configuration (`src/lib/auth/rate-limits.ts`).

## Input surfaces and dangerous sinks

- Network inputs: App Router handlers under `src/app/**/route.ts`, including quiz state, notifications,
  public/user HUD data, duplicate/provider searches, bug reports and object-image relays.
- Mutation inputs: Server Actions under `src/app/**/actions.ts`, covering login/recovery/registration,
  ratings/reviews/friends/demo import, author submissions and all administrator operations.
- Stored UGC: author names, ratings, reviews, suggestions, bug reports, profile/avatar data and media
  metadata, later rendered by React. React interpolation is escaped by default.
- Files: avatar, cover, quiz, collection and achievement uploads are buffered and processed by
  `sharp`, then written to S3 (`src/lib/avatars/storage.ts`, `src/lib/covers/storage.ts`,
  `src/lib/quizzes/images.ts`, `src/lib/collections/images.ts`, `src/lib/achievements/images.ts`).
- Network fetches: cover/metadata providers, provider-image relay, S3, email, Telegram and AI clients
  (`src/lib/covers`, `src/lib/media/metadata-provider-fetch.ts`, `src/lib/services/minio.ts`,
  `src/lib/auth/resend.ts`, `src/lib/notifications/transports`, `src/lib/ai`).
- Jobs/IPC/config: environment variables, database job payloads and scheduler/worker CLI entrypoints.
  Administrator-created ad-hoc job JSON is dispatched only through the registered handler catalogue
  (`src/app/admin/(protected)/tools/jobs/actions.ts`, `src/lib/jobs`, `src/jobs`).
- SQL goes through Drizzle/postgres-js; Redis Lua is static script text. No application shell/eval sink
  was found; calls named `eval` are Redis Lua execution (`src/lib/rate-limits/redis.ts`,
  `src/lib/main-page`).

## Audit priorities

1. Missing authentication, authorization or ownership checks in any independently callable action.
2. Account lifecycle and forwarded-header trust in login, recovery and registration.
3. Image parsing/upload and remote-fetch SSRF/content validation.
4. Stored/reflected XSS, unsafe redirects and browser trust boundaries.
5. AI output validation, provider credential exposure and job confused-deputy paths.
6. Dependency vulnerabilities and launch/deployment assumptions not enforced by code.
