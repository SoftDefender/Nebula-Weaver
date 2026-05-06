import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import net from 'node:net';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const projectRoot = process.cwd();
const docsRoot = path.resolve(projectRoot, '..', 'docs', 'Nebula-Weaver');
const outputPath = path.join(docsRoot, 'audit_phase4_module_deep_checks.json');
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

const tinyPngBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAn0B9sN8Db8AAAAASUVORK5CYII=',
  'base64'
);
const textBuffer = Buffer.from('not-an-image', 'utf8');

const result = {
  generatedAt: new Date().toISOString(),
  checks: {
    home: {
      initializeCards: 0,
      ok: false
    },
    nebula: {
      queuePopulated: false,
      downloadCaptured: false,
      downloadFile: null,
      pageErrors: [],
      ok: false
    },
    modelStudio: {
      addDeleteCycles: 0,
      finalPrimitiveCount: 0,
      pageErrors: [],
      ok: false
    },
    photoCompressor: {
      nonImageRejected: false,
      compressionRan: false,
      pageErrors: [],
      ok: false
    },
    photoFramer: {
      uploadVisible: false,
      previewCanvasReady: false,
      pageErrors: [],
      ok: false
    }
  }
};

const injectedFailureEnabled =
  process.env.AUDIT_FORCE_FAIL_STEP === 'audit:phase4' ||
  process.env.AUDIT_FORCE_FAIL_PHASE4 === '1';

if (injectedFailureEnabled) {
  result.injectedFailure = {
    enabled: true,
    reason: 'Injected failure for gate validation (phase4)'
  };
}

const withServer = async (fn) => {
  const port = await allocateFreePort();
  const server = await createServer({
    root: projectRoot,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port, strictPort: true }
  });

  try {
    await server.listen();
    const url = server.resolvedUrls?.local?.[0] || `http://127.0.0.1:${port}/`;
    return await fn(url);
  } finally {
    await server.close();
  }
};

const isBenignConsoleError = (message) =>
  message.includes('net::ERR_CONNECTION_CLOSED') ||
  message.includes('net::ERR_ABORTED') ||
  message.includes('net::ERR_TIMED_OUT') ||
  message.includes('net::ERR_NAME_NOT_RESOLVED');

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

const openTool = async (page, url, index) => {
  await gotoWithRetry(page, url);
  await page.getByText('Initialize', { exact: false }).first().waitFor({ timeout: 20000 });
  const cards = await page.getByText('Initialize', { exact: false }).count();
  result.checks.home.initializeCards = cards;
  await page.getByText('Initialize', { exact: false }).nth(index).click();
};

const collectPageErrors = (page, target) => {
  page.on('pageerror', (err) => {
    target.push(err.message);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const message = msg.text();
      if (!isBenignConsoleError(message)) {
        target.push(message);
      }
    }
  });
};

const runNebulaCheck = async (browser, url) => {
  const page = await browser.newPage();
  collectPageErrors(page, result.checks.nebula.pageErrors);
  await openTool(page, url, 0);

  await page.locator('#neb-upload').setInputFiles({
    name: 'nebula.png',
    mimeType: 'image/png',
    buffer: tinyPngBuffer
  });

  await page.waitForTimeout(600);
  result.checks.nebula.queuePopulated = (await page.getByText('nebula', { exact: false }).count()) > 0;

  const downloadPromise = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
  const exportBtn = page.getByRole('button', { name: /Initialize Video Export|Finalize Render|Export/i }).first();
  await exportBtn.click();
  const download = await downloadPromise;

  if (download) {
    result.checks.nebula.downloadCaptured = true;
    result.checks.nebula.downloadFile = download.suggestedFilename();
  }

  result.checks.nebula.ok =
    result.checks.nebula.queuePopulated &&
    result.checks.nebula.pageErrors.length === 0;
  await page.close();
};

