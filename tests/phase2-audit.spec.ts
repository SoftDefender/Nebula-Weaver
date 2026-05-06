import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { describe, expect, test } from 'vitest';

const execFileAsync = promisify(execFile);

const parseReport = (stdout: string) => {
  const start = stdout.indexOf('{');
  if (start === -1) {
    throw new Error(`Audit output does not contain JSON. Raw output: ${stdout}`);
  }
  return JSON.parse(stdout.slice(start));
};

describe('phase2 critical audit script', () => {
  test(
    'validates key boot resilience and delete-layer cleanup after fixes',
    async () => {
      const { stdout } = await execFileAsync(
        'node',
        ['./scripts/audit/phase2-critical-repro.mjs'],
        {
          cwd: process.cwd(),
          maxBuffer: 1024 * 1024 * 10
        }
      );

      const report = parseReport(stdout);

      expect(report.checks.p0_boot_without_gemini_key.bootFailed).toBe(false);
      expect(report.checks.p3_delete_layer_cleanup_gap.riskConfirmed).toBe(false);
      expect(report.checks.p1_export_extension_risk.fixedMp4Filename).toBe(false);
    },
    120000
  );
});
