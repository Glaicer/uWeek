# 12: MCP-сервер для агентов

**Status:** resolved

**Blocked by:** 11

**What to build:** Агент подключается к `https://<домен>/mcp` с Bearer-токеном пользователя и инструментами читает неделю и списки, ищет, создаёт, меняет, перемещает, закрывает и удаляет задачи.

- [x] Инструменты вызывают слой операций; входные схемы — zod; описания объясняют формат дат и что «today» считается по часовому поясу пользователя.
- [x] В настройках — готовый фрагмент конфигурации для подключения (URL + заголовок).
- [x] Тест MCP-клиентом SDK: подключение, список инструментов, создание и закрытие задачи, отказ без токена и с отозванным токеном.
- [x] Ручная проверка с настоящим агентом (Claude Code) описана в комментарии.

## Ticket plan

Base: `1a16a9b` on `dev`, planned 2026-11-17.

### Rules for the implementer

- Follow this plan: its approach, files, signatures and test cases are decided. The acceptance criteria above still define done.
- First run the stale check: `git diff --stat 1a16a9b HEAD -- package.json pnpm-lock.yaml pnpm-workspace.yaml docs/tech-stack.md src/api-errors.ts src/mcp.ts app/mcp/route.ts app/settings/api-tokens/page.tsx app/settings/api-tokens/api-tokens.module.css tests/api-helpers.ts tests/mcp.spec.ts`. No output means the plan is current.
- The seam and test cases under Steps are pre-agreed with the user; they satisfy `tdd`'s seam confirmation.
- Local fixes are yours to make: imports, local names, formatting, an extra test case for an edge case you find.
- Stop before review and commit, leaving the work uncommitted, when the stale check prints anything, when a path, symbol or signature here differs from the code, when a file outside Changes must change, when a step's check stays red after a local fix, or when every step is done and an acceptance criterion is still unmet. Report the step, what the plan expected, and what you found.

### Approach

Маршрут `app/mcp/route.ts` (копия `app/api/v1/[[...path]]/route.ts`) передаёт `Request` и `requestTime()` в `handleMcpRequest` из нового `src/mcp.ts`. Тот сначала вызывает `authorizeApiRequest` (токен, отзыв, общий с REST лимит 120/мин; при ошибке — `apiErrorResponse`: 401 с `WWW-Authenticate: Bearer`), затем отдаёт запрос модульному `createMcpHandler` с `authInfo`, где `extra = { userId, now }`. Фабрика строит `McpServer` с девятью инструментами, каждый вызывает только `src/planner.ts`; входные схемы — плоские `z.object` из полей `src/planner-schemas.ts` с `.describe()`, правило «ровно одно из date/listId» проверяют существующие `newTask`/`placement`/`taskQuery`. В настройках токенов — блок «Connect an agent» с готовым JSON-фрагментом.

Rejected: union-схемы планера (`newTask`, `taskQuery`) прямо в `inputSchema`: SDK их принимает, но верхнеуровневый `oneOf` в схеме инструмента отвергает Claude API, агент не сможет вызвать инструмент. Проверка Host/Origin перед handler не нужна: вход только по Bearer, сессионные cookie `/mcp` не принимает, DNS rebinding ничего не даёт. Отдельный `createMcpHandler` на каждый запрос тоже отклонён: документация SDK держит handler на уровне модуля, а различия вызывающих передаёт через `authInfo`.

Владелец подтвердил подход, seam, порядок сценариев и установку двух MCP-пакетов 2.4.0 — 2026-11-17. Блокер 11 в базе: `a35057c`, `5f59bdf`, `1a16a9b`.

### Reuse

- `src/api-access.ts` `authorizeApiRequest`: Bearer, отзыв и лимит — без изменений.
- `src/api-errors.ts` `apiErrorResponse` для 401/429 до MCP; `apiErrorOf` (сделать экспортом) — текст ошибки инструмента.
- `src/planner.ts`: `readWeek`, `queryTasks`, `listLists`, `searchTasks`, `createTask`, `updateTask`, `deleteTask`, `PlannerNotFoundError`.
- `src/planner-schemas.ts`: `isoDate`, `title`, `taskId`, `listId`, `scope`, `edits.shape`, `searchQuery.shape`, `completionFields.q`, `newTask`, `placement`, `taskQuery`.
- `app/api/v1/[[...path]]/route.ts`: шаблон маршрута (`runtime`, `dynamic`, `requestTime()`).
- `tests/api-helpers.ts` `newApiUser`, `issueApiToken`; `tests/clock.ts` `testClockCookie`; revoke в UI — кнопка `Revoke <name>` без подтверждения (как в `tests/api-tokens.spec.ts`).

