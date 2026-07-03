import { execFile } from 'node:child_process';
import { dirname, join, parse } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { runSharePointLinkedImportCli } from '../src/features/sharepoint/sharePointLinkedImportCli.ts';

const execFileAsync = promisify(execFile);

const exitCode = await runSharePointLinkedImportCli(process.argv.slice(2), {
  readTextFile: (path) => readFile(path, 'utf8'),
  runCommand: async (command, args) => {
    try {
      const { stdout, stderr } = await execFileAsync(command, args, {
        maxBuffer: 64 * 1024 * 1024,
        shell: process.platform === 'win32',
        windowsHide: true,
      });

      return {
        exitCode: 0,
        stderr,
        stdout,
      };
    } catch (error) {
      const failure = error as { code?: number; message?: string; stderr?: string; stdout?: string };

      return {
        exitCode: typeof failure.code === 'number' ? failure.code : 1,
        stderr: failure.stderr || failure.message || '',
        stdout: failure.stdout || '',
      };
    }
  },
  tempSqlPath: (bundlePath) => {
    const parsed = parse(bundlePath);
    return join(dirname(bundlePath), `${parsed.name}.linked-import.sql`);
  },
  writeLine: (line) => console.log(line),
  writeTextFile: (path, content) => writeFile(path, content, 'utf8'),
});

process.exitCode = exitCode;
