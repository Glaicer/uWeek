# YourWeek

Недельный планер с аккаунтами: вход по ссылке на почту, неделя в виде разлинованного листа, данные в Postgres. Интерфейс только на английском и только онлайн. Спека продукта — `.scratch/yourweek-cloud/spec.md`, решение о переходе на сервер — `docs/adr/0001-server-first-postgres-better-auth.md`, версии библиотек — `docs/tech-stack.md`.

## Архитектура

Одно приложение Next.js (App Router) на Node.js: страницы, серверные действия и маршруты API.

- **Postgres 18** — единственный источник истины. Схема описана в `src/db/schema.ts` (Drizzle ORM), SQL-миграции генерируются drizzle-kit в `drizzle/` и применяются `src/db/migrate.ts`.
- **Аутентификация** — better-auth с плагином magic link: `src/auth.ts`, обработчик `app/api/auth/[...all]/route.ts`. Пользователи, сессии, аккаунты и одноразовые токены входа хранятся в той же базе. Сессия — cookie на 7 дней, продлевается при использовании.
- **Почта** — Resend (`src/mail.ts`). Если задан `MAIL_OUTBOX_DIR`, письма не отправляются, а записываются JSON-файлами в эту папку: так работают разработка без ключа Resend и Playwright-тесты.
- **Оформление** — собственный CSS: токены в `app/globals.css`, CSS Modules рядом с компонентами. Визуальный контракт — раздел «Визуальный контракт» спеки.
- **Предметная логика** без зависимостей от фреймворка — `src/calendar.ts` (календарные даты без UTC-ошибок, ISO-неделя), `src/model.ts`, `src/planning.ts` (используются следующими тикетами).

Страницы: `/sign-in` — ввод почты; `/` — текущая неделя, `/?week=YYYY-MM-DD` — неделя с этой датой; без сессии перенаправляет на вход. Выход и начало недели — в меню шапки.

## Запуск для разработки

Нужны Node.js 24+, pnpm 12.3.4 и Docker.

```sh
pnpm install --frozen-lockfile
cp .env.example .env       # заполнить BETTER_AUTH_SECRET; для локальной почты раскомментировать MAIL_OUTBOX_DIR
pnpm dev                   # http://127.0.0.1:4200
```

`pnpm dev` сам поднимает Postgres 18 (`docker compose up -d --wait`, 127.0.0.1:5433, базы `yourweek` и `yourweek_test`) и применяет миграции; `pnpm test` и `pnpm test:e2e` тоже поднимают Postgres сами.

С `MAIL_OUTBOX_DIR=.outbox` ссылка для входа лежит в последнем файле `.outbox/*.json`.

Изменили `src/db/schema.ts` — сгенерируйте миграцию `pnpm db:generate`; запущенный `pnpm dev` применит её сам (следит за `drizzle/meta`); без dev-сервера — `pnpm db:migrate`.

## Проверки

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm test` — интеграционные тесты vitest (`src/**/*.test.ts`) на базе `yourweek_test`, миграции применяются перед запуском.

`pnpm test:e2e`: Playwright применяет миграции к базе `yourweek_test` и поднимает собственный `next dev` на порту 4172 с отдельной папкой сборки `.next-e2e`, поэтому не мешает уже запущенному `pnpm dev`. Письма перехватываются через `MAIL_OUTBOX_DIR=test-results/outbox`.

## Лицензия

Собственный код — [MIT](LICENSE). [Уведомления сторонних зависимостей](THIRD_PARTY_NOTICES.md).
