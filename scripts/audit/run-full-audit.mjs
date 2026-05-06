import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const projectRoot = process.cwd();
const docsRoot = path.resolve(projectRoot, '..', 'docs', 'Nebula-Weaver');
const outputPath = path.join(docsRoot, 'audit_full_regression_report.json');

const steps = [
  { name: 'audit:phase2', command: 'npm', args: ['run', 'audit:phase2'] },
  { name: 'audit:phase4', command: 'npm', args: ['run', 'audit:phase4'] },
  { name: 'audit:phase5', command: 'npm', args: ['run', 'audit:phase5'] },
  { name: 'audit:phase9', command: 'npm', args: ['run', 'audit:phase9'] },
  { name: 'test', command: 'npm', args: ['test'] },
  { name: 'typecheck', command: 'npx', args: ['tsc', '--noEmit'] },
  { name: 'build', command: 'npm', args: ['run', 'build'] }
];

const tailLines = (text, lines = 25) =>
  text
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-lines)
    .join('\n');

const summarizeFailure = (stdout, stderr) => {
  const stderrTail = tailLines(stderr, 20);
  const stdoutTail = tailLines(stdout, 20);
  const primary = stderrTail || stdoutTail || 'No output captured.';
  return {
    primaryMessage: primary.split(/\r?\n/).slice(-1)[0] || 'Unknown failure',
    stdoutTail,
    stderrTail
  };
};

const runStep = (step) =>
  new Promise((resolve) => {
    const startedAt = Date.now();
    const proc = spawn(step.command, step.args, {
      cwd: projectRoot,
      shell: true
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('close', (code) => {
      resolve({
        name: step.name,
        code: code ?? 1,
        ok: code === 0,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr
      });
    });
  });

const readJsonOrNull = async (filePath) => {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const report = {
  generatedAt: new Date().toISOString(),
  steps: [],
  summary: {
    allPassed: false,
    passed: 0,
    failed: 0
  },
  artifacts: {}
};

for (const step of steps) {
  // eslint-disable-next-line no-await-in-loop
  const res = await runStep(step);
  report.steps.push({
    name: res.name,
    ok: res.ok,
    code: res.code,
    durationMs: res.durationMs,
    ...(res.ok ? {} : { failure: summarizeFailure(res.stdout, res.stderr) })
  });

  if (!res.ok) {
    report.summary.failed += 1;
  } else {
    report.summary.passed += 1;
  }
}

report.summary.allPassed = report.summary.failed === 0;

report.artifacts.phase2 = await readJsonOrNull(
  path.join(docsRoot, 'audit_phase2_repro_result.json')
);
report.artifacts.phase4 = await readJsonOrNull(
  path.join(docsRoot, 'audit_phase4_module_deep_checks.json')
);
report.artifacts.phase5 = await readJsonOrNull(
  path.join(docsRoot, 'audit_phase5_stability_stress.json')
);
report.artifacts.phase9 = await readJsonOrNull(
  path.join(docsRoot, 'audit_phase9_star_detection_perf.json')
);

await fs.mkdir(docsRoot, { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.summary.allPassed) {
  console.error('[AUDIT] full regression failed: one or more steps failed');
  process.exitCode = 1;
}
