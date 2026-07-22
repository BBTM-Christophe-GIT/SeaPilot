import { createClient } from '@supabase/supabase-js';
import { runDprMigrationCli, defaultDprMigrationCliDependencies } from '../src/features/dpr/dprMigrationCli.ts';

const exitCode = await runDprMigrationCli(process.argv.slice(2), process.env, {
  ...defaultDprMigrationCliDependencies,
  createClient,
});

process.exitCode = exitCode;
