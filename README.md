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

## Usage

### Environments

1. Go to **Environments** in the sidebar
2. Click **Create** to add a new environment
3. Add **Variables** (e.g., `BASE_URL`, `API_KEY`) — toggle the secret flag for sensitive values
4. Add **Default Headers** that auto-apply to all API steps (supports Static, Variable, UUID, and ISO Timestamp types)
5. Add **Connectors** for infrastructure verification (databases, Redis, Kafka, etc.) — supports SSL/TLS
6. Upload **Files** for use in multipart form-data requests

### Test Suites

1. Go to **Test Suites** in the sidebar
2. Click **Create** to add a new suite, assign a default environment
3. Add steps using the **+ Add Step** button or **Import from curl**

### Steps

Each step represents a single API call. Configure:

- **Method & URL** — use `${VAR}` to reference environment variables
- **Headers** — step headers override environment defaults
- **Body** — choose None, JSON, or Form Data (with file uploads via `${FILE:fileKey}`)
- **Dependencies** — select steps that must run before this one; use `{{stepName.jsonPath}}` to reference their response data
- **Variable Extraction** — extract values from JSON body, headers, regex, or status code for use in later steps
- **Response Handlers** — define what happens for each status code (SUCCESS, ERROR, RETRY, FIRE_SIDE_EFFECT)
- **Verifications** — run queries/commands against infrastructure connectors after the API call and assert on results

### Placeholders

| Syntax | Source | Example |
|--------|--------|---------|
| `${VAR_NAME}` | Environment variable | `${BASE_URL}/api/users` |
| `{{stepName.path}}` | Dependency step response (JSON path) | `{{Create User.id}}` |
| `#{inputName}` | Manual input (prompted at runtime) | `#{otp}` |
| `#{inputName:default}` | Manual input with default value | `#{env:production}` |
| `${FILE:fileKey}` | Uploaded file (form-data only) | `${FILE:avatar}` |

Autocomplete is available — type `${`, `{{`, `#{`, or `${FILE:` to see suggestions.

### Running Tests

- **Run a single step** — click the play button next to the step
- **Run the entire suite** — click the **Run Suite** button at the top
- Results stream live via SSE with expandable details for each step

### Scheduling

1. Go to the **Runs** page
2. Switch to the **Schedules** tab
3. Click **Create Schedule** — pick a suite, environment, and cron expression
4. Toggle schedules on/off as needed

Scheduled runs use default values for `#{input:default}` placeholders and skip inputs without defaults.

### Run History

The **Runs** page > **Run History** tab shows all past executions (manual and scheduled) with:

- Status filtering and date range search
- Expandable result details per step
- Export to JSON

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_URL` | `jdbc:postgresql://localhost:5432/test` | PostgreSQL JDBC URL |
| `DB_USERNAME` | `demographics_user` | Database username |
| `DB_PASSWORD` | *(required)* | Database password |
| `SERVER_PORT` | `8080` | Backend server port |

---

## License

MIT
