import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import net from 'node:net';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const projectRoot = process.cwd();
const docsRoot = path.resolve(projectRoot, '..', 'docs', 'Nebula-Weaver');
const outputPath = path.join(docsRoot, 'audit_phase5_stability_stress.json');
const NAV_TIMEOUT_MS = 60000;
const MODEL_LONG_RUN_LAYER_COUNT = Number.parseInt(process.env.AUDIT_MODEL_LAYERS || '12', 10);
const MODEL_LONG_RUN_OPERATIONS = Number.parseInt(process.env.AUDIT_MODEL_OPS || '60', 10);
const MODEL_LONG_RUN_MAX_P95_MS = Number.parseInt(process.env.AUDIT_MODEL_OP_P95_MAX_MS || '1800', 10);
const MODEL_LONG_RUN_MAX_MEAN_MS = Number.parseInt(process.env.AUDIT_MODEL_OP_MEAN_MAX_MS || '900', 10);

const clampInt = (value, min, max, fallback) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
};

const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
};

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

const result = {
  generatedAt: new Date().toISOString(),
  checks: {
    nebulaExportDefault: {
      downloadFile: null,
      pageErrors: [],
      ok: false
    },
    nebulaExportNoMp4Support: {
      downloadFile: null,
      pageErrors: [],
      ok: false
    },
    nebulaCaptureFailureRecovery: {
      clickedExport: false,
      recovered: false,
      pageErrors: [],
      ok: false
    },
    modelStudioStress: {
      cycles: 0,
      finalPrimitiveCount: 0,
      heapSamples: [],
      pageErrors: [],
      ok: false
    },
    modelStudioParentingGuard: {
      parentSetBeforeDelete: false,
      cycleBlocked: false,
      danglingClearedAfterDelete: false,
      pageErrors: [],
      ok: false
    },
    modelStudioReorderActiveStability: {
      activeBeforeMove: null,
      activeAfterMove: null,
      preserved: false,
      pageErrors: [],
      ok: false
    },
    modelStudioLargeHierarchySnapshot: {
      initialLayerCount: 0,
      chainCreated: false,
      reorderApplied: false,
      deleteApplied: false,
      danglingCleared: false,
      snapshotConsistent: false,
      pageErrors: [],
      ok: false
    },
    modelStudioLargeHierarchyLongRun: {
      targetLayerCount: clampInt(MODEL_LONG_RUN_LAYER_COUNT, 6, 30, 12),
      targetOperations: clampInt(MODEL_LONG_RUN_OPERATIONS, 20, 200, 60),
      operationsExecuted: 0,
      meanOpMs: null,
      p95OpMs: null,
      maxOpMs: null,
      finalLayerCount: 0,
      allParentRefsValid: false,
      noSelfParent: false,
      acyclic: false,
      latencyWithinThreshold: false,
      pageErrors: [],
      ok: false
    },
    photoCompressorHeicFlow: {
      compressionRan: false,
      downloadFile: null,
      extensionMatchesBlobType: false,
      pageErrors: [],
      ok: false
    },
    photoFramerCancelFlow: {
      cancelButtonSeen: false,
      cancelWorked: false,
      pageErrors: [],
      ok: false
    }
  }
};

const injectedFailureEnabled =
  process.env.AUDIT_FORCE_FAIL_STEP === 'audit:phase5' ||
  process.env.AUDIT_FORCE_FAIL_PHASE5 === '1';

if (injectedFailureEnabled) {
  result.injectedFailure = {
    enabled: true,
    reason: 'Injected failure for gate validation (phase5)'
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

const collectPageErrors = (page, target) => {
  page.on('pageerror', (err) => target.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const message = msg.text();
      if (!isBenignConsoleError(message)) {
        target.push(message);
      }
    }
  });
};

const openTool = async (page, url, index) => {
  await gotoWithRetry(page, url);
  await page.getByText('Initialize', { exact: false }).first().waitFor({ timeout: 20000 });
  await page.getByText('Initialize', { exact: false }).nth(index).click();
};

