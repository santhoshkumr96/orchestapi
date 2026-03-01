<p align="center">
  <img src="frontend/public/logo.svg" alt="OrchestAPI" width="200" />
</p>

<h1 align="center">OrchestAPI</h1>

<p align="center">
  Self-hosted API test orchestration platform with DAG-based dependencies, live streaming, infrastructure verification, and scheduled execution.
</p>

<p align="center">
  <code>Java 21</code> &middot; <code>Spring Boot 3</code> &middot; <code>React 19</code> &middot; <code>TypeScript</code> &middot; <code>Ant Design</code> &middot; <code>PostgreSQL</code>
</p>

<p align="center">
  <a href="https://orchestapi.com">Website</a> &middot; <a href="https://orchestapi.com/docs.html">Documentation</a>
</p>

---

## Screenshots

| Dashboard | Test Suites |
|:-:|:-:|
| ![Dashboard](frontend/public/screenshots/dashboard.png) | ![Test Suites](frontend/public/screenshots/test-suite.png) |

| Suite Steps | Step Editor (Tabs) |
|:-:|:-:|
| ![Suite Steps](frontend/public/screenshots/step-editor.png) | ![Step Editor](frontend/public/screenshots/testSuite.png) |

| Run Results | Environment Detail |
|:-:|:-:|
| ![Run Results](frontend/public/screenshots/runsuite.png) | ![Environment Detail](frontend/public/screenshots/environment-detail.png) |

