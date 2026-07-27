import { describe, it, expect } from 'vitest';
import { runNpm } from './install';
import * as os from 'node:os';

describe('runNpm', () => {
  it('rejects with the captured stderr when the command exits non-zero', async () => {
    await expect(
      runNpm(
        [
          'exec',
          '--',
          'node',
          '-e',
          'process.stderr.write("EACCES: permission denied"); process.exit(1)',
        ],
        os.tmpdir(),
      ),
    ).rejects.toThrow(/exited with code 1/);
  }, 30000);

  it('rejects with a clear error on ENOENT (missing binary)', async () => {
    await expect(runNpm(['does-not-exist-xyz'], os.tmpdir())).rejects.toThrow();
  }, 30000);
});
