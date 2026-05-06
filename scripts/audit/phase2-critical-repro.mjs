import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import net from 'node:net';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const projectRoot = process.cwd();
const docsRoot = path.resolve(projectRoot, '..', 'docs', 'Nebula-Weaver');
const outputPath = path.join(docsRoot, 'audit_phase2_repro_result.json');
const NAV_TIMEOUT_MS = 60000;

const allocateFreePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((closeErr) => {
        if (closeErr) reject(closeErr);
        else if (!port) reject(new Error('Failed to allocate free port'));
        else resolve(port);
      });
    });
  });

const result = {
  generatedAt: new Date().toISOString(),
  projectRoot,
  checks: {
    p0_boot_without_gemini_key: {
      bootFailed: false,
      pageErrors: [],
      detail: ''
    },
    p2_empty_queue_canvas_click: {
      reproduced: false,
      pageErrors: [],
      consoleErrors: [],
      detail: '',
      normalClickBlockedByOverlay: false,
      forcedClickReproduced: false
    },
    p1_export_extension_risk: {
      fixedMp4Filename: false,
      mediaRecorderSupport: null,
      riskLikely: false
    },
    p3_delete_layer_cleanup_gap: {
      hasDeleteLayerBlock: false,
      deleteLayerHasDispose: false,
      deleteLayerHasRevokeObjectURL: false,
      deleteLayerCallsCleanupHelper: false,
      cleanupHelperHasDispose: false,
      cleanupHelperHasRevokeObjectURL: false,
      riskConfirmed: false
    }
  }
};

const injectedFailureEnabled =
  process.env.AUDIT_FORCE_FAIL_STEP === 'audit:phase2' ||
  process.env.AUDIT_FORCE_FAIL_PHASE2 === '1';

if (injectedFailureEnabled) {
  result.injectedFailure = {
    enabled: true,
    reason: 'Injected failure for gate validation (phase2)'
  };
}

const readSource = async (filename) => {
  const fullPath = path.join(projectRoot, filename);
  return fs.readFile(fullPath, 'utf8');
};

const checkP3Static = async () => {
  const src = await readSource(path.join('components', 'ModelStudioTool.tsx'));
  const start = src.indexOf('const deleteLayer = (id: string) => {');
  const end = src.indexOf('const toggleVisibility = (id: string) => {');
  if (start === -1 || end === -1 || end <= start) {
    return;
  }

  const block = src.slice(start, end);
  const helperStart = src.indexOf('const disposeLayerResources = (layer: ModelStudioItem) => {');
  const helperEnd = src.indexOf('// Actions');
  const helperBlock =
    helperStart !== -1 && helperEnd !== -1 && helperEnd > helperStart
      ? src.slice(helperStart, helperEnd)
      : '';

  result.checks.p3_delete_layer_cleanup_gap.hasDeleteLayerBlock = true;
  result.checks.p3_delete_layer_cleanup_gap.deleteLayerHasDispose =
    block.includes('.dispose(') || block.includes('.dispose();');
  result.checks.p3_delete_layer_cleanup_gap.deleteLayerHasRevokeObjectURL =
    block.includes('URL.revokeObjectURL(');
  result.checks.p3_delete_layer_cleanup_gap.deleteLayerCallsCleanupHelper =
    block.includes('disposeLayerResources(');
  result.checks.p3_delete_layer_cleanup_gap.cleanupHelperHasDispose =
    helperBlock.includes('.geometry.dispose') || helperBlock.includes('.dispose(');
  result.checks.p3_delete_layer_cleanup_gap.cleanupHelperHasRevokeObjectURL =
    helperBlock.includes('URL.revokeObjectURL(');
  result.checks.p3_delete_layer_cleanup_gap.riskConfirmed =
    !(
      (
        result.checks.p3_delete_layer_cleanup_gap.deleteLayerHasDispose &&
        result.checks.p3_delete_layer_cleanup_gap.deleteLayerHasRevokeObjectURL
      ) ||
      (
        result.checks.p3_delete_layer_cleanup_gap.deleteLayerCallsCleanupHelper &&
        result.checks.p3_delete_layer_cleanup_gap.cleanupHelperHasDispose &&
        result.checks.p3_delete_layer_cleanup_gap.cleanupHelperHasRevokeObjectURL
      )
    );
};

const checkP1Static = async () => {
  const appSrc = await readSource('App.tsx');
  result.checks.p1_export_extension_risk.fixedMp4Filename =
    appSrc.includes('_nebula.mp4');
};

const withServer = async (port, fn) => {
  const server = await createServer({
    root: projectRoot,
    logLevel: 'silent',
    server: {
      host: '127.0.0.1',
      port,
      strictPort: true
    }
  });

  try {
    await server.listen();
    const url = server.resolvedUrls?.local?.[0] || `http://127.0.0.1:${port}/`;
    return await fn(url);
  } finally {
    await server.close();
  }
};

const gotoWithRetry = async (page, url, attempts = 3) => {
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
      return;
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        await page.waitForTimeout(1200);
      }
    }
  }
  throw lastError;
};

