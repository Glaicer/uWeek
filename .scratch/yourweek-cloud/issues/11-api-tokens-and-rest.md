# 11: API-токены и REST API v1

**Status:** resolved

**Blocked by:** 08

**What to build:** В настройках пользователь создаёт именованный токен (виден один раз), видит список с префиксом и последним использованием, отзывает. С токеном внешний клиент работает с задачами, списками и вхождениями через `/api/v1`; документация OpenAPI доступна публично.

- [x] Хранится только хэш токена; отозванный токен сразу перестаёт работать.
- [x] Эндпоинты вызывают тот же слой операций, что интерфейс; валидация — те же zod-схемы; OpenAPI генерируется из них.
- [x] Единый формат ошибок; 401 без токена, 404 (не 403) на чужой ресурс; лимит частоты на токен с 429.
- [x] Интеграционные тесты через HTTP: полный цикл задачи, диапазон дат с вхождениями серий, отзыв токена, изоляция пользователей, лимит.

## Ticket plan

Base: `562b123` on `dev`, planned 2026-11-16.

### Rules for the implementer

- Follow this plan: its approach, files, signatures and test cases are decided. The acceptance criteria above still define done.
- First run the stale check: `git diff --stat 562b123 HEAD -- package.json pnpm-lock.yaml docs/tech-stack.md src/db/schema.ts drizzle/0008_api_tokens.sql drizzle/meta/0008_snapshot.json drizzle/meta/_journal.json src/planner-schemas.ts src/planner-schemas.test.ts src/planner.ts src/planner.test.ts src/api-tokens.ts src/api-tokens.test.ts src/api-errors.ts src/api-access.ts src/api.ts src/openapi.ts src/openapi.test.ts ':(literal)app/api/v1/[[...path]]/route.ts' app/settings/api-tokens/page.tsx app/settings/api-tokens/actions.ts app/settings/api-tokens/token-manager.tsx app/settings/api-tokens/api-tokens.module.css app/page.tsx app/week.module.css tests/api-helpers.ts tests/api.spec.ts tests/api-tokens.spec.ts`. No output means the plan is current.
- The seam and test cases under Steps are pre-agreed with the user; they satisfy `tdd`'s seam confirmation.
- Local fixes are yours to make: imports, local names, formatting, an extra test case for an edge case you find.
- Stop before review and commit, leaving the work uncommitted, when the stale check prints anything, when a path, symbol or signature here differs from the code, when a file outside Changes must change, when a step's check stays red after a local fix, or when every step is done and an acceptance criterion is still unmet. Report the step, what the plan expected, and what you found.

### Approach

Один Route Handler `/api/v1/[[...path]]` передаёт стандартный `Request` в `handleApiRequest`; REST не обращается к таблицам планера, а вызывает `src/planner.ts`. Входные zod-схемы выносятся в чистый модуль и используются операциями и генератором OpenAPI; существующие импорты интерфейса сохраняются через реэкспорты. Отдельные модули токенов и Bearer-доступа оставляют тикету 12 готовую проверку пользователя без зависимости от REST-диспетчера. Тесты HTTP идут через Playwright к настоящему Next.js и Postgres, не через прямой вызов обработчика.

Rejected: API-key plugin better-auth и отдельные CRUD-операции для REST: плагин не входит в согласованный стек, собственные REST-операции расходились бы с интерфейсом и MCP. По одному Route Handler на действие тоже не делаем: здесь один вход проще и оставляет проверку Bearer, лимит и формат ошибок в одном месте; отдельный HTTP-фреймворк не нужен.

Владелец подтвердил контракт, seam, порядок сценариев, версии двух зависимостей и проверочный запуск Playwright 2026-11-16. Блокер 08 присутствует в базе: `1656ad2` — предок `562b123`, `src/planner.ts` содержит вычисление и изменение вхождений.

### Reuse

- `src/planner.ts`: `createTask`, `updateTask`, `deleteTask`, `listTasks`, `createList`, `renameList`, `moveList`, `deleteList`, `withChecklists`, `withOccurrences`, `snapshot`, `owned`, `ownedList`, `taskColumns`, `taskOrder`, `listColumns`, `listOrder`, `virtualTask`, `seriesOf`, `rollOverUnfinishedTasks`. CRUD не переписывать.
- `src/planner.ts`: существующие `Task`, `TaskList`, `TaskEdits`, `Scope`, `Recurrence` остаются интерфейсом для `app/actions.ts` и `app/week.tsx`.
- `src/calendar.ts`: `validCalendarDate`, `todayIn`, `addDays`; `src/recurrence.ts`: `occurrences`. Календарные даты остаются строками, не timestamp.
- `src/db/schema.ts`: `pgTable`, `createdAt`, `users`; `src/db/client.ts`: `db` и образец typed `globalThis` singleton для переживания hot reload.
- `app/page.tsx`, `app/actions.ts`, `app/sign-in/page.tsx`: `auth.api.getSession({ headers: await headers() })`, redirect гостя; `refresh()` после изменения данных. Авторизация настроек остаётся сессионной, не Bearer.
- `app/sign-in/sign-in-form.tsx`: образец `useActionState`, pending и `role="alert"`; `app/globals.css`: существующие цветовые токены.
- `src/planner.test.ts`, `src/search.test.ts`: настоящий Postgres, новый пользователь на сценарий, `afterAll(() => db.$client.end())`.
- `tests/sign-in.spec.ts`, `tests/mail.ts`: `signIn`; `tests/clock.ts`: `pinServerClock`, `testClockCookie`; `app/clock.ts`: `requestTime`. Не заменять их обходом входа через SQL.
- `playwright.config.ts`, `vitest.config.ts`, `tests/database.ts`: готовые тестовые сервер, БД и миграции; конфиги менять не требуется.

### Changes

