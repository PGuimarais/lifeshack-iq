# LifeShack IQ Local

We are building LifeShack IQ, an agent that drives the business forward 

The reason for building this is to track the great operational complexity of our business, while streamlining the steps our teammates take. Given our time constraints and the unique leverage agentic systems create, this is a great opportunity to revolutionize our business. 

This system is aligned with our objective to make LifeShack an incredible success. The way it does this is by examining every facet of our business, it defines and tracks goals, delegates work, all whilst reflecting and improving its own process.

It has access to a roster of teammates along with their strengths, weaknesses, and abilities. 

It is able to read in all the business context: our operational data, customer data, revenue data, as well as active goals, initiatives, and tasks to understand where we are in the business at this moment in time.

Once a clear understanding is established of the business and active momentum, the agent uses its reasoning capabilities to move the business forward in execution of tasks as well as by evolving strategies, tactics, and objectives to grow.

Every morning the Agent retrieves fresh company data [0].

First thing it does is screen for critical issues [1] and notifies the team if there is anything critical happening. It does this by examining relevant company data sources and apis [2]. 


LifeShack IQ is a local Slack-native operating daemon for LifeShack. This repo implements the Phase 1-12 foundation: a TypeScript runtime, Slack Socket Mode command surface, SQLite persistence with Drizzle ORM, a durable local job queue, readiness-gated workflow scheduler/worker, OpenAI-backed structured agent execution with fake-mode fallback, default meta configuration, prompt module seeds, and local health checks.
It now also includes the Phase 7-9 data and intelligence layer: local fixture/manual data connectors, daily snapshots, hard-failure critical issue rules, issue upserts, and Slack-ready daily reports.
Phases 10-12 add execution management, durable approval safety, compressed/checksummed SQLite backups with optional S3 upload, hardened read-only connector wrappers, operational readiness checks, configured workflow schedules, teammate check-ins, and safe OpenAI tool calling.

## Setup

1. `npm install`
2. `cp .env.example .env`
3. `npm run db:generate`
4. `npm run db:migrate`
5. `npm run verify`
6. `npm run dev`

The example environment points the required read-only connectors at local fixture exports. Scheduled daily/weekly workflows remain disabled until `IQ_ENABLE_SCHEDULED_PRODUCTION_WORKFLOWS=true` is set.

## Slack

