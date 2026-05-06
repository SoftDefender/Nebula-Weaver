import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const projectRoot = process.cwd();
const docsRoot = path.resolve(projectRoot, '..', 'docs', 'Nebula-Weaver');
const outputPath = path.join(docsRoot, 'audit_phase9_star_detection_perf.json');

const stripAnsi = (text) => text.replace(/\x1B\[[0-9;]*m/g, '');
const BENCH_RUNS = Number.parseInt(process.env.AUDIT_PHASE9_RUNS || '3', 10);

const tailLines = (text, lines = 40) =>
  text
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-lines)
    .join('\n');

const parseBenchRow = (cleanOutput, label) => {
  const line = cleanOutput
    .split(/\r?\n/)
    .find((entry) => entry.includes(label));
  if (!line) return null;

  const numbers = line.match(/[0-9]+(?:\.[0-9]+)?/g)?.map(Number) || [];
  if (numbers.length < 4) return null;

  return {
    hz: numbers[0],
    minMs: numbers[1],
    maxMs: numbers[2],
    meanMs: numbers[3]
  };
};

const runBench = () =>
  new Promise((resolve) => {
    const proc = spawn('npm', ['run', 'perf:star-detection'], {
      cwd: projectRoot,
      shell: true
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      resolve({
        code: code ?? 1,
        ok: code === 0,
        stdout,
        stderr
      });
    });
  });

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

const result = {
  generatedAt: new Date().toISOString(),
  step: 'audit:phase9',
  command: 'npm run perf:star-detection',
  runsRequested: BENCH_RUNS,
  ok: false,
  runs: [],
  aggregated: {
    successfulRuns: 0,
    medianSpeedupFactor: null,
    medianDefaultMeanMs: null,
    medianAggressiveMeanMs: null
  }
};

for (let runIndex = 0; runIndex < BENCH_RUNS; runIndex += 1) {
  // eslint-disable-next-line no-await-in-loop
  const bench = await runBench();
  const cleanStdout = stripAnsi(bench.stdout);
  const cleanStderr = stripAnsi(bench.stderr);

  const defaultTuning = parseBenchRow(cleanStdout, 'default tuning');
  const aggressiveTuning = parseBenchRow(cleanStdout, 'aggressive performance tuning');
  const speedupMatch = cleanStdout.match(/([0-9]+(?:\.[0-9]+)?)x\s+faster than\s+default tuning/i);
  const speedupFactor = speedupMatch ? Number(speedupMatch[1]) : null;

  const runResult = {
    run: runIndex + 1,
    ok: bench.ok && !!defaultTuning && !!aggressiveTuning && Number.isFinite(speedupFactor),
    metrics: {
      defaultTuning,
      aggressiveTuning,
      speedupFactor
    },
    output: {
      stdoutTail: tailLines(cleanStdout),
      stderrTail: tailLines(cleanStderr)
    }
  };

  result.runs.push(runResult);
}

const successfulRuns = result.runs.filter((run) => run.ok);
result.aggregated.successfulRuns = successfulRuns.length;

const speedups = successfulRuns
  .map((run) => run.metrics.speedupFactor)
  .filter((value) => Number.isFinite(value));
const defaultMeans = successfulRuns
  .map((run) => run.metrics.defaultTuning?.meanMs)
  .filter((value) => Number.isFinite(value));
const aggressiveMeans = successfulRuns
  .map((run) => run.metrics.aggressiveTuning?.meanMs)
  .filter((value) => Number.isFinite(value));

result.aggregated.medianSpeedupFactor = median(speedups);
result.aggregated.medianDefaultMeanMs = median(defaultMeans);
result.aggregated.medianAggressiveMeanMs = median(aggressiveMeans);

result.ok =
  successfulRuns.length > 0 &&
  Number.isFinite(result.aggregated.medianSpeedupFactor) &&
  Number.isFinite(result.aggregated.medianDefaultMeanMs) &&
  Number.isFinite(result.aggregated.medianAggressiveMeanMs);

if (!result.ok) {
  result.failure = {
    reason: 'no successful/parsable benchmark runs'
  };
}

await fs.mkdir(docsRoot, { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf8');
console.log(JSON.stringify(result, null, 2));

if (!result.ok) {
  console.error('[AUDIT] phase9 failed');
  process.exitCode = 1;
}