- `package.json` (edit): runtime-зависимости `zod-openapi` **6.0.2**, `rate-limiter-flexible` **11.5.0**, обе exact. Других зависимостей и scripts не добавлять.
- `pnpm-lock.yaml` (edit): результат `pnpm add --save-exact zod-openapi@6.0.2 rate-limiter-flexible@11.5.0`.
- `docs/tech-stack.md` (edit): у лимитера заменить 11.4.1 на 11.5.0, отметить установку обоих пакетов тикетом 11; сохранить остальные договорённости.
- `src/db/schema.ts` (edit): новая таблица `apiTokens`, описанная ниже.
- `drizzle/0008_api_tokens.sql` (new), `drizzle/meta/0008_snapshot.json` (new), `drizzle/meta/_journal.json` (edit): один результат `pnpm exec drizzle-kit generate --name=api_tokens`; старые миграции не менять.
- `src/planner-schemas.ts` (new): перенесённые входные схемы, новые схемы запроса/ответов.
- `src/planner-schemas.test.ts` (new): нормализация дней недели, границы запроса и формы ответов.
- `src/planner.ts` (edit): импорт схем, совместимые реэкспорты; новые `queryTasks`, `getTask`, `listLists`, `preparePlannerRead`, `PlannerInputError`; `readWeek` использует общий перенос.
- `src/planner.test.ts` (edit): проверки новых чтений и сохранения поведения `readWeek`.
- `src/api-tokens.ts` (new): создание, список, отзыв, проверка токена, его входная схема и публичные типы.
- `src/api-tokens.test.ts` (new): хранение только хэша, активный список, изоляция и отзыв.
- `src/api-errors.ts` (new): типы ошибок и единственный перевод ошибок в HTTP.
- `src/api-access.ts` (new): Bearer-проверка и общий лимитер на токен.
- `src/api.ts` (new): HTTP-декодирование, выбор операции планера, ответы.
- `src/openapi.ts` (new): генерация публичного OpenAPI из общих схем.
- `src/openapi.test.ts` (new): генерация, пути, схемы и соответствие маршрутам.
- `app/api/v1/[[...path]]/route.ts` (new): только передача запроса и `await requestTime()` в `handleApiRequest`.
- `app/settings/api-tokens/page.tsx` (new): защищённая страница с активными токенами.
- `app/settings/api-tokens/actions.ts` (new): сессионные server actions создания и отзыва.
- `app/settings/api-tokens/token-manager.tsx` (new): формы, однократный показ секрета, список.
- `app/settings/api-tokens/api-tokens.module.css` (new): оформление страницы настроек.
- `app/page.tsx` (edit): ссылка `API tokens` в существующем меню.
- `app/week.module.css` (edit): `.menuItem` пригоден и для ссылки: `display: block`, `text-decoration: none`; остальное меню и планер не переделывать.
- `tests/api-helpers.ts` (new): создание пользователя/токена через интерфейс и отдельного HTTP-клиента.
- `tests/api.spec.ts` (new): HTTP-приёмка REST, ошибок, отзыва и лимита.
- `tests/api-tokens.spec.ts` (new): приёмка страницы токенов.