const runNebulaExportScenario = async (browser, url, patchNoMp4, target) => {
  const context = await browser.newContext();
  if (patchNoMp4) {
    await context.addInitScript(() => {
      const original = window.MediaRecorder;
      if (!original) return;
      const fn = original.isTypeSupported.bind(original);
      original.isTypeSupported = (mimeType) => {
        if (mimeType.includes('video/mp4')) return false;
        return fn(mimeType);
      };
    });
  }

  const page = await context.newPage();
  collectPageErrors(page, target.pageErrors);

  await openTool(page, url, 0);
  await page.locator('#neb-upload').setInputFiles({
    name: 'nebula.png',
    mimeType: 'image/png',
    buffer: tinyPngBuffer
  });

  await page.waitForTimeout(600);
  const downloadPromise = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
  const exportBtn = page.getByRole('button', { name: /Initialize Video Export|Finalize Render|Export/i }).first();
  await exportBtn.click();
  const download = await downloadPromise;

  if (download) {
    target.downloadFile = download.suggestedFilename();
  }

  target.ok = target.pageErrors.length === 0 && !!target.downloadFile;
  await context.close();
};

const runNebulaCaptureFailureRecoveryScenario = async (browser, url) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.captureStream;
    Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', {
      configurable: true,
      writable: true,
      value: function captureStreamShim() {
        return {
          active: false,
          getTracks() {
            return [];
          }
        };
      }
    });
    (window).__originalCaptureStream = original;
  });

  const page = await context.newPage();
  collectPageErrors(page, result.checks.nebulaCaptureFailureRecovery.pageErrors);
  await openTool(page, url, 0);
  await page.locator('#neb-upload').setInputFiles({
    name: 'nebula.png',
    mimeType: 'image/png',
    buffer: tinyPngBuffer
  });
  await page.waitForTimeout(600);

  const exportBtn = page.getByRole('button', { name: /Initialize Video Export|Finalize Render|Export/i }).first();
  await exportBtn.click();
  result.checks.nebulaCaptureFailureRecovery.clickedExport = true;

  await page.waitForFunction(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.some((btn) => {
      const text = btn.textContent || '';
      return /Initialize Video Export|Finalize Render|Export/i.test(text) && !btn.disabled;
    });
  }, { timeout: 10000 });

  result.checks.nebulaCaptureFailureRecovery.recovered = true;
  result.checks.nebulaCaptureFailureRecovery.pageErrors =
    result.checks.nebulaCaptureFailureRecovery.pageErrors.filter(
      (msg) => !msg.includes('Stream failed to initialize or has no tracks.')
    );
  result.checks.nebulaCaptureFailureRecovery.ok =
    result.checks.nebulaCaptureFailureRecovery.clickedExport &&
    result.checks.nebulaCaptureFailureRecovery.recovered &&
    result.checks.nebulaCaptureFailureRecovery.pageErrors.length === 0;

  await context.close();
};

const runModelStress = async (browser, url) => {
  const page = await browser.newPage();
  collectPageErrors(page, result.checks.modelStudioStress.pageErrors);
  await openTool(page, url, 1);

  for (let i = 0; i < 30; i++) {
    await page.getByRole('button', { name: /Cube/i }).first().click();
    await page.waitForTimeout(120);
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const deleteBtn = buttons.find((btn) =>
        typeof btn.className === 'string' && btn.className.includes('hover:text-rv-danger')
      );
      if (deleteBtn) deleteBtn.click();
    });
    await page.waitForTimeout(80);
    result.checks.modelStudioStress.cycles += 1;

    if (i % 5 === 0) {
      const used = await page.evaluate(() => {
        const mem = performance.memory;
        return mem ? mem.usedJSHeapSize : null;
      });
      result.checks.modelStudioStress.heapSamples.push(used);
    }
  }

  result.checks.modelStudioStress.finalPrimitiveCount =
    await page.getByText('Primitive:', { exact: false }).count();
  result.checks.modelStudioStress.ok =
    result.checks.modelStudioStress.pageErrors.length === 0 &&
    result.checks.modelStudioStress.finalPrimitiveCount === 0;
  await page.close();
};