- Requires a Slack app with Socket Mode enabled.
- Set `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, and `SLACK_SIGNING_SECRET`.
- Register `/iq` and `/meta` slash commands in Slack.
- Set `IQ_DAILY_UPDATE_CHANNEL_ID` for scheduled daily report posts.
- Optionally set `IQ_CRITICAL_ALERT_CHANNEL_ID` and `IQ_WEEKLY_REFLECTION_CHANNEL_ID`; both fall back to `IQ_DAILY_UPDATE_CHANNEL_ID`.
- When Slack credentials are missing, the daemon starts locally with Slack disabled.

## Commands

- `/iq status`
- `/iq readiness`
- `/iq help`
- `/iq workflows`
- `/iq schedule`
- `/iq schedule enable <workflow>`
- `/iq schedule disable <workflow>`
- `/iq schedule set <workflow> daily <HH:mm> [timezone]`
- `/iq schedule set <workflow> weekly <day> <HH:mm> [timezone]`
- `/iq teammates`
- `/iq teammate add <@user> <name>`
- `/iq teammate schedule <@user> daily <HH:mm> <timezone>`
- `/iq goals`
- `/iq goal create <name>`
- `/iq goal assign <goal_id> <@user>`
- `/iq initiatives`
- `/iq initiative create <goal_id|none> <name>`
- `/iq initiative assign <initiative_id> <@user>`
- `/iq run critical-scan`
- `/iq run critical-scan --agent`
- `/iq run daily-report`
- `/iq run daily-report --agent`
- `/iq run weekly-reflection`
- `/iq run teammate-checkin`
- `/iq run backup`
- `/iq run meta-change`
- `/iq issues`
- `/iq issue show <id>`
- `/iq issue assign <id>`
- `/iq issue snooze <id> [hours]`
- `/iq issue resolve <id>`
- `/iq issue create-task <id> [task name]`
- `/iq tasks`
- `/iq task create <name>`
- `/iq task assign <id>`
- `/iq task done <id>`
- `/iq approvals`
- `/iq approval request <action_type> <message>`
- `/iq approval approve <id>`
- `/iq approval reject <id>`
- `/iq backup status`
- `/meta show`
- `/meta learn <instruction>`
- `/meta set <target> <json-or-text>`
- `/meta history`
- `/meta rollback <target> <version_number>`

`/meta set` targets can be config keys such as `meta.thresholds` or prompt modules such as `prompt.daily_group_report_prompt`.

## Database

- SQLite path defaults to `./data/iq.sqlite`.
- Run `npm run db:generate` after schema changes.
- Run `npm run db:migrate` to apply migrations and seed defaults.
- Run `npm run db:health` to check DB connectivity and integrity.

Generated Drizzle SQL migrations live in `drizzle/migrations`.

## Local Queue And Workflows

The daemon starts a scheduler and worker loop after migrations are applied. Schedule definitions are persisted in `workflow_schedules`; due jobs are persisted in `jobs` and executed by workflows:

- `daily_critical_scan`
- `daily_group_report`
- `weekly_reflection`
- `teammate_checkin`
- `sqlite_backup_to_s3`
- `meta_change_request`
- `approval_action`

These workflows are infrastructure-first. They do not call customer email, refunds, Codex, AWS write APIs, or production mutation paths. The backup workflow can call `aws s3 cp` only when `S3_BACKUP_BUCKET` is configured. Stripe, PostHog, AWS ops, internal ops, and Slack context connectors are read-only and fall back safely when disabled or unhealthy.

`critical-scan` and `daily-report` now use local fixture/manual data to create `daily_snapshots`, detect only obvious hard failures deterministically, and upsert those `issues`. Deterministic criticals are intentionally narrow: explicit ATS outages, zero submissions after prior volume, zero success after prior success, and provider missing/zero-credit failures. Softer anomalies are left to the agent/reporting layer rather than being auto-escalated as critical issues.

Scheduled daily and weekly operating workflows are gated by `/iq readiness`. Startup and recurrence scheduling both require:

- `IQ_ENABLE_SCHEDULED_PRODUCTION_WORKFLOWS=true`
- Required connectors healthy with no fallback data in use
- `OPENAI_API_KEY` when `IQ_AGENT_MODE=openai`

Manual `/iq run ...` commands still work for local testing. Use `/iq schedule` and `/iq schedule set ...` to inspect or retime configured schedules.

When Slack is configured, completed scheduled critical scans, daily reports, and weekly reflections post their summaries to the configured Slack channel. The teammate check-in workflow sends real Slack DMs to configured teammates and records replies from Slack DM events in `checkins`. Slack notification failures are logged and do not rewrite completed workflow jobs as failed.

## Operating Model

LifeShack IQ has first-class persisted teammates, goals, initiatives, and ownership:

- Teammates live in `people`, including Slack user ID, role, strengths, weaknesses, and check-in schedule.
- Goals live in `goals`, including owner, area, target metric/value, due date, and status.
- Initiatives live in `initiatives`, linked to goals and owners.
- Tasks and issues can be owned by teammates and linked to initiatives or issues.

Slack commands expose the current operating model:

```bash
/iq teammates
/iq teammate add <@user> <name>
/iq teammate schedule <@user> daily <HH:mm> <timezone>
/iq goals
/iq goal create <name>
/iq initiatives
/iq initiative create <goal_id|none> <name>
```

## Data Sources

Default manual data comes from local JSON fixtures in `src/data/fixtures`. Use `IQ_DATA_PROFILE=critical` to load the critical fixture set.

Optional local export paths:

- `IQ_MANUAL_OPS_PATH`
- `IQ_MANUAL_REVENUE_PATH`
- `IQ_MANUAL_APPLICATION_QUALITY_PATH`
- `IQ_MANUAL_CUSTOMER_QUALITY_PATH`
- `IQ_MANUAL_PROVIDER_BALANCES_PATH`
- `IQ_STRIPE_EXPORT_PATH`
- `IQ_POSTHOG_EXPORT_PATH`
- `IQ_AWS_OPS_EXPORT_PATH`
- `IQ_SLACK_CONTEXT_PATH`
- `IQ_GRANOLA_NOTES_DIR`

Required production-readiness connectors can run in local export mode or live read-only mode:

- Stripe revenue: `IQ_STRIPE_EXPORT_PATH` or `IQ_STRIPE_LIVE_ENABLED=true` with `STRIPE_SECRET_KEY` and `IQ_STRIPE_LIVE_URL`
- PostHog quality: `IQ_POSTHOG_EXPORT_PATH` or `IQ_POSTHOG_LIVE_ENABLED=true` with `POSTHOG_API_KEY` and `IQ_POSTHOG_LIVE_URL`
- AWS ops: `IQ_AWS_OPS_EXPORT_PATH` or `IQ_AWS_OPS_LIVE_ENABLED=true` with `IQ_AWS_OPS_LIVE_URL`

Optional context connectors:

- Internal ops: `IQ_INTERNAL_OPS_URL` and optional `IQ_INTERNAL_OPS_TOKEN`
- Slack context: `IQ_SLACK_CONTEXT_PATH` or `IQ_SLACK_CONTEXT_LIVE_ENABLED=true` with `SLACK_BOT_TOKEN` and comma-separated `IQ_SLACK_CONTEXT_CHANNELS`
- Granola notes: `IQ_GRANOLA_NOTES_DIR`

The live connector URLs should be read-only aggregation endpoints that return the same JSON shapes used by the fixtures. Connector calls have timeout/retry wrappers, health checks, fallback data, and secret redaction.

## Readiness

Use `/iq readiness` to see whether IQ can safely schedule daily/weekly operating workflows. The report includes scheduling opt-in state, required connector health, connector mode, retry attempts, and fallback usage.

For a fully local dry run, keep the fixture export paths from `.env.example`, run `npm run verify`, start the daemon, and use Slack or the queue commands to run:

- `/iq run critical-scan`
- `/iq run daily-report`
- `/iq run backup`

## Agent Mode

Agent execution defaults to OpenAI Responses API mode in `.env.example`:

```bash
IQ_AGENT_MODE=openai
IQ_OPENAI_MODEL=gpt-5.5
OPENAI_API_KEY=sk-...
```

The OpenAI client uses the Responses API with `store:false`, low reasoning effort by default, low verbosity, Structured Outputs via `text.format`, and safe function tools. The model receives the base operating principles, the active workflow prompt, active meta configuration, and the workflow business input. Returned JSON is parsed and validated with the existing Zod schema before being persisted to `agent_runs` and `tool_calls`.

Safe internal tools available to the model:

- `read_open_issues`
- `create_task`
- `propose_goal`
- `request_approval`

These tools can read and update IQ’s internal operating state but cannot execute sensitive customer, billing, AWS, email, or production side effects. Sensitive work remains approval-gated.

For local dry runs and tests:

```bash
IQ_AGENT_MODE=fake npm run dev
```

## Meta Control Plane

The meta control plane versions config values in `meta_configs` and `meta_config_versions`, versions prompts in `prompt_modules` and `prompt_versions`, records audit rows in `config_events`, and enforces hardcoded safety invariants. Approval requirements for refunds, customer emails, production changes, destructive AWS actions, and local runtime mode cannot be disabled through `/meta`.

## Execution Management

Critical scan findings upsert `issues`. Issues can be listed, shown, assigned, snoozed, resolved, linked to Slack threads, and converted into tasks. Tasks can be listed, created, assigned, linked to Slack threads, and marked done.

Slack button handlers are registered for:

- `issue_create_task`
- `issue_assign_self`
- `issue_snooze`
- `issue_resolve`
- `task_assign_self`
- `task_mark_done`

## Approval Safety

Approval requests are persisted in `approvals`. Approving a request runs only a stub handler for these sensitive action types:

- `refund`
- `customer_email`
- `codex_task`
- `aws_change`
- `production_change`

Sensitive actions cannot execute without an approved approval record. Stub handlers record that no real Stripe, email, Codex, AWS, or production side effect was performed.

Slack button handlers are registered for:

- `approval_approve`
- `approval_reject`

## Backups

`/iq run backup` creates a consistent SQLite backup using SQLite's backup API, compresses it with gzip, writes a SHA-256 sidecar, records the run in `backup_runs`, and uploads the `.gz` plus `.sha256` to S3 when `S3_BACKUP_BUCKET` is configured. `/iq backup status` shows the latest backup run.

Manual scripts:

```bash
scripts/backup-sqlite-to-s3.sh
scripts/restore-sqlite-from-s3.sh <s3_uri_to_sqlite_gz> <output_sqlite_path>
```

Restore remains manual: the restore script downloads, validates the checksum, decompresses to a candidate SQLite file, and runs `PRAGMA integrity_check`.

## Testing

```bash
npm run test
```

Tests use temporary SQLite files and do not require real Slack, OpenAI, AWS, Stripe, PostHog, or S3 credentials.
