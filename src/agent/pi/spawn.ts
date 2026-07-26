import { spawn } from 'node:child_process';
import type { PiEvent } from './types';

/**
 * Spawn the pi CLI, stream its JSONL stdout into parsed events, and resolve on
 * completion. Enforces a hard timeout (SIGTERM then SIGKILL). Rejects if the
 * process produces no events and exits non-zero, or if it times out.
 */
export function invokePi(
  cliEntry: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<{ events: PiEvent[]; stderr: string }> {
  return new Promise((resolve, reject) => {
    const events: PiEvent[] = [];
    let stderr = '';
    let stdoutBuf = '';
    let timedOut = false;

    const child = spawn(process.execPath, [cliEntry, ...args], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* already dead */
        }
      }, 5000);
    }, timeoutMs);

    child.stdout?.setEncoding('utf-8');
    child.stdout?.on('data', (chunk: string) => {
      stdoutBuf += chunk;
      let nl: number;
      while ((nl = stdoutBuf.indexOf('\n')) >= 0) {
        const line = stdoutBuf.slice(0, nl).trim();
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (!line.startsWith('{')) continue;
        try {
          events.push(JSON.parse(line) as PiEvent);
        } catch {
          /* skip non-JSON lines */
        }
      }
    });

    child.stderr?.setEncoding('utf-8');
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const trailing = stdoutBuf.trim();
      if (trailing.startsWith('{')) {
        try {
          events.push(JSON.parse(trailing) as PiEvent);
        } catch {
          /* skip */
        }
      }
      if (timedOut) {
        reject(new Error(`pi review timed out after ${timeoutMs}ms.`));
        return;
      }
      if (code !== 0 && events.length === 0) {
        reject(
          new Error(
            `pi exited with code ${code} and produced no output.\nstderr:\n${stderr.slice(0, 2000)}`,
          ),
        );
        return;
      }
      resolve({ events, stderr });
    });
  });
}
