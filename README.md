# uWeek

Недельный планер с аккаунтами: вход по ссылке на почту, неделя в виде разлинованного листа, данные в Postgres. Интерфейс только на английском и только онлайн. Спека продукта — `.scratch/uweek-cloud/spec.md`, решение о переходе на сервер — `docs/adr/0001-server-first-postgres-better-auth.md`, версии библиотек — `docs/tech-stack.md`.

## Архитектура

Одно приложение Next.js (App Router) на Node.js: страницы, серверные действия и маршруты API.

- **Postgres 18** — единственный источник истины. Схема описана в `src/db/schema.ts` (Drizzle ORM), SQL-миграции генерируются drizzle-kit в `drizzle/` и применяются `src/db/migrate.ts`.
- **Аутентификация** — better-auth с плагином magic link и входом через Google (`socialProviders.google`): `src/auth.ts`, обработчик `app/api/auth/[...all]/route.ts`. Пользователи, сессии, аккаунты и одноразовые токены входа хранятся в той же базе. Сессия — cookie на 7 дней, продлевается при использовании. Аккаунт Google с подтверждённой почтой привязывается к существующему пользователю с той же почтой без дубликата; неподтверждённую почту better-auth отклоняет.
- **Почта** — Resend (`src/mail.ts`). Если задан `MAIL_OUTBOX_DIR`, письма не отправляются, а записываются JSON-файлами в эту папку: так работают разработка без ключа Resend и Playwright-тесты.
- **Оформление** — собственный CSS: токены в `app/globals.css`, CSS Modules рядом с компонентами. Визуальный контракт — раздел «Визуальный контракт» спеки.
- **Предметная логика** без зависимостей от фреймворка — `src/calendar.ts` (календарные даты без UTC-ошибок, ISO-неделя) и `src/model.ts` (цвета и размещение задачи).

Страницы: `/sign-in` — ввод почты; `/sign-in/confirm?token=…` — ссылка из письма: GET ничего не меняет, вход завершает кнопка «Sign in», поэтому почтовые сканеры и префетчеры ссылку не сжигают; `/` — текущая неделя, `/?week=YYYY-MM-DD` — неделя с этой датой; без сессии перенаправляет на вход. Выход и начало недели — в меню шапки.

## Запуск для разработки

Нужны Node.js 24+, pnpm 12.3.4 и Docker.

```sh
pnpm install --frozen-lockfile
cp .env.example .env       # заполнить BETTER_AUTH_SECRET; для локальной почты раскомментировать MAIL_OUTBOX_DIR
pnpm dev                   # http://127.0.0.1:4200
```

`pnpm dev` сам поднимает Postgres 18 (`docker compose up -d --wait`, 127.0.0.1:5433, базы `uweek` и `uweek_test`) и применяет миграции; `pnpm test` и `pnpm test:e2e` тоже поднимают Postgres сами.

С `MAIL_OUTBOX_DIR=.outbox` ссылка для входа лежит в последнем файле `.outbox/*.json`.

Изменили `src/db/schema.ts` — сгенерируйте миграцию `pnpm db:generate`; запущенный `pnpm dev` применит её сам (следит за `drizzle/meta`); без dev-сервера — `pnpm db:migrate`.

## Вход через Google

Кнопка «Continue with Google» на странице входа появляется, только когда заданы `GOOGLE_CLIENT_ID` и `GOOGLE_CLIENT_SECRET`; без них приложение работает как раньше, со входом по ссылке.

1. В Google Cloud Console → Google Auth Platform заполните Branding и выставьте Audience в External. Пока статус публикации Testing, войти могут только адреса из списка тестовых пользователей.
2. Clients → Create client → Web application.
3. В Authorized redirect URIs укажите `http://127.0.0.1:4200/api/auth/callback/google` для разработки и `https://<домен>/api/auth/callback/google` для продакшена. better-auth строит адрес из `BETTER_AUTH_URL`, а Google сравнивает его точно, поэтому `localhost` и `127.0.0.1` — разные URI. Открытый http разрешён только для localhost и loopback-адресов.
4. Перенесите Client ID и Client secret в `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) и перезапустите `pnpm dev`.

## Проверки

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm test` — интеграционные тесты vitest (`src/**/*.test.ts`) на базе `uweek_test`, миграции применяются перед запуском.

`pnpm test:e2e`: Playwright применяет миграции к базе `uweek_test` и поднимает собственный `next dev` на порту 4172 с отдельной папкой сборки `.next-e2e`, поэтому не мешает уже запущенному `pnpm dev`. Письма перехватываются через `MAIL_OUTBOX_DIR=test-results/outbox`.

