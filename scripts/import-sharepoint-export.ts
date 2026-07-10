import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { runSharePointImportCli } from '../src/features/sharepoint/sharePointImportCli.ts';

const exitCode = await runSharePointImportCli(process.argv.slice(2), process.env, {
  createClient,
  readTextFile: (path) => readFile(path, 'utf8'),
  writeLine: (line) => console.log(line),
});

process.exitCode = exitCode;