const runModelParentingGuard = async (browser, url) => {
  const page = await browser.newPage();
  collectPageErrors(page, result.checks.modelStudioParentingGuard.pageErrors);
  await openTool(page, url, 1);

  await page.getByRole('button', { name: /Cube/i }).first().click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: /Cube/i }).first().click();
  await page.waitForTimeout(300);

  await page.getByRole('button', { name: /GO PRO|PRO UNLOCKED/i }).click();
  await page.waitForTimeout(250);

  const layerLabels = page.getByText('Primitive: cube', { exact: false });
  await layerLabels.nth(1).click();

  const parentBinding = await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select'));
    const parentSelect = selects.find((sel) =>
      Array.from(sel.options).some((opt) => (opt.textContent || '').trim() === 'None')
    );
    if (!parentSelect) return { ok: false };
    const candidate = Array.from(parentSelect.options).find((opt) => opt.value);
    if (!candidate) return { ok: false };
    parentSelect.value = candidate.value;
    parentSelect.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: candidate.value };
  });
  await page.waitForTimeout(250);

  result.checks.modelStudioParentingGuard.parentSetBeforeDelete = await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select'));
    const parentSelect = selects.find((sel) =>
      Array.from(sel.options).some((opt) => (opt.textContent || '').trim() === 'None')
    );
    return !!parentSelect && !!parentSelect.value;
  });

  await layerLabels.nth(0).click();
  await page.waitForTimeout(250);
  const cycleBlocked = await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select'));
    const parentSelect = selects.find((sel) =>
      Array.from(sel.options).some((opt) => (opt.textContent || '').trim() === 'None')
    );
    if (!parentSelect) return false;
    const candidate = Array.from(parentSelect.options).find((opt) => opt.value);
    if (!candidate) return false;
    parentSelect.value = candidate.value;
    parentSelect.dispatchEvent(new Event('change', { bubbles: true }));
    return parentSelect.value === '';
  });
  result.checks.modelStudioParentingGuard.cycleBlocked = cycleBlocked;

  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const deleteBtn = buttons.find((btn) =>
      typeof btn.className === 'string' && btn.className.includes('hover:text-rv-danger')
    );
    if (deleteBtn) deleteBtn.click();
  });
  await page.waitForTimeout(300);
  await page.getByText('Primitive: cube', { exact: false }).first().click();

  result.checks.modelStudioParentingGuard.danglingClearedAfterDelete = await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select'));
    const parentSelect = selects.find((sel) =>
      Array.from(sel.options).some((opt) => (opt.textContent || '').trim() === 'None')
    );
    return !!parentSelect && parentSelect.value === '';
  });

  result.checks.modelStudioParentingGuard.ok =
    !!parentBinding.ok &&
    result.checks.modelStudioParentingGuard.parentSetBeforeDelete &&
    result.checks.modelStudioParentingGuard.cycleBlocked &&
    result.checks.modelStudioParentingGuard.danglingClearedAfterDelete &&
    result.checks.modelStudioParentingGuard.pageErrors.length === 0;

  await page.close();
};

const runModelReorderActiveStability = async (browser, url) => {
  const page = await browser.newPage();
  collectPageErrors(page, result.checks.modelStudioReorderActiveStability.pageErrors);
  await openTool(page, url, 1);

  for (let i = 0; i < 3; i += 1) {
    await page.getByRole('button', { name: /Cube/i }).first().click();
    await page.waitForTimeout(220);
  }

  await page.locator('[data-testid="layer-row-0"]').click();
  await page.waitForTimeout(250);

  const getActiveIndex = async () =>
    page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('[data-testid^="layer-row-"]'));
      return rows.findIndex((row) =>
        typeof row.className === 'string' && row.className.includes('bg-rv-accent/10')
      );
    });

  result.checks.modelStudioReorderActiveStability.activeBeforeMove = await getActiveIndex();
  await page.locator('[data-testid="layer-move-up-2"]').click();
  await page.waitForTimeout(250);
  result.checks.modelStudioReorderActiveStability.activeAfterMove = await getActiveIndex();
  result.checks.modelStudioReorderActiveStability.preserved =
    result.checks.modelStudioReorderActiveStability.activeBeforeMove === 0 &&
    result.checks.modelStudioReorderActiveStability.activeAfterMove === 0;
  result.checks.modelStudioReorderActiveStability.ok =
    result.checks.modelStudioReorderActiveStability.preserved &&
    result.checks.modelStudioReorderActiveStability.pageErrors.length === 0;

  await page.close();
};

const getLayerRowIds = async (page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="layer-row-"]'))
      .map((row) => row.getAttribute('data-layer-id'))
      .filter(Boolean)
  );

const selectLayerAndGetParent = async (page, layerId) => {
  const row = page.locator(`[data-testid^="layer-row-"][data-layer-id="${layerId}"]`).first();
  if ((await row.count()) === 0) return null;
  await row.click();
  await page.waitForTimeout(120);
  return page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select'));
    const parentSelect = selects.find((sel) =>
      Array.from(sel.options).some((opt) => (opt.textContent || '').trim() === 'None')
    );
    return parentSelect ? parentSelect.value || null : null;
  });
};

