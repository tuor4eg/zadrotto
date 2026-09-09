# Skills Index

- `data-boundaries` — для схемы, queries, persistence и нетривиального маппинга; не для обычного рендера.
- `ai-integrations` — задаёт границы для AI-провайдеров, credentials, системных сценариев, endpoint, ошибок и логирования.
- `media-carrier-skins` — обязателен при создании, правке или ревью оформления носителей: обложки, плейсхолдеры, геометрия, шрифты, hover-эффекты и связанные скины через `getMediaCarrierFrame`.
- `project-structure` — для новых feature boundaries, shared modules и структурных рефакторингов; не для локальных правок.
- `public-archive-ui` — для общей публичной шапки, навигации, контейнеров и согласованной компоновки архива, серий, подборок, рецензий и профилей.
- `domain-events-achievements` — обязателен при добавлении или изменении ачивок, domain events, event consumers, outbox/dispatcher/recovery, backfill и achievement-toast; не для обычных несвязанных jobs.
- `user-state-modes` — обязателен для режимов `plain / demo / authorized`, локального demo-профиля, onboarding, login prompt, импорта в аккаунт и зависящих от режима персональных действий.
- `vercel-react-best-practices` — рекомендации Vercel по производительности React и Next.js: data fetching, waterfalls, bundle size и ререндеры; локальные UI-скиллы сохраняют приоритет в продуктовых и визуальных решениях.
- `next-best-practices` — актуальные соглашения Next.js для App Router, Server Components, async API, route handlers, metadata, изображений и шрифтов.
- `supabase-postgres-best-practices` — общие рекомендации PostgreSQL по схемам, миграциям, индексам, запросам, блокировкам и безопасности; использовать вместе с локальным `data-boundaries`, который определяет доменные правила проекта.
- `security-audit` — многофазный аудит безопасности от Cloudflare: reconnaissance, поиск эксплуатируемых уязвимостей, независимая валидация и структурированный отчёт; использовать для отдельного security-аудита, а не обычного code review.