### Changes

- `package.json`, `pnpm-lock.yaml` (edit): `pnpm add --save-exact @modelcontextprotocol/server@2.4.0` и `pnpm add -D --save-exact @modelcontextprotocol/client@2.4.0`.
- `pnpm-workspace.yaml` (edit, только если pnpm откажет по `minimumReleaseAge`): добавить отказавшие пакеты в `minimumReleaseAgeExclude` с точной версией, как у существующих строк.
- `src/api-errors.ts` (edit): `function apiErrorOf` → `export function apiErrorOf`, тело не менять.
- `src/mcp.ts` (new): handler, фабрика сервера, девять инструментов, обёртка результата.
- `app/mcp/route.ts` (new): `GET`, `POST`, `DELETE` → `handleMcpRequest(request, await requestTime())`; `runtime = "nodejs"`, `dynamic = "force-dynamic"`.
- `app/settings/api-tokens/page.tsx` (edit): после `<TokenManager>` — `<section aria-label="Connect an agent">` с `<h2>Connect an agent (MCP)</h2>`, одной строкой пояснения и `<pre><code>` с фрагментом ниже; URL — `new URL("/mcp", process.env.BETTER_AUTH_URL).href`.
- `app/settings/api-tokens/api-tokens.module.css` (edit): классы `.connect` и `.snippet` (моноширинный, `overflow-x: auto`, без горизонтального скролла страницы на 360 px).
- `tests/api-helpers.ts` (edit): `const pinnedNow` → `export const pinnedNow`.
- `tests/mcp.spec.ts` (new): сценарии Steps.
- `docs/tech-stack.md` (edit): в «Текущий момент» — MCP-сервер и клиент поставлены тикетом 12.
- `.scratch/yourweek-cloud/issues/12-mcp-server.md` (edit, комментарий): ручная проверка с Claude Code.

```ts
// src/mcp.ts
import { createMcpHandler, McpServer, type AuthInfo, type CallToolResult } from "@modelcontextprotocol/server";

interface Caller { userId: string; now: Date }

// authInfo = { token, clientId: principal.tokenId, scopes: [], extra: { userId, now } }
export async function handleMcpRequest(request: Request, now: Date): Promise<Response>;

function callerOf(authInfo: AuthInfo | undefined): Caller;          // бросает Error, если extra не того вида (невозможный случай)
function plannerServer(caller: Caller): McpServer;                   // new McpServer({ name: "yourweek", version: "1.0.0" }, { instructions: datesNote })
async function run(action: () => Promise<unknown>): Promise<CallToolResult>;
// успех: { content: [{ type: "text", text: JSON.stringify(value) }] }
// ошибка: { content: [{ type: "text", text: message }], isError: true },
//   message = error instanceof z.ZodError ? z.prettifyError(error) : apiErrorOf(error).message
// null от updateTask/false от deleteTask → throw new PlannerNotFoundError() внутри action

const handler = createMcpHandler(({ authInfo }) => plannerServer(callerOf(authInfo)));
```

Инструменты (имя → inputSchema → вызов):

| Инструмент | inputSchema (`z.object`) | Вызов |
| --- | --- | --- |
| `list_week` | `{ week: isoDate.optional() }` | `readWeek(userId, { week }, now)` |
| `list_tasks` | `{ from: isoDate.optional(), to: isoDate.optional(), listId: listId.optional(), completed: z.boolean().optional(), text: completionFields.q }` | `const { completed, text, ...where } = args`; `queryTasks(userId, taskQuery.parse({ ...where, ...(completed !== undefined && { completed: String(completed) }), ...(text !== undefined && { q: text }) }), now)` |
| `list_lists` | без схемы | `listLists(userId)` |
| `search_tasks` | `{ query: searchQuery.shape.query, cursor: searchQuery.shape.cursor }` | `searchTasks(userId, args)` |
| `create_task` | `{ title, date: isoDate.optional(), listId: listId.optional() }` | `createTask(userId, newTask.parse(args))` |
| `update_task` | `{ id: taskId, scope: scope.default("this"), ...edits.shape }` | `const { id, scope, ...changes } = args`; `updateTask(userId, id, changes, scope)` |
| `move_task` | `{ id: taskId, date: isoDate.optional(), listId: listId.optional(), index: z.int().min(0).optional() }` | `const { id, ...to } = args`; `updateTask(userId, id, { placement: placement.parse(to) })` |
| `complete_task` | `{ id: taskId }` | `updateTask(userId, id, { completed: true })` |
| `delete_task` | `{ id: taskId, scope: scope.default("this") }` | `deleteTask(userId, id, scope)` → результат `{ id, deleted: true }` |