| Run History | Environments |
|:-:|:-:|
| ![Run History](frontend/public/screenshots/runs.png) | ![Environments](frontend/public/screenshots/environment.png) |

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Environments](#environments)
  - [Variables](#variables)
  - [Default Headers](#default-headers)
  - [Connectors](#connectors)
  - [Files](#files)
- [Test Suites](#test-suites)
- [Steps](#steps)
  - [Method & URL](#method--url)
  - [Headers](#headers)
  - [Request Body](#request-body)
  - [Query Parameters](#query-parameters)
  - [Dependencies](#dependencies)
  - [Variable Extraction](#variable-extraction)
  - [Response Handlers](#response-handlers)
  - [Caching](#caching)
  - [Dependency-Only Steps](#dependency-only-steps)
  - [Verifications](#verifications)
- [Placeholders & Autocomplete](#placeholders--autocomplete)
  - [Environment Variables](#environment-variables-1)
  - [Step Response References](#step-response-references)
  - [Manual Input](#manual-input)
  - [File References](#file-references)
- [Running Tests](#running-tests)
  - [Single Step](#single-step)
  - [Full Suite](#full-suite)
  - [Live Streaming (SSE)](#live-streaming-sse)
  - [Manual Input During Runs](#manual-input-during-runs)
- [Run Results](#run-results)
- [Scheduling](#scheduling)
- [Run History](#run-history)
- [Dashboard](#dashboard)
- [Curl Import](#curl-import)
- [Connector Reference](#connector-reference)
- [Configuration](#configuration)
- [License](#license)

---

## Prerequisites

- **Java 21**
- **Node.js 18+** (with npm)
- **PostgreSQL 14+** (or Docker to run it)

## Quick Start

### 1. Start PostgreSQL

Using Docker:

```bash
docker run -d \
  --name orchestapi-db \
  -e POSTGRES_USER=orchestapi \
  -e POSTGRES_PASSWORD=your_password \
  -e POSTGRES_DB=orchestapi \
  -p 5432:5432 \
  postgres:17
```

Or use any existing PostgreSQL instance.

### 2. Start the Backend

```bash
cd backend

# Set your database credentials
export DB_URL=jdbc:postgresql://localhost:5432/orchestapi
export DB_USERNAME=orchestapi
export DB_PASSWORD=your_password

# Run
./mvnw spring-boot:run
```

The backend starts on **http://localhost:8080**. Database schema and tables are created automatically via Flyway on first startup.

### 3. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend starts on **http://localhost:3000** and proxies API calls to the backend.

---

## Environments

Environments hold all the configuration for a target system — variables, headers, infrastructure connectors, and files. Each test suite has a default environment, which can be overridden at run time.

Go to **Environments** in the sidebar, click **Create**, then configure the sections below.

![Environment Detail](frontend/public/screenshots/environment-detail.png)

### Variables

Key-value pairs available to all steps via `${VAR_NAME}` syntax.

| Field | Description |
|-------|-------------|
| **Key** | Variable name (unique per environment) |
| **Value** | Variable value |
| **Secret** | Toggle on to mask the value in API responses and UI |

Common variables: `BASE_URL`, `API_KEY`, `AUTH_TOKEN`, `TENANT_ID`.

### Default Headers

Headers automatically added to every API step that uses this environment. Step-level headers override these if the same key is used.

| Field | Description |
|-------|-------------|
| **Header Key** | Header name (e.g., `Authorization`, `Content-Type`) |
| **Value Type** | How the value is generated (see below) |
| **Header Value** | The value or variable reference |

**Value Types:**

| Type | Behavior | Example |
|------|----------|---------|
| `STATIC` | Use the value as-is | `application/json` |
| `VARIABLE` | Look up an environment variable by name | `api_token` → resolves to the variable's value |
| `UUID` | Auto-generate a new UUID v4 per request | `550e8400-e29b-41d4-a716-446655440000` |
| `ISO_TIMESTAMP` | Auto-generate current UTC timestamp per request | `2026-02-26T10:30:00.000Z` |

### Connectors

Infrastructure connectors for post-step verifications (e.g., check a DB row was created, verify a Kafka event was published). See [Connector Reference](#connector-reference) for all types and config fields.

Each connector has:

| Field | Description |
|-------|-------------|
| **Name** | Unique name (referenced in step verifications) |
| **Type** | MYSQL, POSTGRES, ORACLE, SQLSERVER, REDIS, ELASTICSEARCH, KAFKA, RABBITMQ, MONGODB |
| **Config** | Type-specific connection fields (host, port, credentials, SSL, etc.) |

Use the **Test Connection** button to verify connectivity.

### Files

Binary files stored in the database, referenced in form-data requests via `${FILE:fileKey}`.

| Field | Description |
|-------|-------------|
| **File Key** | Unique identifier for the file (used in `${FILE:key}` syntax) |
| **File** | The uploaded file (any type, max 50MB) |

Upload files here, then reference them in step form-data fields.

---

## Test Suites

A test suite is a collection of API steps with an optional dependency graph (DAG). Go to **Test Suites** in the sidebar.

| Field | Description |
|-------|-------------|
| **Name** | Suite name (unique) |
| **Description** | Optional description |
| **Default Environment** | Environment used unless overridden at run time |

Steps within a suite can depend on each other, forming a directed acyclic graph. The execution engine resolves this graph and runs steps in the correct order.

---

## Steps

Each step represents a single API call. Click **+ Add Step** or use **Import from curl** to create one.

### Method & URL

| Method | Description |
|--------|-------------|
| `GET` | Retrieve a resource |
| `POST` | Create a resource |
| `PUT` | Replace a resource |
| `PATCH` | Partially update a resource |
| `DELETE` | Delete a resource |

The URL supports placeholders: `${BASE_URL}/api/users/{{Create User.id}}`

### Headers

Step-level headers that override environment defaults when the same key is used. Each header is a key-value pair. Placeholders work in both key and value.

### Request Body

| Body Type | Description |
|-----------|-------------|
| **None** | No request body (default for GET/DELETE) |
| **JSON** | Raw JSON body with syntax validation. Content-Type set to `application/json` |
| **Form Data** | Multipart form-data with text and file fields |

**Form Data Fields:**

| Field | Type | Value |
|-------|------|-------|
| Key | — | Form field name |
| Type | `text` | Plain text value (supports `${VAR}` and `{{step.path}}` placeholders) |
| Type | `file` | File reference using `${FILE:fileKey}` syntax |

When a `${FILE:...}` value is entered, the type auto-switches to `file`.

### Query Parameters

Key-value pairs appended to the URL as `?key=value&key2=value2`. Placeholders supported in both key and value.

### Dependencies

Steps that must execute before this one. Select from other steps in the same suite.

| Option | Default | Description |
|--------|---------|-------------|
| **Use Cache** | `true` | Reuse the dependency's cached response if TTL hasn't expired. Set `false` to always re-execute. |
| **Reuse Manual Input** | `true` | If the dependency has `#{param}` placeholders and the value was already provided in this run, silently reuse it. Set `false` to prompt again. |

Once a dependency is added, you can reference its response data with `{{StepName.jsonPath}}` in any field.

### Variable Extraction

Extract values from a step's response for use in later steps.

| Field | Description |
|-------|-------------|
| **Variable Name** | Name to store the extracted value (referenced as `{{StepName.variableName}}`) |
| **JSON Path** | Path to the value in the response |
| **Source** | Where to extract from (see below) |

**Extraction Sources:**

| Source | JSON Path / Key | Description |
|--------|-----------------|-------------|
| `RESPONSE_BODY` | `$.data.id` | Extract from JSON response body |
| `RESPONSE_HEADER` | `Authorization` | Extract a response header value by name |
| `STATUS_CODE` | *(not used)* | Stores the HTTP status code as a string (e.g., `"200"`) |
| `REQUEST_BODY` | `$.orderId` | Extract from the resolved request body (JSON path) |
| `REQUEST_HEADER` | `X-Request-ID` | Extract a resolved request header value by name (e.g., auto-generated UUID) |
| `QUERY_PARAM` | `page` | Extract a resolved query parameter value by name |
| `REQUEST_URL` | *(not used)* | Stores the full resolved request URL |

All values are **resolved** — you get the actual runtime value, not the placeholder template. For example, extracting from `REQUEST_HEADER` with key `X-Request-ID` returns the generated UUID, not `${REQUEST_ID}`.

**JSON Path Syntax:**

| Pattern | Example | Description |
|---------|---------|-------------|
| `$.field` | `$.id` | Top-level field |
| `$.nested.field` | `$.data.user.name` | Nested field |
| `$.array[0]` | `$.items[0]` | First array element |
| `$.array[0].field` | `$.items[0].id` | Field in first array element |
| `$.length()` | `$.items.length()` | Array or string length |
| `$.size()` | `$.items.size()` | Same as length() |

### Response Handlers

Define what action to take for each HTTP status code. Handlers are evaluated in priority order (lowest first). Specific codes take precedence over ranges.

| Field | Description |
|-------|-------------|
| **Match Code** | HTTP status code or range: `200`, `404`, `2xx`, `4xx`, `5xx` |
| **Action** | What to do when matched (see below) |
| **Priority** | Evaluation order (0 = first) |

**Actions:**

| Action | Description | Extra Fields |
|--------|-------------|--------------|
| `SUCCESS` | Mark step as successful, proceed to dependents | — |
| `ERROR` | Mark step as failed, skip dependents | — |
| `RETRY` | Re-execute the step after a delay | `retryCount` (max attempts), `retryDelaySeconds` (delay between retries) |
| `FIRE_SIDE_EFFECT` | Execute another step as a side effect | `sideEffectStepId` (which step to trigger) |

**Example setup:**

| Match Code | Action | Priority | Notes |
|-----------|--------|----------|-------|
| `2xx` | SUCCESS | 0 | Any 2xx is success |
| `500` | RETRY | 1 | Retry on server error (3 times, 5s delay) |
| `4xx` | ERROR | 2 | Client errors are failures |

### Caching

Within-run response caching to avoid re-executing the same dependency multiple times.

| Field | Default | Description |
|-------|---------|-------------|
| **Cacheable** | `false` | Enable caching for this step's response |
| **Cache TTL (seconds)** | `0` | How long the cache is valid. `0` = valid until run ends |

Cache is **per-run only** — it is not shared across different runs. When a dependent step needs this step's result and the cache has expired, the step is automatically re-executed.

### Dependency-Only Steps

| Field | Default | Description |
|-------|---------|-------------|
| **Dependency Only** | `false` | When `true`, the step is skipped during suite runs. It only executes on-demand when a dependent step needs it. The individual Run button still works. |

Use this for setup steps (e.g., "Create Auth Token") that should only run when another step depends on them.

### Verifications

Run queries against infrastructure connectors after the API call completes, then assert on the results. Use this to verify side effects (e.g., database row created, Kafka event published, Redis key set).

Each verification has:

| Field | Description |
|-------|-------------|
| **Connector** | Which environment connector to use (by name) |
| **Query** | The query/command to execute (connector-specific, see [Connector Reference](#connector-reference)) |
| **Timeout (seconds)** | Overall verification timeout (default 30) |
| **Query Timeout (seconds)** | Query execution timeout (default 30) |
| **Pre-Listen** | Start listening BEFORE the step executes (for async events — Kafka, RabbitMQ) |

**Pre-Listen Mode:**

For asynchronous systems where the event is published during the API call:

1. Verification sets up a listener (e.g., Kafka consumer) **before** the API call
2. Step executes the API call
3. Listener waits for a matching message within the timeout
4. Assertions run on the received message

Supported for: **KAFKA**, **RABBITMQ** (and technically all connectors, but most useful for message brokers).

**Assertions:**

Each verification can have multiple assertions on the query result:

| Field | Description |
|-------|-------------|
| **JSON Path** | Path to the value in the query result (e.g., `$.rows[0].status`) |
| **Operator** | Comparison operator (see below) |
| **Expected Value** | Value to compare against |

**Assertion Operators:**

| Operator | Description | Example |
|----------|-------------|---------|
| `EQUALS` | Exact match | `$.status` EQUALS `"active"` |
| `NOT_EQUALS` | Not equal | `$.status` NOT_EQUALS `"deleted"` |
| `CONTAINS` | Substring match | `$.message` CONTAINS `"success"` |
| `NOT_CONTAINS` | Doesn't contain | `$.error` NOT_CONTAINS `"fatal"` |
| `REGEX` | Regex pattern match | `$.email` REGEX `^.+@.+\..+$` |
| `GT` | Greater than (numeric) | `$.count` GT `0` |
| `LT` | Less than (numeric) | `$.latency` LT `1000` |
| `GTE` | Greater than or equal | `$.count` GTE `1` |
| `LTE` | Less than or equal | `$.retries` LTE `3` |
| `EXISTS` | Field exists in result | `$.id` EXISTS |
| `NOT_EXISTS` | Field doesn't exist | `$.error` NOT_EXISTS |

---

## Placeholders & Autocomplete

OrchestAPI supports four types of dynamic placeholders. All placeholder-enabled fields show an autocomplete dropdown.

### Environment Variables

| Syntax | Example | Trigger |
|--------|---------|---------|
| `${VAR_NAME}` | `${BASE_URL}/api/users` | Type `${` |

Resolves to the variable value from the active environment. Works in URL, headers, body, query params, and verification queries.

**Highlighted in green** in the editor.

### Step Response References

| Syntax | Example | Trigger |
|--------|---------|---------|
| `{{StepName.path}}` | `{{Create User.id}}` | Type `{{` |

References extracted variables or any JSON path from a dependency step's response. The step must be added as a dependency first.

Two-step autocomplete:
1. Type `{{` → shows dependent step names
2. Select a step → type `.` → shows extracted variable names
3. You can also type a custom JSON path (e.g., `{{StepName.data.items[0].id}}`)

**Highlighted in blue** in the editor.

### Manual Input

| Syntax | Example | Behavior |
|--------|---------|----------|
| `#{paramName}` | `#{otp}` | Prompts user at runtime (required) |
| `#{paramName:default}` | `#{env:production}` | Prompts with pre-filled default (optional) |

During execution, the UI pauses and shows an input modal. The user enters the value and execution resumes.

**Within-run caching:** If the same `#{paramName}` appears in multiple steps, the value is cached after the first prompt. The `reuseManualInput` dependency flag controls whether cached values are silently reused (`true`) or the user is prompted again (`false`).

**Scheduled runs:** Only `#{param:default}` placeholders are used (the default value is applied automatically). `#{param}` without a default is skipped.

**Highlighted in red/orange** in the editor.

### File References

| Syntax | Example | Trigger |
|--------|---------|---------|
| `${FILE:fileKey}` | `${FILE:avatar}` | Type `${FILE:` |

References an uploaded file from the environment's Files section. Used in form-data fields to attach files to multipart requests.

**Highlighted in green** in the editor (same as env vars).

---

## Running Tests

### Single Step

Click the **play button** next to any step. The step and all its transitive dependencies are executed in order. Results show the target step at top level with dependencies in a collapsible accordion.

### Full Suite

Click **Run Suite** at the top of the suite detail page. Optionally override the default environment. All non-dependency-only steps execute in topological order based on the dependency graph.

### Live Streaming (SSE)

Both single step and suite runs stream results in real time via Server-Sent Events:

| Event | Description |
|-------|-------------|
| `run-started` | Run initiated, returns `runId` |
| `step` | A step completed — includes full result with status, response, extracted variables, verifications |
| `input-required` | Execution paused — a step needs manual input (see below) |
| `complete` | All steps finished — includes final status and total duration |
| `run-error` | Fatal error during run |

### Manual Input During Runs

When a step contains `#{param}` placeholders, execution pauses and shows a modal:

- Each parameter is shown with its name
- If a default value exists (`#{param:default}`), it's pre-filled
- If a cached value exists from an earlier step, it's shown
- Enter values and click **Submit** to resume execution

---

## Run Results

Each step result includes:

| Field | Description |
|-------|-------------|
| **Status** | SUCCESS, ERROR, SKIPPED, VERIFICATION_FAILED |
| **Response Code** | HTTP status code |
| **Response Body** | Full response body |
| **Response Headers** | All response headers |
| **Duration** | Execution time in milliseconds |
| **Request URL** | The resolved URL that was called |
| **Request Body** | The resolved request body |
| **Request Headers** | All headers sent |
| **Extracted Variables** | Variables extracted from the response |
| **Verification Results** | Each verification's pass/fail status with assertion details |
| **Error Message** | Error details (if failed) |
| **From Cache** | Whether the result was served from cache |

**Step Status Values:**

| Status | Color | Description |
|--------|-------|-------------|
| `SUCCESS` | Green | Step and all verifications passed |
| `ERROR` | Red | HTTP call failed or response handler returned ERROR |
| `SKIPPED` | Gray | Dependency failed or step not needed |
| `VERIFICATION_FAILED` | Purple | API call succeeded but verification assertions failed |

**Suite Status Values:**

| Status | Description |
|--------|-------------|
| `SUCCESS` | All steps passed |
| `PARTIAL_FAILURE` | Some steps failed but suite continued |
| `FAILURE` | A critical step failed |

---

## Scheduling

Go to **Runs** page > **Schedules** tab.

### Create a Schedule

| Field | Description |
|-------|-------------|
| **Test Suite** | Which suite to run |
| **Environment** | Which environment to use |
| **Cron Expression** | Standard 5-field cron pattern |
| **Description** | Optional label |
| **Active** | Toggle on/off without deleting |

### Cron Format

```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-6, 0=Sunday)
│ │ │ │ │
* * * * *
```

**Examples:**

| Expression | Description |
|-----------|-------------|
| `0 0 * * *` | Every day at midnight |
| `0 9 * * *` | Every day at 9:00 AM |
| `*/15 * * * *` | Every 15 minutes |
| `0 */4 * * *` | Every 4 hours |
| `0 9 * * MON` | Every Monday at 9:00 AM |
| `0 9,17 * * *` | Every day at 9:00 AM and 5:00 PM |
| `0 0 1 * *` | First day of every month at midnight |

Use **Preview** to see the next fire times before saving.

### Scheduled Run Behavior

- Scheduled runs are **non-interactive** — no manual input prompts
- `#{param:default}` placeholders use the default value automatically
- `#{param}` without a default is skipped
- Results are saved to run history with trigger type `SCHEDULED`

---

## Run History

Go to **Runs** page > **Run History** tab.

![Run History](frontend/public/screenshots/runs.png)

**Filters:**

| Filter | Description |
|--------|-------------|
| **Suite** | Filter by test suite |
| **Environment** | Filter by environment |
| **Status** | SUCCESS, FAILURE, PARTIAL_FAILURE, CANCELLED, RUNNING |
| **Trigger Type** | MANUAL or SCHEDULED |
| **Date Range** | Filter by start date range |

**Features:**
- Paginated (10 per page)
- Click any row to expand full step-by-step results
- **Export** results to JSON

---

## Dashboard

The dashboard shows execution statistics at a glance:

- **Total Runs** — all runs ever executed
- **Success / Failure / Partial Failure / Cancelled** — breakdown by status
- **Active Schedules** — number of enabled schedules
- **Total Suites** — number of test suites
- **Total Environments** — number of environments

---

## Curl Import

Quickly create a step from a curl command. Click **Import from curl** in the suite detail page.

**Supported curl flags:**

| Flag | Description |
|------|-------------|
| `-X METHOD` / `--request` | HTTP method |
| `-H "Key: Value"` / `--header` | Request headers (multiple allowed) |
| `-d data` / `--data` | Request body |
| `--data-raw` | Raw body data |
| `--data-binary` | Binary body data |
| URL query params | Auto-extracted from the URL |

**Parsing rules:**
- Line continuations (`\` at end of line) are handled
- Single and double quotes are respected
- Step name is auto-generated from the URL path
- Method defaults to POST if body is present, GET otherwise
- Query parameters are extracted from the URL into the query params table

---

## Connector Reference

### JDBC Connectors (MySQL, PostgreSQL, Oracle, SQL Server)

**Config:**

| Field | Description |
|-------|-------------|
| `host` | Database host |
| `port` | Port (MySQL: 3306, PostgreSQL: 5432, Oracle: 1521, SQL Server: 1433) |
| `database` | Database name |
| `username` | Database user |
| `password` | Database password |
| `ssl` | `true` to enable SSL/TLS |
| `caCertificate` | PEM-format CA certificate (optional — empty = trust all) |

**Query:** Standard SQL SELECT statements.

**Result format:**
```json
{ "rows": [{ "id": 1, "name": "test" }], "rowCount": 1 }
```

### Redis

**Config:**

| Field | Description |
|-------|-------------|
| `host` | Redis host |
| `port` | Port (default 6379) |
| `password` | Auth password (optional) |
| `database` | Database index 0-15 (default 0) |
| `ssl` / `caCertificate` | SSL/TLS config |

**Query:** Redis commands — `GET key`, `HGET hash field`, `HGETALL hash`, `EXISTS key`, `LRANGE key 0 -1`, `SISMEMBER set member`.

**Result format:**
```json
{ "value": "data", "type": "string", "exists": true }
```

### Elasticsearch

**Config:**

| Field | Description |
|-------|-------------|
| `url` | Base URL (e.g., `https://localhost:9200`) |
| `username` | Basic auth username |
| `password` | Basic auth password |
| `ssl` / `caCertificate` | SSL/TLS config |

**Query:** `METHOD /path body` — e.g., `GET /my-index/_search {"query":{"match_all":{}}}`.

**Result format:** Raw Elasticsearch JSON response.

### Kafka

**Config:**

| Field | Description |
|-------|-------------|
| `brokers` | Comma-separated broker list (e.g., `localhost:9092`) |
| `securityProtocol` | Optional: `SSL`, `SASL_SSL`, `SASL_PLAINTEXT` |
| `saslMechanism` | Optional: `PLAIN`, `SCRAM-SHA-256`, `SCRAM-SHA-512` |
| `saslUsername` | SASL username |
| `saslPassword` | SASL password |
| `ssl` / `caCertificate` | SSL/TLS config |

**Query (newline-separated):**
```
topic=events_topic
key=order-123
```
- `topic` — required, topic name to consume from
- `key` — optional, filter messages by key

**Behavior:**
- Creates an isolated consumer group per verification (UUID-based)
- Seeks to latest offset and waits for new messages
- If `key` is set, discards non-matching messages

**Result format:**
```json
{ "found": true, "key": "order-123", "value": { "eventType": "ORDER_CREATED" }, "partition": 0, "offset": 42, "timestamp": 1708900000000 }
```

### RabbitMQ

**Config:**

| Field | Description |
|-------|-------------|
| `host` | RabbitMQ host |
| `port` | Port (5672 unencrypted, 5671 SSL) |
| `virtualHost` | Virtual host (default `/`) |
| `username` | Auth username |
| `password` | Auth password |
| `ssl` / `caCertificate` | SSL/TLS config |

**Query (space-separated):**
```
queue=my_queue routingKey=order.created
```
- `queue` — required, queue name to consume from
- `routingKey` — optional, filter by routing key

**Result format:**
```json
{ "found": true, "routingKey": "order.created", "body": { "orderId": "123" }, "headers": {} }
```

### MongoDB

**Config (Option A — connection string):**

| Field | Description |
|-------|-------------|
| `connectionString` | Full MongoDB URI (e.g., `mongodb://user:pass@host:27017/db`) |

**Config (Option B — individual fields):**

| Field | Description |
|-------|-------------|
| `host` | MongoDB host |
| `port` | Port (default 27017) |
| `database` | Database name |
| `username` | Auth username (optional) |
| `password` | Auth password (optional) |
| `ssl` / `caCertificate` | SSL/TLS config |

**Query:** `collection.{filter_json}` — e.g., `orders.{"orderId":"abc123"}`.

**Result format:**
```json
{ "documents": [{ "orderId": "abc123", "status": "completed" }], "count": 1 }
```

---

## Configuration

### Server Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_URL` | `jdbc:postgresql://localhost:5432/test` | PostgreSQL JDBC URL |
| `DB_USERNAME` | `demographics_user` | Database username |
| `DB_PASSWORD` | *(required)* | Database password |
| `SERVER_PORT` | `8080` | Backend server port |

### Limits

| Limit | Value |
|-------|-------|
| Max file upload size | 50 MB |
| Max request body size | 50 MB |
| Max page size (pagination) | 100 |
| Default page size | 10 |

---

## License

[MIT](LICENSE) — see [NOTICE](NOTICE) for third-party licenses.