**Зависимости — проверено при планировании:** npm registry через `pnpm view ...@latest` вернул 6.0.2 и 11.5.0; у обоих нет runtime-зависимостей. zod-openapi требует Node >=22.14 и zod ^4, что совместимо с проектом; лицензии MIT/ISC. Источники: Context7 `/samchungy/zod-openapi`, `/animir/node-rate-limiter-flexible`, [zod-openapi releases](https://github.com/samchungy/zod-openapi/releases), [limiter releases](https://github.com/animir/node-rate-limiter-flexible/releases). В 11.5.0 изменение округления длительностей меньше секунды касается внешних хранилищ; выбранный memory/60s не затрагивает. zod-openapi v6 возвращает тип OpenAPI 3.2, поэтому не аннотировать результат устаревшим `oas31.OpenAPIObject`; документ генерировать с `openapi: "3.1.0"`.

**Таблица `apiTokens` в `src/db/schema.ts` (new export).** SQL-имя `api_tokens`; поля `id: text PK`, `userId: text NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `name: text NOT NULL`, `tokenHash: text NOT NULL UNIQUE`, `prefix: text NOT NULL`, `createdAt: timestamptz NOT NULL DEFAULT now()`, `lastUsedAt: timestamptz NULL`, `revokedAt: timestamptz NULL`; индекс на `userId`. Использовать существующий casing snake_case. Секрет, его обратимо зашифрованная копия и полный Authorization не хранятся.

**Схемы `src/planner-schemas.ts`.** Перенести определения из базы, сохраняя их имена и ограничения: `isoDate`, `title`, `occurrenceId`, `taskId`, `scope`, `interval`, `until`, `repeat`, `range`, `index`, `placement`, `newTask`, `newList`, `listId`, `listMove`, `edits`, `timeZone`, `settings`, `weekQuery`, `searchQuery`; экспортировать используемые вне файла определения. `occurrenceId` остаётся RegExp, не zod-схемой. `TaskEdits = z.input<typeof edits>` перенести сюда; из `src/planner.ts` реэкспортировать `TaskEdits` и `weekQuery`, чтобы существующие callers не менялись.

Единственное изменение нормализации при переносе: у `repeat`/weekly заменить type-preserving `.transform(...)` на `.overwrite(...)` с тем же удалением дублей и сортировкой. Так вход и результат не меняются, но `repeat` конвертируется в JSON Schema и для ответа. Работоспособность `.overwrite` на установленном zod 4.6.7 проверена: `[5,1,5]` → `[1,5]`, `z.toJSONSchema` сохраняет массив с ограничениями. У `isoDate` добавить JSON-Schema-видимый regex `^\d{4}-\d{2}-\d{2}$` и `.meta({ format: "date" })` перед существующим `refine(validCalendarDate)`; допустимые значения не меняются.

Новые схемы:

```ts
// src/planner-schemas.ts — new types; схемы выводят эти формы.
export type TaskQuery = (
  | { from: string; to: string; listId?: never }
  | { listId: string; from?: never; to?: never }
) & { completed?: "true" | "false"; q?: string };
export const taskQuery = /* z.xor двух strict objects описанной формы */;
export const scopeQuery = /* strict object: { scope: scope.default("this") } */;
export const taskResult = /* z.xor: общие поля Task + date ИЛИ listId */;
export const listResult = /* object: { id: listId, title } */;
```

`taskQuery`: обе даты обязательны вместе, включительно, `from <= to`, разница не больше 365 суток (366 дат); считать разницу календарных дат через UTC midnight, не локальный TZ. `listId` — существующая uuid-схема; диапазон и список взаимоисключающие. `completed` — строго строки `"true"`/`"false"`, без `z.coerce.boolean()`; `q` — trim/min(1)/max(500), подстрока названия или заметки без учёта регистра. Неизвестные query-поля запрещены. Новые схемы ответа описывают **текущий** `Task`: id, title, completed boolean, notes string, color nullable enum, checklist `{id,text,completed}[]`, optional recurrence `{seriesId,occurrence,repeat}`, ровно date или listId; никаких userId/position/служебных полей. Использовать те же примитивы и `repeat`, а не второе описание этих правил. Старую `range` не ограничивать 366 днями: старые callers сохраняют поведение.

**Операции в `src/planner.ts`.** Следующие symbols новые; существующие CRUD-сигнатуры не менять:

```ts
export class PlannerInputError extends Error {}
async function preparePlannerRead(
  userId: string, now: Date,
): Promise<{ timeZone: string | null; weekStartsOn: WeekStart; today: string }>;
export async function queryTasks(
  userId: string, input: z.input<typeof taskQuery>, now: Date,
): Promise<Task[]>;
export async function getTask(
  userId: string, id: string, now: Date,
): Promise<Task | null>;
export async function listLists(userId: string): Promise<TaskList[]>;
```

- `preparePlannerRead` — извлечь существующие чтение настроек, `todayIn` и условный `rollOverUnfinishedTasks` из `readWeek`, сохранив пропуск переноса при `timeZone === null`. `readWeek` сохраняет свою сигнатуру и результат, включая focus.
- `queryTasks` валидирует `taskQuery`, вызывает `preparePlannerRead` один раз. Для дат использует существующий `listTasks`/snapshot; для списка проверяет владение и читает его строки в snapshot через `withChecklists`/`taskOrder`. Отсутствующий или чужой список — `null` не возвращать: бросить `PlannerNotFoundError`, описанный ниже. Фильтровать **после** объединения виртуальных вхождений и сохранённых исключений: completed и literal `toLowerCase().includes(q.toLowerCase())` по title/notes. Поэтому `%`, `_`, `\` не становятся wildcard. Возвращать Task[] в существующем порядке, без пагинации в этой версии.
- `getTask` валидирует `taskId`, выполняет общий перенос и читает snapshot. Сначала искать сохранённую собственную неделетированную строку по **точному id** и собирать через `withChecklists`; это важно для уже перенесённого вхождения. Если строки нет и id синтетический, читать только собственную серию, проверять реальность occurrence через `validCalendarDate` и `occurrences(seriesOf(...), date, date)`, учитывать tombstone и строку с той же парой `(seriesId, occurrence)` даже под иным id, и только затем вызывать `virtualTask`. GET не материализует будущую виртуальную задачу. Отсутствующее/чужое/удалённое вхождение → null.
- `listLists` — собственные `listColumns` в `listOrder`, без чтения недели и переноса.
- В `startSeries` заменить существующий `Error("Only a dated task repeats")` на `PlannerInputError` с тем же сообщением: некорректный пользовательский ввод должен дать 400, не 500; транзакция откатывается. Других изменений правил повторов не делать.
- Новый `export class PlannerNotFoundError extends Error {}` — только для отсутствующего/чужого списка в `queryTasks`; `apiErrorResponse` переводит его в общий 404 без исходного message.

**Токены `src/api-tokens.ts` (все declarations новые):**

```ts
export const tokenCreate = /* z.object({ name: trim/min(1)/max(100) string }) */;
export interface ApiTokenInfo {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}
export interface ApiPrincipal { userId: string; tokenId: string }
export async function createApiToken(
  userId: string, input: z.input<typeof tokenCreate>,
): Promise<{ token: string; info: ApiTokenInfo }>;
export async function listApiTokens(userId: string): Promise<ApiTokenInfo[]>;
export async function revokeApiToken(userId: string, id: string): Promise<boolean>;
export async function authenticateApiToken(token: string): Promise<ApiPrincipal | null>;
```

Секрет: `yw_` + `randomBytes(32).toString("base64url")` из `node:crypto`; tokenHash = SHA-256 **полной** строки в hex, prefix = первые 11 символов полной строки, id = `crypto.randomUUID()`. Даты `ApiTokenInfo` — ISO 8601 strings, не Date. `createApiToken` возвращает секрет только в результате создания; `listApiTokens` явно выбирает безопасные поля, только `revokedAt IS NULL`, порядок createdAt DESC/id ASC. Имена не уникальны. Истечения срока и scopes в этой версии нет.

`revokeApiToken` валидирует uuid и ограничивает UPDATE userId+id; выставляет revokedAt только если он ещё null, уже отозванный собственный токен тоже возвращает true; чужой/отсутствующий — false. `authenticateApiToken` отвергает строки вне `^yw_[A-Za-z0-9_-]{43}$`, вычисляет хэш и одной операцией UPDATE с `tokenHash` + `revokedAt IS NULL` обновляет lastUsedAt и возвращает principal либо null. Не кешировать результат проверки: после завершения отзыва **следующая** авторизация уже не проходит; запрос, авторизованный до отзыва, может завершиться.

**HTTP-ошибки и доступ (новые declarations):**

```ts
// src/api-errors.ts
export type ApiErrorCode =
  | "invalid_request" | "unauthorized" | "not_found" | "method_not_allowed"
  | "conflict" | "unsupported_media_type" | "rate_limited" | "internal_error";
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly headers: HeadersInit | undefined;
  constructor(code: ApiErrorCode, message: string, headers?: HeadersInit);
}
export const apiErrorResult = /* z.object({ error: { code: enum above, message: string } }) */;
export function apiErrorResponse(error: unknown): Response;