Описания (английский, для агента) обязаны сказать: даты — `YYYY-MM-DD`; «today» — текущая дата в часовом поясе пользователя (`list_week` возвращает `today` и `timeZone`), не UTC; при чтении незавершённые задачи прошлых дней уже перенесены на today; id берутся из `list_week`/`list_tasks`, у вхождений повторяющихся задач id вида `<uuid>_<YYYY-MM-DD>`, `scope: "following"` — это и последующие вхождения; у `create_task`/`move_task` — ровно одно из `date` или `listId`; у `list_tasks` — либо `from`+`to` (включительно, до 366 дней), либо `listId`; у `search_tasks` повторяющиеся задачи приходят один раз с `repeats: true` и id серии — для id вхождения нужен `list_tasks`; у `update_task` `checklist` заменяет список целиком, `completed: false` снимает отметку; `complete_task` только отмечает выполненной. Аннотации: чтение — `readOnlyHint: true`; `delete_task` — `destructiveHint: true`. Общая константа `datesNote` — в `instructions` сервера и в описаниях инструментов с датами.

Фрагмент в настройках (`YOUR_API_TOKEN` — буквальный плейсхолдер):

```json
{
  "mcpServers": {
    "yourweek": {
      "type": "http",
      "url": "<BETTER_AUTH_URL>/mcp",
      "headers": { "Authorization": "Bearer YOUR_API_TOKEN" }
    }
  }
}
```

### Steps

Seam: HTTP `/mcp` на настоящем Next.js и Postgres через `Client` + `StreamableHTTPClientTransport` из `@modelcontextprotocol/client` (режим версий по умолчанию, `legacy`); настройки — через роли. Model test: `tests/api.spec.ts` (Playwright, `newApiUser`).

Локальный помощник в `tests/mcp.spec.ts`: `connect(baseURL: string, token?: string): Promise<Client>` — транспорт `new StreamableHTTPClientTransport(new URL("/mcp", baseURL), { requestInit: { headers } })`, где `headers` — `Cookie: testClockCookie + "=" + new Date(pinnedNow).toISOString()` и, если передан токен, `Authorization: "Bearer " + token`; затем `new Client({ name: "yourweek-e2e", version: "1.0.0" })` и `await client.connect(transport)`. Второй помощник `json(result)` — `JSON.parse` первого text-блока. Каждый тест закрывает клиентов и вызывает `user.close()` в `finally`.

