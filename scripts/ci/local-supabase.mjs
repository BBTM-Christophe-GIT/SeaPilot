import { spawnSync } from 'node:child_process'
import { appendFileSync, closeSync, copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const runtime = path.join(repository, '.ci', 'supabase-local')
const projectId = 'SeaPilotCI'
const cliVersion = '2.109.1'
const apiUrl = 'http://127.0.0.1:55321'
const appUrl = 'http://127.0.0.1:4173'

// This configuration is deliberately independent of production configuration,
// linked-project metadata and developer .env files.
const localConfig = `project_id = "${projectId}"

[api]
enabled = true
port = 55321
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = 55322
shadow_port = 55320
major_version = 17
health_timeout = "2m"

[db.pooler]
enabled = false

[db.migrations]
enabled = true
schema_paths = []

[db.seed]
enabled = false
sql_paths = []

[auth]
enabled = true
site_url = "${appUrl}"
additional_redirect_urls = ["${appUrl}/**"]
enable_signup = false

[auth.email]
enable_signup = false
enable_confirmations = false

[storage]
enabled = true
file_size_limit = "50MiB"

[studio]
enabled = false
port = 55323

[local_smtp]
enabled = false
port = 55324

[realtime]
enabled = false

[edge_runtime]
enabled = false

[analytics]
enabled = false
`

const pgTapTests = [
  'projects_phase6_role_matrix_test.sql',
  'dpr_role_matrix_test.sql',
  'working_time_workflow_permissions_test.sql',
  'working_time_actor_scope_test.sql',
  'working_time_assignment_profiles_test.sql',
  'working_time_captain_assignment_role_test.sql',
  'temporary_captain_permissions_test.sql',
  'purchase_request_crew_creation_test.sql',
  'purchase_request_marin_operations_test.sql',
  'purchase_request_marin_approval_test.sql',
  'action_plan_captain_treatment_test.sql',
  'qsms_procedure_publishing_test.sql',
]

// These integration tests use PL/pgSQL ASSERT rather than TAP output. Running
// the whole mixed supabase/tests directory with pg_prove would reject them.
const assertionTests = [
  'assignment_vessel_read_window_test.sql',
  'dpr_dashboard_access_scope_test.sql',
  'hr_document_captain_upload_test.sql',
]

function fail(message) {
  throw new Error(message)
}

function cleanEnvironment() {
  const env = { ...process.env }
  for (const name of [
    'SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD', 'SUPABASE_PROJECT_ID',
    'SUPABASE_PROJECT_REF', 'SUPABASE_DB_URL', 'SUPABASE_WORKDIR',
    'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL',
    'PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE',
  ]) delete env[name]
  return env
}

function diagnostic(output) {
  const lines = output.replaceAll('\r', '').split('\n').map((line) => line.trimEnd())
  const shorten = (line) => line.length > 300 ? `${line.slice(0, 297)}...` : line
  const lastError = lines.findLast((line) => /^\s*(?:ERROR:|Error:|error:)/.test(line))
  const lastMigration = lines.findLast((line) => /Applying migration \d+/.test(line))
  const context = [lastError, lastMigration, ...lines.slice(-60)].filter(Boolean).map(shorten).join('\n')
  return `${context.slice(0, 7800)}\n`
}

function run(command, args, { capture = false, timeout = 20 * 60_000, log } = {}) {
  const logFile = log ? openSync(safePath(log), 'w', 0o600) : undefined
  const options = {
    cwd: repository,
    env: cleanEnvironment(),
    encoding: 'utf8',
    stdio: logFile === undefined ? (capture ? 'pipe' : 'inherit') : ['ignore', 'pipe', logFile],
    maxBuffer: 8 * 1024 * 1024,
    timeout,
    windowsHide: true,
    shell: process.platform === 'win32' && command === 'supabase',
  }
  // Windows CLI distributions can expose .cmd shims. Quote each argument and
  // reject expansion characters before invoking cmd, including checkout paths.
  const result = process.platform === 'win32' && command === 'supabase'
    ? spawnSync(`${command} ${args.map((arg) => {
      if (/["\r\n%&|<>^!]/.test(arg)) fail('Unsupported shell expansion character in a local CLI argument.')
      return `"${arg}"`
    }).join(' ')}`, options)
    : spawnSync(command, args, options)
  if (logFile !== undefined) closeSync(logFile)
  if (result.error) fail(`${command} failed: ${result.error.message}${log ? `; details: ${log}` : ''}`)
  if (result.status !== 0) {
    if (log || (capture && result.stderr)) {
      process.stderr.write(diagnostic(log ? readFileSync(log, 'utf8') : result.stderr))
    }
    fail(`${command} ${args.slice(0, 3).join(' ')} exited with ${result.status}`)
  }
  return result.stdout ?? ''
}

function safePath(value) {
  const resolved = path.resolve(repository, value)
  if (!resolved.startsWith(`${repository}${path.sep}`) || /[\r\n%&|<>^!]/.test(resolved)) {
    fail('SQL and runtime paths must stay inside this checkout and contain no shell expansion characters.')
  }
  return resolved
}

function cli(args, options) {
  safePath(runtime)
  return run('supabase', [...args, '--workdir', runtime], options)
}

function assertRuntime() {
  const configPath = path.join(runtime, 'supabase', 'config.toml')
  if (!existsSync(configPath) || readFileSync(configPath, 'utf8') !== localConfig) {
    fail('The isolated SeaPilotCI configuration is missing or changed. Run ci:db:start first.')
  }
  if (existsSync(path.join(runtime, 'supabase', '.temp', 'project-ref'))) {
    fail('The CI sandbox must never be linked to a remote Supabase project.')
  }
}

function assertCli() {
  const actual = run('supabase', ['--version'], { capture: true, timeout: 30_000 }).trim()
  if (actual !== cliVersion) fail(`Supabase CLI ${cliVersion} is required; found ${actual}.`)
}

function start() {
  console.log('Checking Docker availability for the isolated SeaPilotCI sandbox.')
  const existing = run('docker', ['ps', '-a', '--filter', `name=^supabase_db_${projectId}$`, '--format', '{{.Names}}'], { capture: true, timeout: 60_000 }).trim()
  if (existing) fail('SeaPilotCI already exists. Stop that test sandbox with ci:db:stop before starting a fresh one.')
  const migrations = path.join(runtime, 'supabase', 'migrations')
  safePath(migrations)
  mkdirSync(migrations, { recursive: true })
  writeFileSync(path.join(runtime, 'supabase', 'config.toml'), localConfig)
  const source = path.join(repository, 'supabase', 'migrations')
  const names = readdirSync(source).filter((name) => /^\d+_.+\.sql$/.test(name)).sort()
  const referenceMigration = '20260811121021_ci_reference_data.sql'
  const stale = readdirSync(migrations).filter((name) => !names.includes(name) && name !== referenceMigration)
  if (stale.length) fail('The CI migration snapshot has stale files. Remove only .ci/supabase-local before restarting.')
  // Historical migrations patch stored function definitions using exact LF
  // strings. Normalize the disposable copies so Windows and Linux replay alike.
  for (const name of names) {
    writeFileSync(path.join(migrations, name), readFileSync(path.join(source, name), 'utf8').replaceAll('\r\n', '\n'))
  }
  copyFileSync(path.join(repository, 'scripts', 'ci', 'reference-data.sql'), path.join(migrations, referenceMigration))
  console.log(`Starting ${projectId} with ${names.length} application migrations and CI-only reference placeholders at ${apiUrl}.`)
  // CLI status output includes generated local service keys. Keep those out of
  // the console; env exposes only the public browser configuration separately.
  const log = path.join(runtime, 'start.log')
  console.log('Startup diagnostics: .ci/supabase-local/start.log')
  cli(['start', '--exclude', 'edge-runtime,imgproxy,logflare,mailpit,postgres-meta,realtime,studio,supavisor,vector', '--debug'], { capture: true, log })
  console.log(`The isolated ${projectId} stack is ready.`)
}

function environment() {
  assertRuntime()
  const status = JSON.parse(cli(['status', '--output', 'json'], { capture: true, timeout: 30_000 }))
  if (status.API_URL !== apiUrl || !/^[A-Za-z0-9._-]+$/.test(status.ANON_KEY ?? '')) fail('Supabase status did not return the expected isolated local API and public anon key.')
  const content = [
    `VITE_SUPABASE_URL=${apiUrl}`,
    `VITE_SUPABASE_ANON_KEY=${status.ANON_KEY}`,
    `VITE_APP_BASE_URL=${appUrl}`,
    `E2E_SUPABASE_URL=${apiUrl}`,
  ].join('\n') + '\n'
  writeFileSync(path.join(repository, '.ci', 'supabase.env'), content, { mode: 0o600 })
  if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, content)
  console.log('Public local settings written to .ci/supabase.env and GITHUB_ENV when available.')
}