const runModelStudioCheck = async (browser, url) => {
  const page = await browser.newPage();
  collectPageErrors(page, result.checks.modelStudio.pageErrors);
  await openTool(page, url, 1);

  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: /Cube/i }).first().click();
    await page.waitForTimeout(400);

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const deleteBtn = buttons.find((btn) =>
        typeof btn.className === 'string' && btn.className.includes('hover:text-rv-danger')
      );
      if (deleteBtn) deleteBtn.click();
    });
    await page.waitForTimeout(300);
    result.checks.modelStudio.addDeleteCycles += 1;
  }

  result.checks.modelStudio.finalPrimitiveCount = await page.getByText('Primitive:', { exact: false }).count();
  result.checks.modelStudio.ok = result.checks.modelStudio.pageErrors.length === 0;
  await page.close();
};

const runPhotoCompressorCheck = async (browser, url) => {
  const page = await browser.newPage();
  collectPageErrors(page, result.checks.photoCompressor.pageErrors);
  await openTool(page, url, 2);

  await page.locator('#batch-upload').setInputFiles([
    { name: 'valid.png', mimeType: 'image/png', buffer: tinyPngBuffer },
    { name: 'invalid.txt', mimeType: 'text/plain', buffer: textBuffer }
  ]);
  await page.waitForTimeout(700);

  const hasValid = (await page.getByText('valid.png', { exact: false }).count()) > 0;
  const hasInvalid = (await page.getByText('invalid.txt', { exact: false }).count()) > 0;
  result.checks.photoCompressor.nonImageRejected = hasValid && !hasInvalid;

  await page.getByRole('button', { name: /Run Compression|Re-Process All/i }).first().click();
  await page.getByText('Re-Process All', { exact: false }).first().waitFor({ timeout: 10000 });
  result.checks.photoCompressor.compressionRan = true;
  result.checks.photoCompressor.ok =
    result.checks.photoCompressor.nonImageRejected &&
    result.checks.photoCompressor.compressionRan &&
    result.checks.photoCompressor.pageErrors.length === 0;
  await page.close();
};

const runPhotoFramerCheck = async (browser, url) => {
  const page = await browser.newPage();
  collectPageErrors(page, result.checks.photoFramer.pageErrors);
  await openTool(page, url, 3);

  await page.locator('#photo-upload').setInputFiles({
    name: 'framer.png',
    mimeType: 'image/png',
    buffer: tinyPngBuffer
  });
  await page.waitForTimeout(1000);
  result.checks.photoFramer.uploadVisible = (await page.getByText('framer.png', { exact: false }).count()) > 0;

  await page.waitForFunction(() => {
    const c = document.querySelector('canvas');
    return !!c && (c.width > 0 || c.height > 0);
  }, { timeout: 10000 });
  result.checks.photoFramer.previewCanvasReady = true;

  result.checks.photoFramer.ok =
    result.checks.photoFramer.uploadVisible &&
    result.checks.photoFramer.previewCanvasReady &&
    result.checks.photoFramer.pageErrors.length === 0;
  await page.close();
};

try {
  process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'DUMMY_AUDIT_KEY';
  await withServer(async (url) => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await gotoWithRetry(page, url);
      result.checks.home.initializeCards = await page.getByText('Initialize', { exact: false }).count();
      result.checks.home.ok = result.checks.home.initializeCards >= 4;
      await page.close();

      await runNebulaCheck(browser, url);
      await runModelStudioCheck(browser, url);
      await runPhotoCompressorCheck(browser, url);
      await runPhotoFramerCheck(browser, url);
    } finally {
      await browser.close();
    }
  });
} catch (e) {
  result.error = e instanceof Error ? e.message : String(e);
}

if (injectedFailureEnabled && !result.error) {
  result.error = 'Injected failure for gate validation (phase4)';
}

const allChecksPassed =
  Object.values(result.checks).every((check) => check.ok) && !result.error;
result.summary = {
  allChecksPassed
};

await fs.mkdir(docsRoot, { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf8');
console.log(JSON.stringify(result, null, 2));
if (result.error || !allChecksPassed) {
  console.error(
    `[AUDIT] phase4 failed: ${result.error || 'one or more checks failed'}`
  );
  process.exitCode = 1;
}