const bindParent = async (page, childId, parentId) => {
  const row = page.locator(`[data-testid^="layer-row-"][data-layer-id="${childId}"]`).first();
  if ((await row.count()) === 0) return false;
  await row.click();
  await page.waitForTimeout(120);
  return page.evaluate(
    ({ nextParentId }) => {
      const selects = Array.from(document.querySelectorAll('select'));
      const parentSelect = selects.find((sel) =>
        Array.from(sel.options).some((opt) => (opt.textContent || '').trim() === 'None')
      );
      if (!parentSelect) return false;
      const targetOpt = Array.from(parentSelect.options).find((opt) => opt.value === nextParentId);
      if (!targetOpt) return false;
      parentSelect.value = targetOpt.value;
      parentSelect.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    { nextParentId: parentId }
  );
};

const moveLayerUpById = async (page, layerId) =>
  page.evaluate(({ targetLayerId }) => {
    const row = document.querySelector(`[data-testid^="layer-row-"][data-layer-id="${targetLayerId}"]`);
    if (!row) return false;
    const moveButtons = Array.from(
      row.querySelectorAll(`button[data-layer-id="${targetLayerId}"]`)
    );
    if (moveButtons.length < 2) return false;
    moveButtons[0].click();
    return true;
  }, { targetLayerId: layerId });

const deleteLayerById = async (page, layerId) =>
  page.evaluate(({ targetLayerId }) => {
    const row = document.querySelector(`[data-testid^="layer-row-"][data-layer-id="${targetLayerId}"]`);
    if (!row) return false;
    const buttons = Array.from(row.querySelectorAll('button'));
    const deleteBtn = buttons.find(
      (btn) => typeof btn.className === 'string' && btn.className.includes('hover:text-rv-danger')
    );
    if (!deleteBtn) return false;
    deleteBtn.click();
    return true;
  }, { targetLayerId: layerId });

const hasParentCycle = (parentMap) => {
  const visit = (startId) => {
    const seen = new Set();
    let cursor = startId;
    while (cursor) {
      if (seen.has(cursor)) return true;
      seen.add(cursor);
      cursor = parentMap[cursor] || null;
    }
    return false;
  };

  return Object.keys(parentMap).some((id) => visit(id));
};

const runModelLargeHierarchyLongRun = async (browser, url) => {
  const check = result.checks.modelStudioLargeHierarchyLongRun;
  const page = await browser.newPage();
  collectPageErrors(page, check.pageErrors);
  await openTool(page, url, 1);

  for (let i = 0; i < check.targetLayerCount; i += 1) {
    await page.getByRole('button', { name: /Cube/i }).first().click();
    await page.waitForTimeout(160);
  }

  await page.getByRole('button', { name: /GO PRO|PRO UNLOCKED/i }).click();
  await page.waitForTimeout(250);

  let layerIds = await getLayerRowIds(page);
  for (let i = 1; i < layerIds.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await bindParent(page, layerIds[i], layerIds[i - 1]);
  }
  await page.waitForTimeout(240);

  const opDurations = [];
  for (let op = 0; op < check.targetOperations; op += 1) {
    const started = Date.now();
    layerIds = await getLayerRowIds(page);
    if (layerIds.length < 2) break;

    const mode = op % 3;
    if (mode === 0) {
      const targetId = layerIds[layerIds.length - 1];
      // eslint-disable-next-line no-await-in-loop
      await moveLayerUpById(page, targetId);
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(120);
    } else if (mode === 1) {
      const idx = (op % (layerIds.length - 1)) + 1;
      const childId = layerIds[idx];
      const parentId = layerIds[idx - 1];
      // eslint-disable-next-line no-await-in-loop
      await bindParent(page, childId, parentId);
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(120);
    } else {
      const deleteIndex = Math.max(1, Math.floor(layerIds.length / 2));
      const deleteId = layerIds[deleteIndex];
      // eslint-disable-next-line no-await-in-loop
      await deleteLayerById(page, deleteId);
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(180);
      // eslint-disable-next-line no-await-in-loop
      await page.getByRole('button', { name: /Cube/i }).first().click();
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(180);
    }

    opDurations.push(Date.now() - started);
    check.operationsExecuted += 1;
  }

  const mean =
    opDurations.length > 0
      ? Number((opDurations.reduce((sum, v) => sum + v, 0) / opDurations.length).toFixed(2))
      : null;
  const p95 = opDurations.length > 0 ? Number(percentile(opDurations, 0.95).toFixed(2)) : null;
  const max = opDurations.length > 0 ? Number(Math.max(...opDurations).toFixed(2)) : null;

  check.meanOpMs = mean;
  check.p95OpMs = p95;
  check.maxOpMs = max;

  const finalIds = await getLayerRowIds(page);
  check.finalLayerCount = finalIds.length;

  const parentMap = {};
  for (const id of finalIds) {
    // eslint-disable-next-line no-await-in-loop
    parentMap[id] = await selectLayerAndGetParent(page, id);
  }

  const idSet = new Set(finalIds);
  check.allParentRefsValid = Object.values(parentMap).every(
    (parentId) => parentId === null || idSet.has(parentId)
  );
  check.noSelfParent = finalIds.every((id) => parentMap[id] !== id);
  check.acyclic = !hasParentCycle(parentMap);
  check.latencyWithinThreshold =
    check.meanOpMs !== null &&
    check.p95OpMs !== null &&
    check.meanOpMs <= MODEL_LONG_RUN_MAX_MEAN_MS &&
    check.p95OpMs <= MODEL_LONG_RUN_MAX_P95_MS;

  check.ok =
    check.operationsExecuted >= check.targetOperations &&
    check.finalLayerCount >= 2 &&
    check.allParentRefsValid &&
    check.noSelfParent &&
    check.acyclic &&
    check.latencyWithinThreshold &&
    check.pageErrors.length === 0;

  await page.close();
};

const runModelLargeHierarchySnapshot = async (browser, url) => {
  const page = await browser.newPage();
  collectPageErrors(page, result.checks.modelStudioLargeHierarchySnapshot.pageErrors);
  await openTool(page, url, 1);

  for (let i = 0; i < 5; i += 1) {
    await page.getByRole('button', { name: /Cube/i }).first().click();
    await page.waitForTimeout(220);
  }

  await page.getByRole('button', { name: /GO PRO|PRO UNLOCKED/i }).click();
  await page.waitForTimeout(250);

  const initialIds = await getLayerRowIds(page);
  result.checks.modelStudioLargeHierarchySnapshot.initialLayerCount = initialIds.length;

  const parentMapBefore = {};
  let chainOk = initialIds.length >= 5;
  if (chainOk) {
    for (let i = 1; i < initialIds.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const bound = await bindParent(page, initialIds[i], initialIds[i - 1]);
      chainOk = chainOk && bound;
    }
  }
  await page.waitForTimeout(250);

  for (const id of initialIds) {
    // eslint-disable-next-line no-await-in-loop
    parentMapBefore[id] = await selectLayerAndGetParent(page, id);
  }
  result.checks.modelStudioLargeHierarchySnapshot.chainCreated =
    chainOk &&
    initialIds.slice(1).every((id, idx) => parentMapBefore[id] === initialIds[idx]);

  const movedLayerId = initialIds[initialIds.length - 1];
  const beforeMoveOrder = [...initialIds];
  const moved = await moveLayerUpById(page, movedLayerId);
  await page.waitForTimeout(250);
  const afterMoveOrder = await getLayerRowIds(page);
  result.checks.modelStudioLargeHierarchySnapshot.reorderApplied =
    moved && JSON.stringify(beforeMoveOrder) !== JSON.stringify(afterMoveOrder);

  const deleteTarget = initialIds[2];
  const deleted = await deleteLayerById(page, deleteTarget);
  await page.waitForTimeout(250);
  const remaining = await getLayerRowIds(page);
  result.checks.modelStudioLargeHierarchySnapshot.deleteApplied =
    deleted && !remaining.includes(deleteTarget) && remaining.length === initialIds.length - 1;

  const parentMapAfter = {};
  for (const id of remaining) {
    // eslint-disable-next-line no-await-in-loop
    parentMapAfter[id] = await selectLayerAndGetParent(page, id);
  }
  result.checks.modelStudioLargeHierarchySnapshot.danglingCleared =
    Object.values(parentMapAfter).every((parentId) => parentId !== deleteTarget);

  result.checks.modelStudioLargeHierarchySnapshot.snapshotConsistent =
    result.checks.modelStudioLargeHierarchySnapshot.chainCreated &&
    result.checks.modelStudioLargeHierarchySnapshot.reorderApplied &&
    result.checks.modelStudioLargeHierarchySnapshot.deleteApplied &&
    result.checks.modelStudioLargeHierarchySnapshot.danglingCleared;

  result.checks.modelStudioLargeHierarchySnapshot.ok =
    result.checks.modelStudioLargeHierarchySnapshot.snapshotConsistent &&
    result.checks.modelStudioLargeHierarchySnapshot.pageErrors.length === 0;

  await page.close();
};

const runCompressorHeicFlow = async (browser, url) => {
  const page = await browser.newPage();
  collectPageErrors(page, result.checks.photoCompressorHeicFlow.pageErrors);
  await openTool(page, url, 2);

  await page.locator('#batch-upload').setInputFiles({
    name: 'astro.heic',
    mimeType: 'image/heic',
    buffer: tinyPngBuffer
  });
  await page.waitForTimeout(500);

  await page.getByRole('button', { name: /Run Compression|Re-Process All/i }).first().click();
  await page.getByText('Re-Process All', { exact: false }).first().waitFor({ timeout: 10000 });
  result.checks.photoCompressorHeicFlow.compressionRan = true;

  const downloadPromise = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await page.getByRole('button', { name: /Save Optimized/i }).click();
  const download = await downloadPromise;
  if (download) {
    result.checks.photoCompressorHeicFlow.downloadFile = download.suggestedFilename();
    result.checks.photoCompressorHeicFlow.extensionMatchesBlobType =
      download.suggestedFilename().endsWith('.jpeg') ||
      download.suggestedFilename().endsWith('.jpg');
  }

  result.checks.photoCompressorHeicFlow.ok =
    result.checks.photoCompressorHeicFlow.compressionRan &&
    result.checks.photoCompressorHeicFlow.extensionMatchesBlobType &&
    result.checks.photoCompressorHeicFlow.pageErrors.length === 0;
  await page.close();
};

const runFramerCancelFlow = async (browser, url) => {
  const page = await browser.newPage();
  collectPageErrors(page, result.checks.photoFramerCancelFlow.pageErrors);
  await openTool(page, url, 3);

  await page.locator('#photo-upload').setInputFiles([
    { name: 'f1.png', mimeType: 'image/png', buffer: tinyPngBuffer },
    { name: 'f2.png', mimeType: 'image/png', buffer: tinyPngBuffer },
    { name: 'f3.png', mimeType: 'image/png', buffer: tinyPngBuffer }
  ]);
  await page.waitForTimeout(600);

  await page.getByRole('button', { name: /Download All/i }).click();
  const cancelBtn = page.getByRole('button', { name: /Cancel/i });
  await cancelBtn.waitFor({ timeout: 5000 });
  result.checks.photoFramerCancelFlow.cancelButtonSeen = true;
  await cancelBtn.click();
  await page.waitForTimeout(600);

  const stillVisible = await cancelBtn.isVisible().catch(() => false);
  result.checks.photoFramerCancelFlow.cancelWorked = !stillVisible;
  result.checks.photoFramerCancelFlow.ok =
    result.checks.photoFramerCancelFlow.cancelButtonSeen &&
    result.checks.photoFramerCancelFlow.cancelWorked &&
    result.checks.photoFramerCancelFlow.pageErrors.length === 0;
  await page.close();
};

try {
  process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'DUMMY_AUDIT_KEY';
  await withServer(async (url) => {
    const browser = await chromium.launch({ headless: true });
    try {
      await runNebulaExportScenario(browser, url, false, result.checks.nebulaExportDefault);
      await runNebulaExportScenario(browser, url, true, result.checks.nebulaExportNoMp4Support);
      await runNebulaCaptureFailureRecoveryScenario(browser, url);
      await runModelStress(browser, url);
      await runModelParentingGuard(browser, url);
      await runModelReorderActiveStability(browser, url);
      await runModelLargeHierarchySnapshot(browser, url);
      await runModelLargeHierarchyLongRun(browser, url);
      await runCompressorHeicFlow(browser, url);
      await runFramerCancelFlow(browser, url);
    } finally {
      await browser.close();
    }
  });
} catch (e) {
  result.error = e instanceof Error ? e.message : String(e);
}

if (injectedFailureEnabled && !result.error) {
  result.error = 'Injected failure for gate validation (phase5)';
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
    `[AUDIT] phase5 failed: ${result.error || 'one or more checks failed'}`
  );
  process.exitCode = 1;
}