// src/api-access.ts
export async function authorizeApiRequest(request: Request): Promise<ApiPrincipal>;
```

Единственная таблица соответствия code → status в `api-errors.ts`: invalid_request 400, unauthorized 401, not_found 404, method_not_allowed 405, conflict 409, unsupported_media_type 415, rate_limited 429, internal_error 500. JSON всегда `{error:{code,message}}`. ZodError, ошибка разбора JSON и `PlannerInputError` → 400 с безопасным сообщением; `PlannerNotFoundError` → общий 404. Пойманный Drizzle/Postgres error проверять как unknown по цепочке cause: **только** SQLSTATE `23503` + constraint `tasks_user_id_list_id_lists_user_id_id_fk` → 404 (создание/перенос в чужой или отсутствующий список); `23505` → 409, в т.ч. коллизия id чек-листа. Не превращать любые ошибки БД в 404. Прочее → 500 `Internal server error`, без SQL, stack, исходного message и содержимого Authorization. Сообщение любого 404: `Resource not found`.

`authorizeApiRequest` принимает только Authorization Bearer (название схемы без учёта регистра, ровно один непустой credential), не session cookies. Проверяет через `authenticateApiToken` **каждый запрос**, затем consume одного point по tokenId. Один typed globalThis singleton `yourweekApiLimiter` с `RateLimiterMemory({points:120,duration:60})`, по образцу Pool: общий для всех защищённых маршрутов и hot reload, без Redis/новой конфигурации. Отказ лимитера `RateLimiterRes` → `ApiError("rate_limited", "Rate limit exceeded", {"Retry-After": ceil(msBeforeNext/1000), минимум 1})`; другие ошибки не маскировать. 401 добавляет `WWW-Authenticate: Bearer`. lastUsedAt обновляется при успешной проверке токена, даже если дальше 400/404/429. Масштабирование за пределы одного Node-процесса требует другого хранилища — не реализовывать здесь.

**REST и OpenAPI (новые declarations):**

```ts
// src/api.ts
export async function handleApiRequest(request: Request, now: Date): Promise<Response>;
// src/openapi.ts — тип результата вывести из createDocument, без ручного OpenAPIObject.
export function createOpenApiDocument(): ReturnType<typeof createDocument>;
// app/api/v1/[[...path]]/route.ts
async function handle(request: Request): Promise<Response>;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Экспортировать handle под GET, POST, PATCH, DELETE, PUT, OPTIONS.
// HEAD поручить встроенному Next.js поведению на основе GET.
```

В `handle` передать `await requestTime()`, не создавать отдельные часы. `handleApiRequest` не импортирует db/schema/auth; авторизация из `api-access`, данные из planner. Публичен только GET/HEAD документа; другие пути сначала требуют Bearer, затем возвращают 404/405. Вся обработка обёрнута одним `apiErrorResponse`. У защищённых ответов, включая ошибки, `Cache-Control: no-store`.

Все пути ниже относительно `/api/v1`, успешные объекты/массивы — без data-envelope:

| Method/path | Input и вызываемая операция | Success |
| --- | --- | --- |
| GET `/openapi.json` | `createOpenApiDocument()`; без авторизации и лимита | 200, OpenAPI JSON |
| GET `/tasks` | `taskQuery`, `queryTasks(userId, input, now)` | 200 Task[] |
| POST `/tasks` | `newTask`, `createTask` | 201 Task, Location `/api/v1/tasks/{id}` |
| GET `/tasks/{id}` | `taskId`, `getTask(userId,id,now)` | 200 Task; null → 404 |
| PATCH `/tasks/{id}` | `edits`, query `scopeQuery`, `updateTask` | 200 Task; null → 404 |
| DELETE `/tasks/{id}` | query `scopeQuery`, `deleteTask` | 204; false → 404 |
| POST `/tasks/{id}/complete` | без body, `updateTask(userId,id,{completed:true})` | 200 Task; null → 404 |
| POST `/tasks/{id}/uncomplete` | без body, `updateTask(userId,id,{completed:false})` | 200 Task; null → 404 |
| POST `/tasks/{id}/move` | body `placement`, `updateTask(userId,id,{placement:input})` | 200 Task; null → 404 |
| GET `/lists` | `listLists(userId)` | 200 TaskList[] |
| POST `/lists` | `newList`, `createList` | 201 TaskList |
| PATCH `/lists/{id}` | `listId`, body `newList`, `renameList` | 200 TaskList; null → 404 |
| DELETE `/lists/{id}` | `listId`, `deleteList` | 204; false → смотреть ниже |
| POST `/lists/{id}/move` | `listId`, body `listMove`, `moveList` | 204; false → 404 |

Если `deleteList` вернул false, вызвать `listLists`: id принадлежит пользователю → 409 `Cannot delete the last list`; id отсутствует → 404. Не делать GET `/lists/{id}`, `/series`, REST-управление токенами, Swagger UI или MCP в этом тикете. Repeat задаётся PATCH существующей задачи; complete/move всегда scope this. PATCH/DELETE scope по умолчанию this; передавать его отдельным аргументом, не в edits.

Декодирование: работать с `new URL(request.url)`, безопасно декодировать сегменты, ловить malformed percent encoding как 400; query с повторённым ключом → 400, не молча брать последний. Для `/tasks` и PATCH/DELETE query валидируются общими схемами; у остальных операций query должен быть пустым. Для операций с body требовать `Content-Type: application/json` (параметр charset допустим): иной/отсутствующий → 415, невалидный JSON → 400, shape → Zod 400. Для complete/uncomplete body не требуется. Не менять существующую политику strip неизвестных JSON-полей старых входных схем. Неизвестный путь → общий 404; известный путь с неподдерживаемым method → 405 и корректный Allow; OPTIONS явно возвращает 405, CORS не добавлять. HEAD повторяет GET status/headers и по HTTP не имеет body.

`createOpenApiDocument`: `createDocument` из zod-openapi, `openapi: "3.1.0"`, info title `YourWeek API`, version `1.0.0`, server `/api/v1`, security scheme `bearerAuth` HTTP/bearer. Документировать все защищённые операции таблицы, scopes, лимит, 429/Retry-After, общий формат ошибок и дату в TZ владельца; самому `/openapi.json` описание операции не требуется. Использовать `requestParams`, `requestBody`, `taskResult`, `listResult`, `apiErrorResult` и общие схемы входа; path id тоже строить из taskId/listId. Не вписывать вручную копии JSON Schema и не разрешать пустые схемы для подавления ошибки конвертации. Зависимость schemas от planner только type-only, если понадобится проверка соответствия `Task`; runtime-импорта planner в schemas/openapi не должно быть.

**Страница токенов (новые declarations):**

```ts
// app/settings/api-tokens/actions.ts — "use server"
export type CreateTokenState =
  | { status: "idle" } | { status: "created"; token: string }
  | { status: "error"; message: string };