## Выкладка

Приложение целиком работает в функциях Vercel (Hobby, регион `fra1` в `vercel.json`), Postgres 18 стоит на VPS в отдельном compose из `deploy/vps` (проект `uweek-db`, другие контейнеры на VPS он не трогает). Наружу открыт только TLS 1.3 на нестандартном порту. Войти по сети может только пользователь `uweek_app`, по scram-sha-256, а суперпользователь доступен лишь изнутри контейнера. Сертификат Let's Encrypt выписан на `db.uweek.top`. pg 8 читает `sslmode=require` как `verify-full`, поэтому самоподписанный сертификат не подойдёт.

### VPS, один раз

1. Добавьте A-запись `db.uweek.top` на IP VPS и откройте в файрволе порт `PG_PORT`.
2. Скопируйте `deploy/vps` в `/opt/uweek-db`, затем `cp .env.example .env` и заполните пароли (`openssl rand -hex 32`).
3. Выпустите сертификат: `sudo certbot certonly --standalone -d db.uweek.top --deploy-hook /opt/uweek-db/install-cert.sh`. На время выпуска порт 80 должен быть свободен; если его занимает прокси, используйте `--webroot` или DNS-проверку. Хук запускается при выпуске и при каждом продлении: он кладёт сертификат в `certs/` и перечитывает конфиг Postgres.
4. `docker compose up -d --wait`. При первом старте создаются база `uweek` и её владелец `uweek_app`.
5. Включите бэкап: `sudo cp systemd/uweek-db-backup.* /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now uweek-db-backup.timer`. Каждый день в 03:15 UTC в `backups/` пишется `pg_dump`; файлы старше `KEEP_DAYS` (по умолчанию 14) удаляются.
6. Проверьте восстановление: `./backup.sh && ./restore-check.sh`. Скрипт развернёт последний дамп в отдельную базу, выведет число строк и удалит её.
7. Подключите fail2ban: `sudo cp -r fail2ban/. /etc/fail2ban/ && sudo systemctl reload fail2ban`, затем `sudo fail2ban-client status uweek-postgres`. Jail читает журнал контейнера и банит в цепочке `DOCKER-USER`: опубликованные Docker порты обходят `INPUT`.

### Vercel

1. Импортируйте репозиторий как проект Next.js и включите «Automatically expose System Environment Variables»: без неё сборка не видит `VERCEL_ENV`.
2. В Production env задайте:
   - `DATABASE_URL=postgres://uweek_app:<APP_DB_PASSWORD>@db.uweek.top:<PG_PORT>/uweek?sslmode=verify-full`;
   - `BETTER_AUTH_SECRET`;
   - `BETTER_AUTH_URL=https://uweek.top`;
   - `RESEND_API_KEY` и `MAIL_FROM` (отправитель на проверенном в Resend домене `uweek.top`);
   - `GOOGLE_CLIENT_ID` и `GOOGLE_CLIENT_SECRET`;
   - `NEXT_PUBLIC_SENTRY_DSN`: DSN проекта GlitchTip;
   - `ENABLE_EXPERIMENTAL_COREPACK=1`: без неё Vercel поставит pnpm по версии lockfile, а не `pnpm@12.3.4`.

   `MAIL_OUTBOX_DIR` и `TEST_CLOCK_COOKIE` не задавайте.

3. Привяжите домен `uweek.top`. В Google Auth Platform добавьте redirect URI `https://uweek.top/api/auth/callback/google`.

Сборку запускает `pnpm build:vercel`. В production-сборке она сначала применяет миграции (`pnpm db:migrate`, повторный запуск ничего не меняет), затем выполняет `next build`. Трафик переключается только после успешной сборки, поэтому до этого момента на новой схеме работает старая версия, и миграция должна быть с ней совместима. Preview-сборки базу не трогают; без `DATABASE_URL` preview не работает.

В каждой функции свой пул: `max: 5`, простаивающие соединения закрываются через 5 с (`attachDatabasePool`). Лимит API (120 запросов в минуту на токен) хранится в таблице `rate_limits` и общий для всех экземпляров. Ошибки сервера и браузера уходят в GlitchTip через `@sentry/nextjs`, если задан `NEXT_PUBLIC_SENTRY_DSN`. Source maps не загружаются, поэтому стеки в GlitchTip минифицированы.

## Лицензия

Собственный код — [MIT](LICENSE). [Уведомления сторонних зависимостей](THIRD_PARTY_NOTICES.md).
