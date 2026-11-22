# Технологический стек по умолчанию

Дата проверки: 2026-10-11; стек `uweek-cloud` — 2026-11-14. Версии сверены по npm registry (`npm view <пакет> version`), не по памяти. Планировщик пакетов — pnpm 12.3.4, Node.js 24.17.0; в `package.json` версии закреплены точно (без `^`/`~`).

Этот файл — договорённость о «чем мы решаем типовые задачи», чтобы каждая новая функция не заново выбирала инструмент. Спека продукта выше этого списка: `.scratch/uweek-cloud/spec.md` (server-first, см. `docs/adr/0001-server-first-postgres-better-auth.md`).

## Принятые значения по умолчанию

| Задача | Решение | Версия | Почему именно так |
| --- | --- | --- | --- |
| Состояние интерфейса | **zustand** | 5.0.15 | Выбор владельца. Клиентское состояние планера (ввод в строке, перетаскивание, открытая карточка); данные приходят с сервера. MIT, нет runtime-зависимостей, peer `react >=18` (в проекте 19.3.0). Экземпляр создаётся на дерево планера и передаётся через provider, а не общим изменяемым singleton. |
| Валидация данных | **zod** | 4.6.7 | Выбор владельца и спеки: схемы на входе слоя операций; из них же строятся OpenAPI (zod-openapi) и `inputSchema` инструментов MCP. MIT, без зависимостей. С 4.6.6 union, где вариант-массив превышает `.max()`, сообщает `invalid_union` вместо `too_big` (zod#6659, исправлено в main, в 4.6.7 не выпущено). |
| Календарь и даты | свой `src/calendar.ts` | — | Библиотеки дат работают в UTC и ломают календарные даты на границах месяца/года, в високосный год и при смене часового пояса. Собственные `weekOf`/`addDays`/`todayIn` (строки `YYYY-MM-DD`, «сегодня» по IANA-поясу пользователя через `Intl`) остаются единственным источником. |
| Drag-and-drop | собственный `app/drag.ts` на Pointer Events | — | Выбор владельца 2026-11-16 (тикет 07). Мышь и касание — один код: на тачскрине перетаскивание начинается долгим нажатием, линия вставки не сдвигает раскладку, у края окна страница прокручивается. Отклонены: @dnd-kit/core 6.3.1 (MIT, 4 пакета; последний релиз 2024-12, автор перешёл на новый API), @dnd-kit/react 0.5.3 (до 1.0, API меняется; 7 пакетов и @preact/signals-core), нативный HTML5 DnD и @atlaskit/pragmatic-drag-and-drop 4.0.0 (ненадёжны в мобильных браузерах). |
| Идентификаторы | `crypto.randomUUID()` | — | Нативный API, отдельная зависимость не нужна. |
| Оформление | **собственный CSS** (CSS Modules + токены в `:root`) | — | Выбор владельца 2026-11-14 (тикет 02). Встроено в Next.js 16.3.8, зависимостей нет. Визуальный контракт мал: разворот с линейками, шапка, один акцентный цвет. Отклонён tailwindcss 4.3.5 + @tailwindcss/postcss 4.3.5 (MIT, официально поддержан Next 16): ~44 пакета и ~25 МБ в дереве (нативные oxide и lightningcss) ради утилит, которые интерфейсу не нужны. |
| Тесты | Playwright (сквозные сценарии) | 1.63.0 | Сценарии пользователя через роли и подписи. Unit — vitest, интеграционные — на настоящем Postgres (см. «Стек `uweek-cloud`»). |
| Приложение | Next.js (App Router) | 16.3.8 | Интерфейс, серверные действия, REST API и MCP в одном приложении (спека `uweek-cloud`). |

### Стек `uweek-cloud`

Утверждён владельцем 2026-11-14 (тикет `.scratch/uweek-cloud/issues/01-stack-decision.md`, решение — `docs/adr/0001-server-first-postgres-better-auth.md`). Каждый пакет ставится по правилу 6 — в тикете из столбца «Когда». Размер — число пакетов в дереве установки без необязательных peer, включая сам пакет.

Совместимость: ни один пакет не объявляет peer на TypeScript; `engines` у всех допускают Node 24.17 (самый строгий — zod-openapi `>=22.14.0`, vitest `^22.12 || ^24 || >=26`). Peer на Next.js и React есть только у better-auth: `next ^14 || ^15 || ^16`, `react ^18 || ^19`.

| Задача | Решение | Версия | Когда | Почему именно так | Источник |
| --- | --- | --- | --- | --- | --- |
| Доступ к Postgres | **drizzle-orm** | 0.45.4 | 02 | Apache-2.0. Схема — обычный TS-файл, типы видны `tsc` без шага генерации; адаптер better-auth из коробки. 15 пакетов вместе с pg. Риск: 1.0 в rc, мажорный апгрейд ожидаем; peer better-auth уже допускает его (`^0.45.2 \|\| >=1.0.0-rc.1 <2.0.0`). | Context7 `/drizzle-team/drizzle-orm/0.45.4` |
| Драйвер Postgres | **pg** + `@types/pg` (dev) | 8.23.1 / 8.23.1 | 02 | MIT. Peer better-auth и drizzle; `@types/pg` — 11 пакетов. | Context7 `/drizzle-team/drizzle-orm/0.45.4` (node-postgres) |
| Миграции | **drizzle-kit** (dev) | 0.31.11 | 02 | MIT. SQL-миграции генерируются из схемы, применяются `migrate()` из `drizzle-orm/node-postgres/migrator`. 88 пакетов (esbuild, tsx), только dev. | Context7 `/drizzle-team/drizzle-orm/0.45.4` (drizzle-kit README) |
| Аутентификация | **better-auth** | 1.7.23 | 02 (почта), 13 (Google) | MIT. Magic link, Google, сессии в Postgres через drizzle-адаптер и handler для App Router — всё штатно. 36 пакетов вместе с drizzle и pg. | Context7 `/better-auth/better-auth/v1.7.15` (ближайшая версия в Context7) |
| Отправка почты | **resend** | 6.38.1 | 02 | MIT; выбор спеки. 5 пакетов. | npm registry; спека `uweek-cloud` |
| MCP-сервер по HTTP | **@modelcontextprotocol/server** | 2.4.0 | 12 | Apache-2.0, 3 пакета. `createMcpHandler` — web-standard `fetch`-handler: встаёт в route handler Next.js без Node-адаптера, Bearer передаётся как `authInfo`. Host/Origin сам не проверяет. | Context7 `/modelcontextprotocol/typescript-sdk/v2.4.0` |
| MCP-клиент для тестов | **@modelcontextprotocol/client** (dev) | 2.4.0 | 12 | Apache-2.0, 13 пакетов. Проверяет сервер в процессе и против запущенного сервера. | Context7 `/modelcontextprotocol/typescript-sdk/v2.4.0` (docs/testing) |
| OpenAPI из zod | **zod-openapi** | 6.0.2 | 11 | MIT, без зависимостей, peer `zod ^4`. OpenAPI 3.1 из тех же схем через `.meta()` zod 4. | Context7 `/samchungy/zod-openapi` (README master) |
| Лимит частоты запросов | **rate-limiter-flexible** | 11.5.0 | 11 | ISC, без зависимостей. Лимит в памяти на токен хватает для одного контейнера; при нескольких — хранилище Postgres на том же pg Pool без смены API. | Context7 `/animir/node-rate-limiter-flexible` (README master) |
| Unit- и интеграционные тесты | **vitest** + **vite** (dev) | 5.1.0 / 8.3.8 | 03 | MIT. Чистые правила (календарь и часовые пояса, серии, перенос) и слой операций на настоящем Postgres (`uweek_test`). Поставлен в 03 ради первого интеграционного теста (решение владельца 2026-11-15). Понимает импорты без расширений и текущий `tsconfig`; 67 пакетов с vite. Playwright остаётся seam сценариев пользователя. | npm registry (peer `vite ^6.4 \|\| ^7 \|\| ^8`) |

## Явно не берем

| Кандидат (версия на 2026-10-11; строки `uweek-cloud` — на 2026-11-14) | Почему нет |
| --- | --- |
| react-hook-form 7.89.0 + @hookform/resolvers 5.9.1 | В приложении три маленькие формы (быстрый ввод, переименование списка, черновик редактора), они уже управляемые в React. RHF добавил бы вторую модель мышления. Вернуться, если форм станет много и появится асинхронная валидация по полям. |
| date-fns 4.4.0 | См. `src/calendar.ts`: UTC-библиотека ломает календарные даты. |
| immer 11.1.2 | Необязательный peer zustand. Состояние мало, обновления — иммутирующие спреды. Добавить, если вложенные обновления станут источником ошибок. |
| nanoid 6.0.2 | Есть `crypto.randomUUID()`. |
| valibot 1.5.0, arktype 2.2.8 | Альтернативы zod; выбран zod. |
| Redux Toolkit, jotai, mobx, recoil | Альтернативы zustand; выбран zustand. |
| prisma 7.10.1 / 8.0.0-rc.33 (Apache-2.0) | Тег `latest` указывает на rc 8, стабильная 7 — на `prev`; 8 не входит в peer better-auth (`^5 \|\| ^6 \|\| ^7`). 133 пакета, отдельный DSL и шаг `prisma generate`. |
| kysely 0.29.9 (MIT) | 15 пакетов с pg, но миграции и типы БД пишутся вручную; выбран drizzle. |
| postgres 4.1.1 (Unlicense), node-pg-migrate 9.0.0 (MIT) | Драйвер — pg (peer better-auth и drizzle); миграции — drizzle-kit (node-pg-migrate — 36 пакетов с pg). |
| next-auth 5.0.0-beta.32 (ISC), lucia 3.2.2 (MIT), arctic 3.7.0 (MIT) | next-auth 5 только beta; lucia и arctic помечены deprecated. |
| @modelcontextprotocol/sdk 1.32.2 (MIT), mcp-handler 2.4.0 (Apache-2.0) | SDK v1 — 95 пакетов (express, hono); v2 `@modelcontextprotocol/server` делает то же без адаптеров. mcp-handler — лишняя прослойка над v2. |
| @asteasolutions/zod-to-openapi 9.1.0 (MIT) | 3 пакета, отдельный реестр и `openapi3-ts`; zod-openapi работает поверх `.meta()` zod 4 без зависимостей. |
| @upstash/ratelimit 2.2.1 (MIT) | Требует Redis, которого в развёртывании нет. |
| `node:test` | Type stripping в Node 24 требует `.ts` в импортах — пришлось бы переписать импорты `src/` и `tsconfig`. |

## Правила добавления новой зависимости

1. Сначала проверить, не решает ли задачу JavaScript, стандартный Web API, или уже установленная зависимость.
2. Взять текущую стабильную версию из registry (`npm view <пакет> version`), прочитать официальную документацию/Context7 и changelog. Версия из памяти не принимается.
3. Проверить: совместимость с Node 24.17, TypeScript 6.0.3, ESLint 10.12, React 19.3.0; peer-зависимости; лицензию; размер транзитивных зависимостей.
4. Оценить по спеке: не передаёт ли зависимость пользовательские данные третьим сторонам и не противоречит ли визуальному контракту.
5. Закрепить точную версию в `package.json`, обновить `pnpm-lock.yaml` через `pnpm install` (без `--frozen-lockfile` при добавлении).
6. Ставить в том же коммите, где появляется код, который ее использует. Установка «на будущее» запрещена.
7. Обновить этот файл и, если зависимость меняет архитектуру, добавить ADR в `docs/adr/`.

## Текущий момент

Проект переходит на server-first (`docs/adr/0001-server-first-postgres-better-auth.md`). Стек `uweek-cloud` утверждён и ставится по тикетам из столбца «Когда»; zod поставлен тикетом 03 (валидация на входе `src/planner.ts`); zod-openapi и rate-limiter-flexible поставлены тикетом 11; MCP-сервер и MCP-клиент для тестов — тикетом 12; zustand — в первом тикете, где клиентскому состоянию планера станет тесно в `useState` (тикет 03 обошёлся без него). Офлайн-оболочка, IndexedDB и старый интерфейс удалены тикетом 02; из старого кода остались `src/model.ts` и `src/calendar.ts`, а `src/planning.ts` удалён при углублении модулей планировщика. Drag-and-drop — собственный код на Pointer Events (тикет 07). Импорт из Tweek и papaparse удалены по решению владельца 2026-11-16.
