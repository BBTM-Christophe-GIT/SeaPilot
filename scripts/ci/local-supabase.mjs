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
# Keep password/email login enabled; the global auth setting forbids signups.
enable_signup = true
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
  'working_time_signed_entry_flow_test.sql',
  'working_time_daily_approval_test.sql',
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

const apiSessionTests = new Set([
  'working_time_actor_scope_test.sql',
  'working_time_assignment_profiles_test.sql',
  'working_time_signed_entry_flow_test.sql',
])

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

function run(command, args, { capture = false, timeout = 20 * 60_000, log, input } = {}) {
  const logFile = log ? openSync(safePath(log), 'w', 0o600) : undefined
  const options = {
    cwd: repository,
    env: cleanEnvironment(),
    encoding: 'utf8',
    stdio: logFile === undefined ? (capture ? 'pipe' : (input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'])) : ['ignore', 'pipe', logFile],
    input,
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
    if (log || (capture && (result.stderr || result.stdout))) {
      process.stderr.write(diagnostic(log ? readFileSync(log, 'utf8') : [result.stderr, result.stdout].filter(Boolean).join('\n')))
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
  const referenceMigration = '20260909070843_ci_reference_data.sql'
  const stale = readdirSync(migrations).filter((name) => !names.includes(name) && name !== referenceMigration)
  if (stale.length) fail('The CI migration snapshot has stale files. Remove only .ci/supabase-local before restarting.')
  // Historical migrations patch stored function definitions using exact LF
  // strings. Normalize the disposable copies so Windows and Linux replay alike.
  for (const name of names) {
    let sql = readFileSync(path.join(source, name), 'utf8').replaceAll('\r\n', '\n')
    // The CLI replays statements independently, whereas these legacy files
    // explicitly rely on apply_migration's transaction for LOCK / SET LOCAL.
    const needsTransaction = /^\s*(?:lock\s+table\b|set\s+local\s+)/im.test(sql)
    const hasTransaction = /^\s*(?:begin|start\s+transaction)\s*;/im.test(sql)
    if (needsTransaction && !hasTransaction) {
      if (/^\s*(?:create\s+(?:unique\s+)?index\s+concurrently|vacuum|create\s+database|alter\s+system|alter\s+type\b.*\badd\s+value)\b/im.test(sql)) {
        fail(`Review the transaction contract before replaying ${name} in CI.`)
      }
      sql = `begin;\n${sql}\ncommit;\n`
    }
    writeFileSync(path.join(migrations, name), sql)
  }
  copyFileSync(path.join(repository, 'scripts', 'ci', 'reference-data.sql'), path.join(migrations, referenceMigration))
  console.log(`Starting ${projectId} with ${names.length} application migrations and CI-only reference placeholders at ${apiUrl}.`)
  // CLI status output includes generated local service keys. Keep those out of
  // the console; env exposes only the public browser configuration separately.
  const log = path.join(runtime, 'start.log')
  console.log('Startup diagnostics: .ci/supabase-local/start.log')
  cli(['start', '--exclude', 'edge-runtime,imgproxy,logflare,mailpit,postgres-meta,realtime,studio,supavisor,vector'], { capture: true, log })
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
  // CLI 2.109.1's db query uses a prepared statement and rejects multi-statement
  // files. psql streams the complete transaction to this exact local container.
  run('docker', ['exec', '-i', `supabase_db_${projectId}`, 'psql', '--username', 'postgres', '--dbname', 'postgres', '--no-psqlrc', '--quiet', '--set', 'ON_ERROR_STOP=1'], {
    input: `set plpgsql.check_asserts = on;\n${readFileSync(source, 'utf8')}`,
    capture: true,
  })
  console.log(`SQL completed in ${projectId}: ${path.relative(repository, source)}`)
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
  cli(['test', 'db', '--local', ...tests.filter((file) => !apiSessionTests.has(path.basename(file)))])
  // These suites must change SESSION AUTHORIZATION to authenticator before
  // exercising authenticated actors. The CLI's postgres login cannot do that.
  // Only fixture setup uses the local superuser; tests assert the API identity.
  const apiResults = run('docker', [
    'run', '--rm', '--network', `supabase_network_${projectId}`,
    '--mount', `type=bind,source=${safePath(testDirectory)},target=/tests,readonly`,
    '--env', 'PGPASSWORD=postgres',
    'public.ecr.aws/supabase/pg_prove:3.36', 'pg_prove', '--norc', '--nocolor',
    '--host', `supabase_db_${projectId}`, '--port', '5432',
    '--username', 'supabase_admin', '--dbname', 'postgres',
    ...[...apiSessionTests].map((file) => `/tests/${file}`),
  ], { capture: true })
  process.stdout.write(apiResults)
  const apiSummary = /Files=(\d+),\s*Tests=(\d+)/.exec(apiResults)
  if (!apiSummary || Number(apiSummary[1]) !== apiSessionTests.size || Number(apiSummary[2]) === 0 || !/Result:\s+PASS\b/.test(apiResults)) {
    fail('The real API-session suites did not report a complete, nonempty passing TAP run.')
  }
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