export type RevokeTokenState =
  | { status: "idle" } | { status: "revoked" }
  | { status: "error"; message: string };
export async function createApiToken(
  previous: CreateTokenState, form: FormData,
): Promise<CreateTokenState>;
export async function revokeApiToken(
  previous: RevokeTokenState, form: FormData,
): Promise<RevokeTokenState>;
// app/settings/api-tokens/page.tsx
export default async function ApiTokensPage(): Promise<React.JSX.Element>;
// app/settings/api-tokens/token-manager.tsx — "use client"
export function TokenManager(
  props: { tokens: ApiTokenInfo[] },
): React.JSX.Element;
```

Оба actions сами получают userId из сессии через headers, гостя отправляют в `/sign-in`; userId не приходит из формы. Вызвать одноимённые функции `src/api-tokens.ts` через namespace import, в create прочитать name, в revoke id; Zod/отсутствующий собственный id дают action-state error, не падение страницы. После успеха `refresh()`; секрет только в created state. Никаких localStorage, sessionStorage, URL/query, логов, hidden inputs с секретом.

Страница: `main`, h1 `API tokens`, ссылка `Back to week`, ссылка `OpenAPI` на `/api/v1/openapi.json`; клиенту передаётся только `listApiTokens(session.user.id)`. Создание: label `Token name`, maxLength 100, button `Create token`; pending блокирует повторную отправку. Created state: `Copy this token now. You won't be able to see it again.`, read-only textbox `New API token`, button `Hide token`, очищающий показанный секрет; после reload/ухода секрета нет. Таблица/список активных записей показывает name, prefix, createdAt, lastUsedAt (`Never used` для null) и button с accessible name `Revoke {name}`; пустой список — `No API tokens yet.`. Revoke отправляет id, после успеха строка исчезает, ошибка видима через `role="alert"`. Использовать раздельные `useActionState` для create/revoke; общий pending отзыва допустим для всех строк.

CSS Modules: страница max-width 720px, padding 48px 24px; на 360px padding 24px 16px, формы/список не выходят за экран, длинные имена/префиксы переносятся. Цвета из globals; формы по стилю SignInForm, без новых иконок. В `app/page.tsx` перед Sign out вставить Next Link `API tokens` с существующим `.menuItem`. Не менять настройки начала недели.

**HTTP-помощники `tests/api-helpers.ts` (new):**

```ts
export interface ApiUser {
  page: Page;
  token: string;
  client: APIRequestContext;
  close(): Promise<void>;
}
export async function issueApiToken(page: Page, name: string): Promise<string>;
export async function newApiUser(browser: Browser, baseURL: string): Promise<ApiUser>;
```

`issueApiToken` работает через страницу настроек и возвращает inputValue у `New API token`, не SQL и не внутренний action. `newApiUser` создаёт отдельный browser context с baseURL и timezoneId Europe/Moscow, pinServerClock на `2026-11-09T10:00:00+03:00`, вызывает существующий `signIn`, открывает меню → API tokens и выдаёт токен `Agent`. Его `client` — отдельный `request.newContext` с Bearer, baseURL и **только тестовым clock-cookie** (`testClockCookie`, значение того же ISO-времени); сессионные cookie не копировать. `close` закрывает HTTP-клиент и browser context. Каждый сценарий получает свежего пользователя и закрывает его через finally/fixture teardown; тестам лимита нужен ещё не использованный токен. Чужого пользователя создавать тем же помощником, без чтения чужой БД из HTTP-тестов.

### Steps

Seam: публичные операции токенов/чтения на настоящем Postgres; HTTP через `APIRequestContext` к Next.js из существующего Playwright webServer; UI через роли/подписи. Model test: `src/planner.test.ts`, `tests/sign-in.spec.ts`. Каждый пункт с Test — один сценарий: сначала написать тест и увидеть ожидаемый red, затем минимальный green; последующие пункты не реализовывать заранее.

