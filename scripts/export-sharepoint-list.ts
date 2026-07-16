import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { runSharePointListExportCli } from '../src/features/sharepoint/sharePointListExportCli.ts';

const execFileAsync = promisify(execFile);

async function runCommandFile(command: string, args: string[]) {
  if (process.platform !== 'win32') {
    return execFileAsync(command, args, {
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
  }

  const executable = command === 'pnpm' ? 'pnpm.cmd' : command;
  const encodedArgs = Buffer.from(JSON.stringify(args), 'utf8').toString('base64');
  const powerShellCommand = [
    "$argumentJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:SEAPILOT_COMMAND_ARGUMENTS))",
    '$commandArguments = @($argumentJson | ConvertFrom-Json)',
    '& $env:SEAPILOT_COMMAND @commandArguments',
    'exit $LASTEXITCODE',
  ].join('; ');

  return execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', powerShellCommand],
    {
      env: {
        ...process.env,
        SEAPILOT_COMMAND: executable,
        SEAPILOT_COMMAND_ARGUMENTS: encodedArgs,
      },
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    },
  );
}

const exitCode = await runSharePointListExportCli(process.argv.slice(2), {
  now: () => new Date(),
  readTextFile: (path) => readFile(path, 'utf8'),
  runCommand: async (command, args) => {
    try {
      const { stdout, stderr } = await runCommandFile(command, args);

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