const runBootCheckWithoutKey = async () => {
  const prevGemini = process.env.GEMINI_API_KEY;
  const prevApi = process.env.API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.API_KEY;

  try {
    const port = await allocateFreePort();
    await withServer(port, async (url) => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const pageErrors = [];
        const consoleErrors = [];

        page.on('pageerror', (err) => {
          pageErrors.push(err.message);
        });
        page.on('console', (msg) => {
          if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
          }
        });

        await gotoWithRetry(page, url);
        await page.waitForTimeout(3000);

        const hasBootError = pageErrors.some((m) =>
          m.includes('An API Key must be set when running in a browser')
        );

        result.checks.p0_boot_without_gemini_key.pageErrors = pageErrors;
        result.checks.p0_boot_without_gemini_key.bootFailed = hasBootError;
        result.checks.p0_boot_without_gemini_key.detail = hasBootError
          ? 'App throws key-required error during boot when GEMINI_API_KEY is missing.'
          : 'No key-related boot error captured in this run.';
      } finally {
        await browser.close();
      }
    });
  } finally {
    if (prevGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prevGemini;

    if (prevApi === undefined) delete process.env.API_KEY;
    else process.env.API_KEY = prevApi;
  }
};

const runInteractiveChecksWithDummyKey = async () => {
  const prevGemini = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = prevGemini || 'DUMMY_AUDIT_KEY';

  try {
    const port = await allocateFreePort();
    await withServer(port, async (url) => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const pageErrors = [];
        const consoleErrors = [];

        page.on('pageerror', (err) => {
          pageErrors.push(err.message);
        });
        page.on('console', (msg) => {
          if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
          }
        });

        await gotoWithRetry(page, url);
        await page.getByText('Initialize', { exact: false }).first().waitFor({ timeout: 20000 });
        await page.getByText('Initialize', { exact: false }).first().click();
        await page.locator('canvas').first().waitFor({ timeout: 5000 });

        // Normal click may be blocked by the empty-state overlay.
        try {
          await page.locator('canvas').first().click({ position: { x: 12, y: 12 }, timeout: 2000 });
        } catch (e) {
          result.checks.p2_empty_queue_canvas_click.normalClickBlockedByOverlay = true;
        }
        await page.waitForTimeout(200);

        const support = await page.evaluate(() => {
          if (typeof MediaRecorder === 'undefined') {
            return {
              available: false,
              mp4: null,
              mp4H264: null,
              webmVp9: null,
              matroska: null
            };
          }
          return {
            available: true,
            mp4: MediaRecorder.isTypeSupported('video/mp4'),
            mp4H264: MediaRecorder.isTypeSupported('video/mp4;codecs=h264,aac'),
            webmVp9: MediaRecorder.isTypeSupported('video/webm;codecs=vp9'),
            matroska: MediaRecorder.isTypeSupported('video/x-matroska')
          };
        });

        result.checks.p2_empty_queue_canvas_click.pageErrors = pageErrors;
        result.checks.p2_empty_queue_canvas_click.consoleErrors = consoleErrors;
        result.checks.p2_empty_queue_canvas_click.reproduced = pageErrors.some((m) =>
          m.includes('Cannot set properties of undefined')
        );
        // Force click to evaluate latent handler safety even when overlay blocks normal pointer.
        await page.locator('canvas').first().click({
          position: { x: 12, y: 12 },
          force: true
        });
        await page.waitForTimeout(200);

        result.checks.p2_empty_queue_canvas_click.forcedClickReproduced = pageErrors.some((m) =>
          m.includes('Cannot set properties of undefined')
        ) || consoleErrors.some((m) => m.includes('Cannot set properties of undefined'));
        result.checks.p2_empty_queue_canvas_click.reproduced =
          result.checks.p2_empty_queue_canvas_click.forcedClickReproduced;
        result.checks.p2_empty_queue_canvas_click.detail =
          result.checks.p2_empty_queue_canvas_click.reproduced
            ? 'Forced canvas click triggers undefined property error in onSetZoomOrigin path.'
            : 'No matching error captured in this run.';

        result.checks.p1_export_extension_risk.mediaRecorderSupport = support;
        result.checks.p1_export_extension_risk.riskLikely =
          result.checks.p1_export_extension_risk.fixedMp4Filename &&
          support.available === true &&
          support.mp4 === false &&
          support.mp4H264 === false &&
          support.webmVp9 === true;
      } finally {
        await browser.close();
      }
    });
  } finally {
    if (prevGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prevGemini;
  }
};

try {
  await checkP1Static();
  await checkP3Static();
  await runBootCheckWithoutKey();
  await runInteractiveChecksWithDummyKey();
} catch (err) {
  result.error = err instanceof Error ? err.message : String(err);
}

if (injectedFailureEnabled && !result.error) {
  result.error = 'Injected failure for gate validation (phase2)';
}

const allChecksPassed =
  !result.checks.p0_boot_without_gemini_key.bootFailed &&
  !result.checks.p2_empty_queue_canvas_click.reproduced &&
  !result.checks.p1_export_extension_risk.riskLikely &&
  !result.checks.p3_delete_layer_cleanup_gap.riskConfirmed &&
  !result.error;

result.summary = {
  allChecksPassed
};

await fs.mkdir(docsRoot, { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf8');

console.log(JSON.stringify(result, null, 2));
if (result.error || !allChecksPassed) {
  console.error(
    `[AUDIT] phase2 failed: ${result.error || 'one or more checks failed'}`
  );
  process.exitCode = 1;
}