1. Check-only: установить ровно две согласованные зависимости, обновить запись стека. Check: `pnpm list zod-openapi rate-limiter-flexible --depth 0` показывает 6.0.2/11.5.0; `pnpm typecheck`.
2. Test `"planner schemas preserve weekly normalization and serialize planner results"` в `src/planner-schemas.test.ts`: weekly `[5,1,5]` нормализуется в `[1,5]`, `taskResult` принимает текущие dated/list/recurring формы Task и отвергает обе placement сразу; `z.toJSONSchema(repeat)` сохраняет ограничения массива. Red на отсутствующем модуле, затем перенос схем/overwrite/реэкспорты без изменения CRUD. Check: `pnpm test src/planner-schemas.test.ts src/planner.test.ts src/search.test.ts`.
3. Test `"a named token is returned once and only its hash is stored"` в `src/api-tokens.test.ts`: создать пользователя по образцу planner.test, выдать name с пробелами, проверить trim, формат 32 random bytes, SHA-256 в единственной записи, безопасный prefix и ISO-даты; `listApiTokens` не содержит token/tokenHash/userId. Red, затем schema/apiTokens, одна новая миграция и create/list. Check: `pnpm test src/api-tokens.test.ts`.
4. Test `"token names are required and bounded"` в `src/api-tokens.test.ts`: name пустой/пробельный/101 символ отвергается и не пишет строк; 100 символов принимается. Red, затем ограничения tokenCreate. Check: `pnpm test src/api-tokens.test.ts`.
5. Test `"a valid token resolves its owner and records usage"` в `src/api-tokens.test.ts`: сразу lastUsedAt null, после authenticate правильный principal и непустая дата; неправильный/повреждённый секрет → null, не меняет дату правильного. Red, затем authenticate. Check: `pnpm test src/api-tokens.test.ts`.
6. Test `"token inventory and idempotent revocation are isolated by owner"` в `src/api-tokens.test.ts`: два пользователя; чужой id не виден/не отзывается, свой отзыв дважды true, revokedAt не перезаписывается, активный список пуст, немедленная authenticate → null, второй токен работает. Red, затем revoke/filter. Check: `pnpm test src/api-tokens.test.ts`.
7. Test `"task queries require one bounded placement filter"` в `src/planner-schemas.test.ts`: from=to и 366 дат допустимы; 367, обратный диапазон, одна дата, дата+listId, никакого размещения, невалидная дата, completed=anything и дублирующее размещение запрещены; false остаётся строкой `"false"`. Red, затем taskQuery. Check: `pnpm test src/planner-schemas.test.ts`.
8. Test `"queryTasks filters stored and virtual tasks by placement status and literal text"` в `src/planner.test.ts`: без TZ, будущая daily серия, изменённая заметка одного вхождения, выполненное вхождение, задача списка и чужие данные; диапазон/список и completed/q дают точный набор, q учитывает override и literal `%_`, чужой/несуществующий список бросает PlannerNotFoundError. Red, затем queryTasks/listLists. Check: `pnpm test src/planner.test.ts`.
9. Test `"task queries and week reads share timezone rollover without duplicates"` в `src/planner.test.ts`: Europe/Moscow, now перед UTC-полуночью, просроченная обычная задача и пропущенная серия; queryTasks → readWeek → queryTasks показывают одинаковый перенос в локальное сегодня и исходные occurrence без повторного добавления; дополнительно пользователь без TZ не переносится. Red, затем извлечение preparePlannerRead. Check: `pnpm test src/planner.test.ts src/search.test.ts`.
10. Test `"getTask reads stored and virtual occurrences without materializing a future one"` в `src/planner.test.ts`: собственная обычная/будущая виртуальная задача читается, число строк tasks не увеличивается от виртуального GET; после переноса найден точный сохранённый id и новое место, tombstone/чужое/отсутствующее → null. Red, затем getTask. Check: `pnpm test src/planner.test.ts`.
11. Test `"OpenAPI is generated from the shared planner schemas"` в `src/openapi.test.ts`: генерация не бросает, version 3.1.0, server/security верны, все 13 защищённых method/path-пар из таблицы присутствуют, request и response содержат title/placement/weekly/monthEnd/checklist и общий error; date format и XOR отражены. Сравнивать конкретные ограничения с результатом общих схем, не только snapshot/наличие объекта. Red, затем createOpenApiDocument. Check: `pnpm test src/openapi.test.ts`.
12. Test `"the OpenAPI document is public over HTTP"` в `tests/api.spec.ts`: независимый request без session/Bearer получает 200 JSON с paths/security, не редирект. Red, затем catch-all Route Handler и публичная ветка handleApiRequest. Check: `pnpm test:e2e tests/api.spec.ts --grep "the OpenAPI document"`.
13. Test `"API token settings require a session"` в `tests/api-tokens.spec.ts`: гость на `/settings/api-tokens` → `/sign-in`; после signIn ссылка меню открывает страницу без потери остального меню. Red, затем защищённая page, ссылка и минимальное оформление. Check: `pnpm test:e2e tests/api-tokens.spec.ts --grep "require a session"`.
14. Test `"a user creates a named token and sees its secret only once"` в `tests/api-tokens.spec.ts`: через Token name/Create token; проверить предупреждение, полный секрет и безопасные колонки, Hide token убирает секрет, reload показывает только метаданные; новый токен снова можно создать. Red, затем create action/TokenManager/issueApiToken. Check: `pnpm test:e2e tests/api-tokens.spec.ts --grep "secret only once"`.
15. Test `"protected HTTP routes accept Bearer but never a session alone"` в `tests/api.spec.ts`: GET lists без заголовка, с неверным токеном, с Basic и с одной сессией → одинаковый 401 JSON + WWW-Authenticate; новый API-клиент с Bearer без сессии → 200 и Inbox, на странице после reload lastUsedAt не Never used. Red, затем api-errors/api-access и GET lists. Check: `pnpm test:e2e tests/api.spec.ts --grep "accept Bearer"`.
16. Test `"a task completes its full HTTP lifecycle"` в `tests/api.spec.ts`: POST dated → 201/Location/default fields; GET by id; PATCH title/notes/color/checklist; complete и uncomplete; POST move в дату с index; GET range проверяет порядок; DELETE → 204 и GET → 404. После API-правки UI после reload показывает то же название и выполнение. Red, затем соответствующие ветки диспетчера и PlannerInputError. Check: `pnpm test:e2e tests/api.spec.ts --grep "full HTTP lifecycle"`.
17. Test `"lists and their tasks are managed over HTTP"` в `tests/api.spec.ts`: POST два списка, PATCH имя, move первого/второго, GET lists в новом порядке; создать задачу списка, GET tasks?listId даёт её, переместить задачу из даты в список и обратно; удалить список с задачей, задача исчезает; удалить все, кроме последнего, последний → 409. Red, затем маршруты списков и недостающие чтения. Check: `pnpm test:e2e tests/api.spec.ts --grep "lists and their tasks"`.
18. Test `"HTTP task queries filter a date range and list by status and text"` в `tests/api.spec.ts`: отдельные dated/list/выполненные задачи; from/to включают обе границы; completed=false не возвращает выполненные; q находит заметку без учёта регистра и трактует `%_` буквально; неверный фильтр → 400. Red, затем HTTP query-декодирование/интеграция queryTasks. Check: `pnpm test:e2e tests/api.spec.ts --grep "filter a date range"`.
19. Test `"HTTP exposes virtual occurrences and this-or-following edits"` в `tests/api.spec.ts`: POST seed на 10 Nov, PATCH repeat daily с until 14 Nov; GET range даёт пять вхождений, GET синтетического id работает; complete только одно, PATCH другого scope=following меняет только хвост, move вхождения не возвращает его на исходную дату, DELETE scope=this сохраняет исключение при перечитывании, DELETE following убирает невыполненный хвост. Red, затем адаптация id/scope без новых правил повторов. Check: `pnpm test:e2e tests/api.spec.ts --grep "virtual occurrences"`.
20. Test `"HTTP date reads roll overdue tasks and missed occurrences to the owner's today"` в `tests/api.spec.ts`: pinned clock, просроченная задача и серия до 9 Nov; первый и повторный GET tasks показывают только один перенос на 9 Nov с правильными recurrence.occurrence; будущие дни не меняются. Red, затем передача requestTime в queryTasks/getTask. Check: `pnpm test:e2e tests/api.spec.ts --grep "owner's today"`.
21. Test `"another user's resources are indistinguishable from missing resources"` в `tests/api.spec.ts`: два ApiUser; GET/PATCH/DELETE/complete/uncomplete/move чужой обычной задачи и виртуального вхождения, rename/move/delete чужого списка, GET tasks чужого listId дают ровно 404/code/message как случайный id; состояние владельца неизменно. Red, затем все null/false/error соответствия 404. Check: `pnpm test:e2e tests/api.spec.ts --grep "indistinguishable"`.
22. Test `"foreign and missing destination lists return 404 without partial writes"` в `tests/api.spec.ts`: POST task и move/PATCH placement собственной задачи в чужой/случайный listId → одинаковый 404; исходная задача/чек-лист/название не меняются, лишняя задача не создана. Red, затем узкая обработка cause/SQLSTATE/constraint. Check: `pnpm test:e2e tests/api.spec.ts --grep "destination lists"`.
23. Test `"HTTP errors share one safe JSON envelope"` в `tests/api.spec.ts`: invalid JSON/blank title/invalid date/both placements/bad scope/дубли query → 400; body без application/json → 415; repeat у задачи списка → 400 без частичного сохранения; повторённый id checklist → 409; неизвестный путь → 404; PUT tasks → 405 с Allow. У всех только error.code/message, нет SQL/stack; проверить Cache-Control: no-store. Red, затем оставшиеся ветки apiErrorResponse/HTTP-декодирования. Check: `pnpm test:e2e tests/api.spec.ts --grep "safe JSON envelope"`.
24. Test `"OpenAPI operations and HTTP dispatch agree"` в `tests/api.spec.ts`: для всех 13 документированных method/path-пар вызвать разрешённый валидный запрос со свежими собственными ресурсами; проверить объявленные status/content-type/response-shape, включая пустые 204. Red, затем устранить рассогласование doc/диспетчера. Check: `pnpm test:e2e tests/api.spec.ts --grep "dispatch agree"`.
25. Test `"revocation takes effect on the next HTTP request"` в `tests/api.spec.ts`: Bearer GET работает; через UI нажать Revoke Agent; тот же HTTP-клиент получает 401 на чтение и запись, второй токен пользователя работает, строка отозванного исчезла. Red, затем revoke action/form и отсутствие кеша доступа. Check: `pnpm test:e2e tests/api.spec.ts --grep "revocation takes effect"`.
26. Test `"the shared 120-request budget is per token"` в `tests/api.spec.ts`: токен ещё не использовался в API; 120 последовательных GET, чередуя lists/tasks, успешны; 121-й GET → 429 с error.code и положительным целочисленным Retry-After <=60; второй токен того же пользователя → 200; отозванный исчерпавший токен → 401, не 429; публичный OpenAPI по-прежнему 200. Без изменения лимита/таймеров/env ради теста. Red, затем глобальный singleton/порядок auth→consume. Check: `pnpm test:e2e tests/api.spec.ts --grep "120-request budget"`.
27. Test `"token settings remain usable at 360 pixels"` в `tests/api-tokens.spec.ts`: viewport 360, длинное имя, создание, чтение и отзыв; scrollWidth <= clientWidth, controls доступны по ролям, error пустого имени понятен пользователю, секрет не появляется в URL/storage. Red, затем адаптивные CSS и доступность. Check: `pnpm test:e2e tests/api-tokens.spec.ts --grep "360 pixels"`.
28. Check-only: `pnpm typecheck`; ESLint/Prettier на изменённых TS/TSX/CSS/JSON и docs; affected vitest suites и два новых Playwright-файла. Проверить `git diff --check` и отсутствие изменений вне Changes. Не запускать build. Check: команды ниже; зафиксировать реальные результаты, не закрывать тикет автоматически.

