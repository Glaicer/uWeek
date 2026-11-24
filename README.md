# uWeek

A weekly planner laid out like an open diary. The whole week fits on one spread: the first four days on the left page, the other three and your undated lists on the right. To add a task, click an empty line under the day and start typing.

uWeek runs in the browser at [uweek.top](https://uweek.top) and works online only.

## Signing in

Enter your email and open the link we send you; there is no password. You can also continue with Google: with the same email you land in the same account. Your tasks are visible to you alone.

## The week

- Enter saves the task and opens the next line; Escape cancels.
- Click a task's title to mark it done, click again to undo.
- The arrows in the header page through weeks, Today brings you back, and Go to week opens a calendar to jump anywhere.
- The week starts on Monday or Sunday; switch it in the ⋯ menu.
- Unfinished tasks from past days move to today by themselves. "Today" follows your time zone.

## Someday

Tasks without a date live in Someday lists at the end of the spread. You start with one list, Inbox. The "+" adds a list, and the Edit lists gear lets you rename or delete one. Drag lists to reorder them.

## Task card

The pencil next to a task opens its card: notes, a checklist, a color, and a move to another date or list. You can also move tasks with the mouse: drag one to another day, into a list, or up and down within a day.

## Recurring tasks

A task can repeat daily, on chosen weekdays, monthly or yearly, every N days, weeks, months or years, with an optional end date. A task on the 31st falls on the last day of shorter months.

Each occurrence is checked off on its own. When you edit or delete an occurrence, uWeek asks whether to change just this one or this and all following. Missed occurrences also move to today, marked with the day they belonged to.

## Search

Search in the header looks through titles and notes. Pick a result to open the week or list that holds the task, with the task highlighted.

## Agents

You can let your scripts and AI agents work with your tasks. Under ⋯ → API tokens, create a personal token: it is shown once and can be revoked at any time. The token works with the REST API, described in [OpenAPI](https://uweek.top/api/v1/openapi.json), and with the MCP server. Through them an agent such as Claude reads your week and lists, searches, creates, moves and completes tasks. The same page has a ready-made snippet to connect an agent.

## Self-hosting

To run your own copy or work on the code, see [docs/self-hosting.md](docs/self-hosting.md).

## License

Code: [MIT](LICENSE). [Third-party notices](THIRD_PARTY_NOTICES.md).
