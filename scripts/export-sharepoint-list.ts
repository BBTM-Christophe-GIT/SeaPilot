import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { runSharePointListExportCli } from '../src/features/sharepoint/sharePointListExportCli.ts';

const execFileAsync = promisify(execFile);

const exitCode = await runSharePointListExportCli(process.argv.slice(2), {
  now: () => new Date(),
  readTextFile: (path) => readFile(path, 'utf8'),
  runCommand: async (command, args) => {
    const executable = process.platform === 'win32' && command === 'pnpm' ? 'pnpm.cmd' : command;

    try {
      const { stdout, stderr } = await execFileAsync(executable, args, {
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
  writeLine: (line) => console.log(line),
  writeTextFile: (path, content) => writeFile(path, content, 'utf8'),
});

process.exitCode = exitCode;