### Commands

- Typecheck: `pnpm typecheck`.
- One test file (Vitest): `pnpm test src/api-tokens.test.ts`; существующая модель `pnpm test src/planner.test.ts` проверена при планировании — **28/28 passed**.
- One test file (HTTP/UI): `pnpm test:e2e tests/api.spec.ts`; существующая модель `pnpm test:e2e tests/sign-in.spec.ts` проверена при планировании — **3/3 passed**.
- Affected module suites: `pnpm test src/planner-schemas.test.ts src/planner.test.ts src/search.test.ts src/api-tokens.test.ts src/openapi.test.ts`.
- Affected HTTP/UI suites: `pnpm test:e2e tests/api.spec.ts tests/api-tokens.spec.ts` — эти сценарии и их запуск согласованы владельцем вместе с планом; server запускается существующим webServer, вручную `pnpm dev` не запускать.
- Full suite: `pnpm test`; full E2E: `pnpm test:e2e`. Это справочные команды, весь E2E-набор запускать только при отдельном согласовании, для завершения тикета достаточно affected checks.
- Targeted ESLint: `pnpm exec eslint src/planner-schemas.ts src/planner-schemas.test.ts src/planner.ts src/planner.test.ts src/db/schema.ts src/api-tokens.ts src/api-tokens.test.ts src/api-errors.ts src/api-access.ts src/api.ts src/openapi.ts src/openapi.test.ts 'app/api/v1/[[...path]]/route.ts' app/settings/api-tokens/page.tsx app/settings/api-tokens/actions.ts app/settings/api-tokens/token-manager.tsx app/page.tsx tests/api-helpers.ts tests/api.spec.ts tests/api-tokens.spec.ts`.
- Targeted Prettier: `pnpm exec prettier --check package.json pnpm-lock.yaml docs/tech-stack.md src/db/schema.ts src/planner-schemas.ts src/planner-schemas.test.ts src/planner.ts src/planner.test.ts src/api-tokens.ts src/api-tokens.test.ts src/api-errors.ts src/api-access.ts src/api.ts src/openapi.ts src/openapi.test.ts 'app/api/v1/\[\[...path\]\]/route.ts' app/settings/api-tokens/page.tsx app/settings/api-tokens/actions.ts app/settings/api-tokens/token-manager.tsx app/settings/api-tokens/api-tokens.module.css app/page.tsx app/week.module.css tests/api-helpers.ts tests/api.spec.ts tests/api-tokens.spec.ts drizzle/meta/0008_snapshot.json drizzle/meta/_journal.json`. SQL не отдавать Prettier без отсутствующего SQL-плагина.
- Dependency install: `pnpm add --save-exact zod-openapi@6.0.2 rate-limiter-flexible@11.5.0`.
- Migration generation: `pnpm exec drizzle-kit generate --name=api_tokens`; затем `pnpm test src/api-tokens.test.ts` применяет миграцию к yourweek_test штатным globalSetup.

