import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const projectRoot = process.cwd();
const docsRoot = path.resolve(projectRoot, '..', 'docs', 'Nebula-Weaver');
const outputPath = path.join(docsRoot, 'audit_phase8_failure_injection.json');

const result = {
  generatedAt: new Date().toISOString(),
  scenarios: [],
  baselineRestore: {
    ok: false,
    code: null
  },
  summary: {
    passed: 0,
    failed: 0,
    allPassed: false
  }
};

const runCommand = (command, args, envOverrides = {}) =>
  new Promise((resolve) => {
    const startedAt = Date.now();
    const proc = spawn(command, args, {
      cwd: projectRoot,
      shell: true,
      env: { ...process.env, ...envOverrides }
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
        code: code ?? 1,
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

const runScenario = async (name, command, args, expectedStep) => {
  const run = await runCommand(command, args, { AUDIT_FORCE_FAIL_STEP: expectedStep });
  const phase2 = await readJsonOrNull(path.join(docsRoot, 'audit_phase2_repro_result.json'));
  const phase4 = await readJsonOrNull(path.join(docsRoot, 'audit_phase4_module_deep_checks.json'));
  const phase5 = await readJsonOrNull(path.join(docsRoot, 'audit_phase5_stability_stress.json'));
  const full = await readJsonOrNull(path.join(docsRoot, 'audit_full_regression_report.json'));

  let ok = run.code !== 0;
  let evidence = 'non-zero exit';

  if (expectedStep === 'audit:phase2') {
    ok =
      ok &&
      phase2?.summary?.allChecksPassed === false &&
      phase2?.injectedFailure?.enabled === true;
    evidence = `code=${run.code}, phase2.summary=${phase2?.summary?.allChecksPassed}, injected=${phase2?.injectedFailure?.enabled}`;
  } else if (expectedStep === 'audit:phase4') {
    ok =
      ok &&
      phase4?.summary?.allChecksPassed === false &&
      phase4?.injectedFailure?.enabled === true;
    evidence = `code=${run.code}, phase4.summary=${phase4?.summary?.allChecksPassed}, injected=${phase4?.injectedFailure?.enabled}`;
  } else if (expectedStep === 'audit:phase5') {
    const failedStep = full?.steps?.find((s) => s.name === 'audit:phase5');
    ok =
      ok &&
      full?.summary?.allPassed === false &&
      failedStep &&
      failedStep.ok === false &&
      typeof failedStep.failure?.primaryMessage === 'string';
    evidence = `code=${run.code}, full.allPassed=${full?.summary?.allPassed}, failedStep=${failedStep?.name}, hasFailureMessage=${!!failedStep?.failure?.primaryMessage}`;
  }

  result.scenarios.push({
    name,
    command: `${command} ${args.join(' ')}`,
    expectedStep,
    code: run.code,
    durationMs: run.durationMs,
    ok,
    evidence
  });
  if (ok) result.summary.passed += 1;
  else result.summary.failed += 1;
};

try {
  await runScenario('Inject failure in phase2', 'npm', ['run', 'audit:phase2'], 'audit:phase2');
  await runScenario('Inject failure in phase4', 'npm', ['run', 'audit:phase4'], 'audit:phase4');
  await runScenario('Inject failure propagation in audit:full', 'npm', ['run', 'audit:full'], 'audit:phase5');

  // Restore baseline so subsequent work starts from a clean passing state.
  const restore = await runCommand('npm', ['run', 'audit:full']);
  const full = await readJsonOrNull(path.join(docsRoot, 'audit_full_regression_report.json'));
  result.baselineRestore = {
    ok: restore.code === 0 && full?.summary?.allPassed === true,
    code: restore.code
  };
} catch (err) {
  result.error = err instanceof Error ? err.message : String(err);
}

result.summary.allPassed =
  result.summary.failed === 0 && result.baselineRestore.ok === true && !result.error;

await fs.mkdir(docsRoot, { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf8');
console.log(JSON.stringify(result, null, 2));

if (!result.summary.allPassed) {
  process.exitCode = 1;
}