function sql(file) {
  assertRuntime()
  const source = safePath(file)
  if (!source.endsWith('.sql') || !existsSync(source)) fail('Expected an existing SQL file inside this checkout.')
  // ASSERT must remain active even if a local PostgreSQL setting disabled it.
  const wrapper = path.join(runtime, 'assertions.sql')
  writeFileSync(wrapper, `set plpgsql.check_asserts = on;\n${readFileSync(source, 'utf8')}`)
  cli(['db', 'query', '--local', '--file', wrapper])
}

function permissions() {
  assertRuntime()
  console.log(`Running ${pgTapTests.length} pgTAP suites for real Marin/Capitaine accounts.`)
  // Pass explicit files so one-off remote smoke scripts and SQL ASSERT suites
  // are not accidentally treated as TAP tests.
  const testDirectory = path.join(runtime, 'supabase', 'tests')
  mkdirSync(testDirectory, { recursive: true })
  const tests = pgTapTests.map((file) => {
    const target = path.join(testDirectory, file)
    copyFileSync(path.join(repository, 'supabase', 'tests', file), target)
    return safePath(target)
  })
  cli(['db', 'query', '--local', 'create extension if not exists pgtap with schema extensions;'])
  cli(['test', 'db', '--local', ...tests])
  for (const file of assertionTests) {
    console.log(`Running SQL assertions: ${file}`)
    sql(path.join('supabase', 'tests', file))
  }
}

function stop() {
  assertRuntime()
  cli(['stop', '--project-id', projectId, '--no-backup'])
}

try {
  const [command, ...args] = process.argv.slice(2)
  if (!['start', 'env', 'permissions', 'sql', 'stop'].includes(command) ||
      (command === 'sql' ? args.length !== 1 || args[0].startsWith('-') : args.length !== 0)) {
    fail('Usage: local-supabase.mjs start|env|permissions|stop, or sql <checkout-relative.sql>. Remote targets and CLI flags are not accepted.')
  }
  assertCli()
  if (command === 'start') start()
  if (command === 'env') environment()
  if (command === 'permissions') permissions()
  if (command === 'sql') sql(args[0])
  if (command === 'stop') stop()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