### Pitfalls

- Генерация миграции сразу может применить её к уже работающему dev-серверу. Не удалять и не регенерировать 0008: исправление только новой follow-up миграцией; если это потребует путей вне Changes, остановиться по Rules.
- В `src/model.ts` остались старые типы Task/ChecklistItem: не использовать их для REST. Нужны текущие типы из `src/planner.ts`; из model использовать только Placement/TaskColor/taskColorValues.
- `listTasks` в базе не делает rollover; только вызов из REST без нового общего пути чтения нарушил бы спеку. Не вызывать readWeek для каждого дня диапазона.
- Синтетический id `<seriesId>_<YYYY-MM-DD>` не всегда равен id первой сохранённой задачи серии. Нельзя превратить occurrence в строку отдельным REST GET или воскресить tombstone.
- После split старые и новые части серии независимы — это принятое поведение 08, не «исправлять» в тикете API. Сохранить нынешний порядок виртуальных вхождений и семантику following.
- Схемы с `.refine` требуют описания межполевых ограничений в OpenAPI; календарный regex/format не заменяет `validCalendarDate`. Weekly `.transform` ломает output JSON Schema; использовать проверенный `.overwrite`, не ослаблять generator настройкой allowEmptySchema.
- Playwright поднимает свой Next.js в `.next-e2e`; не менять конфиги, tsconfig или владельческий dev-сервер. HTTP-клиенту требуется тестовый clock-cookie отдельно от Bearer, иначе сценарии прошлого будут перенесены по реальным часам.
- Vitest-файлы только `src/**/*.test.ts`; `tests/` — только Playwright. Изоляция тестов — уникальный пользователь, не truncate общей БД.
- Memory-лимит не распределён между процессами; здесь осознанно один Node-процесс. Сначала проверять отзыв в БД, потом бюджет, иначе отозванный исчерпавший токен получает 429 вместо 401.
- Next.js возвращает HEAD без body, даже если GET-ветка строит JSON: не требовать JSON-тело у HEAD в тестах формата ошибок. За пределами поддерживаемых Next методов (например TRACE) ответ платформы не контролируется этим обработчиком.

## Comments

2026-11-17 — реализовано по плану; тикет закрыт по подтверждению владельца.

- `/settings/api-tokens`: создание (секрет показывается один раз), список с префиксом и датами, отзыв. Хранится только SHA-256; отзыв действует со следующего запроса.
- `/api/v1`: 13 защищённых операций задач, списков и вхождений; Bearer без сессионных cookie; единый конверт ошибок; 404 на чужой ресурс; 120 запросов в минуту на токен с `Retry-After`. Публичный `/api/v1/openapi.json` строится из общих zod-схем.
- Ревью: пустой сегмент пути даёт 404; описание `GET /tasks` в OpenAPI дополнено связкой `from`/`to`, взаимоисключением с `listId` и пределом 366 дней; убраны лишние экспорты схем; добавлены тесты на `release()` для перенесённых вхождений при following-удалении и смене правила.
- Двойной parse оставлен осознанно: HTTP-слой валидирует для типобезопасного вызова, planner — свой контракт для actions и будущего MCP; схемы общие. XOR query-параметров в OpenAPI выражается только описанием операции.
- `release()`: добавлены скобки вокруг `not(kept)` — без этого шаг 19 не проходил; исправленное following-удаление закреплено двумя vitest-тестами.
- `rate-limiter-flexible` 11.5.0 и запись в `pnpm-workspace.yaml` согласованы планом; без `minimumReleaseAgeExclude` `pnpm install --frozen-lockfile` отклоняется политикой пакетов. `docs/tech-stack.md` обновлён.
- Проверки: `pnpm typecheck`; ESLint/Prettier изменённых файлов; affected vitest — 49/49; `tests/api.spec.ts` + `tests/api-tokens.spec.ts` — 17/17; `git diff --check` чистый. Build и полный E2E не запускались по плану.
- Коммиты: `a35057c` — реализация, `5f59bdf` — правки по ревью.