0. Установка зависимостей (Changes, первая строка). Check: `pnpm typecheck`.
1. Test "an agent without a valid token is refused": `request.post("/mcp", { data: {} })` без заголовка и с `Bearer yw_short` → 401, `www-authenticate` содержит `Bearer`, тело `{ error: { code: "unauthorized", message: expect.any(String) } }`; `connect(baseURL)` без токена отклоняется с `SdkHttpError` и `status === 401`. Red, then green in `src/mcp.ts` (`handleMcpRequest` до `authorizeApiRequest`), `app/mcp/route.ts`. Check: `pnpm test:e2e tests/mcp.spec.ts`.
2. Test "an agent connects with a token and sees the planner tools": `listTools()` → отсортированные имена ровно девять из таблицы; у каждого непустое `description`; описания `list_week`, `list_tasks`, `create_task`, `move_task` содержат `YYYY-MM-DD`; описание `list_week` содержит `time zone`; ни у одного `inputSchema` нет `oneOf`/`anyOf` на верхнем уровне. Red, then green in `src/mcp.ts`. Check: тот же.
3. Test "an agent creates a task and completes it, and the week shows it": `create_task { title: "Call the bank", date: "2026-11-10" }` → `{ id, title, date: "2026-11-10", completed: false }`; `complete_task { id }` → `completed: true`; `list_week { week: "2026-11-10" }` → `today: "2026-11-09"`, среди `tasks` эта задача выполнена; `user.page.goto("/")` → строка «Call the bank» отображается выполненной (тот же признак, что в `tests/tasks.spec.ts`). Red, then green in `src/mcp.ts`. Check: тот же.
4. Test "an agent reads lists, searches, updates, moves and deletes a task": `list_lists` → `[{ id, title: "Inbox" }]`; `create_task { title: "Renew passport", listId }`; `search_tasks { query: "passport" }` → `items` с этим id, `nextCursor: null`; `update_task { id, notes: "Bring photos" }` → `notes` обновлены; `move_task { id, date: "2026-11-12" }` → `date: "2026-11-12"`, без `listId`; `list_tasks { from: "2026-11-09", to: "2026-11-15", completed: false }` содержит задачу; `delete_task { id }` → `{ id, deleted: true }`; `list_tasks` с тем же диапазоном её не содержит. Red, then green in `src/mcp.ts`. Check: тот же.
5. Test "tool errors reach the agent as tool results": `create_task` с `date` и `listId` → `isError: true`; второй пользователь (`newApiUser`) создаёт задачу, первый вызывает `complete_task` с её id → `isError: true`, текст `Resource not found`; `list_week` второго пользователя показывает задачу невыполненной. Red, then green in `src/mcp.ts` (`run`, `apiErrorOf`) и `src/api-errors.ts`. Check: тот же.
6. Test "a revoked token stops working at once": подключённый клиент успешно вызывает `list_lists`; `user.page` нажимает `Revoke Agent` и ждёт исчезновения кнопки; тот же клиент на `list_lists` отклоняется с 401 (`SdkHttpError`, `status === 401`); новый `connect` с тем же токеном — тоже 401. Red, then green: проходит без нового кода — если зелёный сразу, это допустимо (проверка контракта отзыва), записать в отчёт. Check: тот же.
7. Test "the token settings show how to connect an agent": на `/settings/api-tokens` регион `Connect an agent` содержит `${baseURL}/mcp`, `"Authorization": "Bearer YOUR_API_TOKEN"` и `"type": "http"`; на ширине 360 px `scrollWidth <= clientWidth` у документа. Red, then green in `app/settings/api-tokens/page.tsx`, `api-tokens.module.css`. Check: тот же.
8. Без теста: строка в `docs/tech-stack.md`; комментарий в тикете под `## Comments` с ручной проверкой: `claude mcp add --transport http yourweek http://127.0.0.1:4200/mcp --header "Authorization: Bearer <token>"`, затем `/mcp` в Claude Code показывает 9 инструментов, просьба «покажи мою неделю», «создай задачу на завтра», «закрой её», проверка в интерфейсе после обновления; итог прогона владельцем дописывается туда же. Check: `pnpm exec prettier --check docs/tech-stack.md`.

### Commands

- Typecheck: `pnpm typecheck`
- One test file: `pnpm test:e2e tests/mcp.spec.ts`; модельный запуск `pnpm test:e2e tests/sign-in.spec.ts` при планировании — 3/3 passed.
- Affected suites: `pnpm test:e2e tests/mcp.spec.ts tests/api.spec.ts tests/api-tokens.spec.ts` (api-errors и api-helpers общие с REST).
- Full suite: `pnpm test`; full E2E `pnpm test:e2e` — только по согласованию владельца.
- Targeted ESLint: `pnpm exec eslint src/mcp.ts src/api-errors.ts app/mcp/route.ts app/settings/api-tokens/page.tsx tests/api-helpers.ts tests/mcp.spec.ts`
- Targeted Prettier: `pnpm exec prettier --check package.json docs/tech-stack.md src/mcp.ts src/api-errors.ts app/mcp/route.ts app/settings/api-tokens/page.tsx app/settings/api-tokens/api-tokens.module.css tests/api-helpers.ts tests/mcp.spec.ts`

### Pitfalls

- `edits` содержит `.refine`: `edits.omit(...)`/`.pick(...)` бросают «cannot be used on object schemas containing refinements». Брать `edits.shape` спредом (проверено: `shape` у refined-объекта доступен); `placement` в `update_task` остаётся — это сознательно.
- `taskQuery` — `strictObject`: ключ со значением `undefined` считается лишним и роняет xor. Не деструктурировать `from`/`to`/`listId` в новые переменные и не собирать объект заново — только `...where` из rest и условные спреды, как в таблице.
- Без `newTask.parse`/`placement.parse`/`taskQuery.parse` в `src/mcp.ts` плоские аргументы не типизируются как union-вход планера; не заменять parse приведением `as`. Двойной parse (здесь и внутри планера) — осознанный, как в REST.
- Ошибки инструмента: SDK сам превращает брошенное исключение в `isError` с его `message` — поэтому `run` ловит всё и отдаёт текст через `apiErrorOf`, иначе агент увидит сообщения Postgres. `ZodError` проверять до `apiErrorOf` (тот вернёт безликое «Invalid request»).
- Без тестового clock-cookie в `requestInit.headers` сервер считает «today» по реальным часам и при чтении перенесёт задачи 2026-11-09…10 — тесты 3–5 станут нестабильными. `Authorization` из `requestInit` уходит, пока у транспорта нет `authProvider`; `authProvider` не задавать.
- Каждое MCP-HTTP-сообщение (initialize, initialized, list, call) тратит пункт общего лимита токена; держать сценарии короткими, отдельный токен на тест (`newApiUser`).
- `tests/` — только Playwright; vitest-тест для MCP в `src/` не добавлять: spec требует проверку против запущенного сервера. Конфиги Playwright/tsconfig не трогать.
- `createMcpHandler` в legacy-режиме отвечает 405 на GET/DELETE — это норма stateless-сервера; маршрут всё равно экспортирует их, чтобы 401 и 405 шли из одного места.

## Comments

### Manual check with Claude Code

After the automated tests pass, verify the endpoint with a real agent:

1. Start the app with `pnpm dev` and create an API token on `/settings/api-tokens`.
2. Connect: `claude mcp add --transport http yourweek http://127.0.0.1:4200/mcp --header "Authorization: Bearer <token>"`.
3. `/mcp` in Claude Code lists 9 tools: `list_week`, `list_tasks`, `list_lists`, `search_tasks`, `create_task`, `update_task`, `move_task`, `complete_task`, `delete_task`.
4. Ask "show my week", then "create a task for tomorrow", then "complete it"; refresh the web app and check the task.
5. Result: 2026-11-17, the owner connected the server in OpenCode instead of Claude Code: the agent fetched the tasks from the server, handled the request and answered in plain readable text. Works as intended.

2026-11-17 — реализовано по плану; тикет закрыт по подтверждению владельца.

- `/mcp`: stateless MCP по HTTP (`@modelcontextprotocol/server` 2.4.0), вход только по Bearer-токену через `authorizeApiRequest` — тот же отзыв и лимит 120/мин, что у REST; 401 с `WWW-Authenticate: Bearer` до MCP.
- Девять инструментов (`list_week`, `list_tasks`, `list_lists`, `search_tasks`, `create_task`, `update_task`, `move_task`, `complete_task`, `delete_task`) вызывают только `src/planner.ts`; плоские `z.object`-схемы без верхнеуровневых `oneOf`/`anyOf`; ошибки приходят агенту как `isError` с текстом `apiErrorOf`/`z.prettifyError`.
- `/settings/api-tokens`: блок «Connect an agent (MCP)» с готовым JSON-фрагментом.
- Ревью: `authorizeApiRequest` возвращает токен (без повторного разбора заголовка), `requireTask` вместо повторной проверки на null, `update_task` берёт `...edits.shape`.
- После ревью: instructions сервера описывают YourWeek для поиска отложенных инструментов (Claude Code, Codex); из схем id убран дублирующий regex UUID — `tools/list` сократился с ~10.4k до ~8.4k символов.
- Проверки: `pnpm typecheck`; ESLint/Prettier изменённых файлов; `pnpm test` — 78 passed; `tests/mcp.spec.ts` + `tests/api.spec.ts` + `tests/api-tokens.spec.ts` — 24 passed; ручная проверка владельцем в OpenCode. Build и полный E2E не запускались по плану.
- Коммиты: `d50476b` — реализация, `b245329` — правки по ревью, `364dacb` — сжатие схем и описание сервера.
