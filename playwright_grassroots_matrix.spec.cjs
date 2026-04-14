const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8787';

async function waitForReady(page, options = {}) {
  const timeout = options.timeout || 180000;
  const allowEmpty = Boolean(options.allowEmpty);
  await page.waitForFunction((allowNoRows) => {
    const status = (document.getElementById('statusPill')?.textContent || '').toLowerCase();
    const searchInput = document.getElementById('searchInput');
    const rows = document.querySelectorAll('#statsTableBody tr');
    return searchInput
      && !searchInput.disabled
      && !status.includes('failed')
      && !status.includes('loading')
      && (allowNoRows || rows.length > 0);
  }, allowEmpty, { timeout });
}

async function waitForRowsSettled(page, options = {}) {
  const allowEmpty = Boolean(options.allowEmpty);
  await page.waitForFunction((allowNoRows) => {
    const rows = document.querySelectorAll('#statsTableBody tr');
    const input = document.getElementById('searchInput');
    return input && !input.disabled && (allowNoRows || rows.length > 0);
  }, allowEmpty, { timeout: options.timeout || 180000 });
  await page.waitForTimeout(options.delay || 250);
}

async function installResponsivenessProbe(page) {
  await page.evaluate(() => {
    if (window.__RESPONSIVENESS_PROBE__?.timer) {
      clearInterval(window.__RESPONSIVENESS_PROBE__.timer);
    }
    const probe = {
      last: performance.now(),
      maxGap: 0,
      ticks: 0,
      timer: 0,
    };
    probe.timer = setInterval(() => {
      const now = performance.now();
      probe.maxGap = Math.max(probe.maxGap, now - probe.last);
      probe.last = now;
      probe.ticks += 1;
    }, 100);
    window.__RESPONSIVENESS_PROBE__ = probe;
  });
}

async function getResponsivenessProbe(page) {
  return page.evaluate(() => {
    const probe = window.__RESPONSIVENESS_PROBE__ || {};
    return {
      maxGap: Number(probe.maxGap) || 0,
      ticks: Number(probe.ticks) || 0,
    };
  });
}

async function expectMainThreadStayedResponsive(page, maxGapMs = 3000) {
  let probe = await getResponsivenessProbe(page);
  if (!probe.ticks) {
    await page.waitForTimeout(150);
    probe = await getResponsivenessProbe(page);
  }
  expect(probe.ticks).toBeGreaterThan(0);
  expect(probe.maxGap).toBeLessThan(maxGapMs);
}

async function searchFor(page, value, options = {}) {
  const input = page.locator('#searchInput');
  const started = Date.now();
  await input.fill(value);
  await waitForRowsSettled(page, options);
  expect(Date.now() - started).toBeLessThan(options.maxMs || 7000);
  await expect(input).toHaveValue(value);
}

function trackDataRequests(page) {
  const requests = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!/\/data\/.+\.js(?:\?|$)/i.test(url)) return;
    const normalized = url.replace(/\?.*$/, '');
    requests.push(normalized);
  });
  return {
    all: requests,
    count: () => requests.length,
    duplicateCount: () => requests.length - new Set(requests).size,
  };
}

function offScopeGrassrootsYearChunkRequests(requests, allowedYears = []) {
  const allowed = new Set(allowedYears.map(String));
  return (requests || []).filter((url) => {
    const match = url.match(/\/grassroots_year_chunks\/(\d{4})\.js$/i);
    return match && !allowed.has(match[1]);
  });
}

function grassrootsYearChunkRequests(requests) {
  return (requests || [])
    .map((url) => url.match(/\/grassroots_year_chunks\/(\d{4})\.js$/i)?.[1] || '')
    .filter(Boolean);
}

async function typeSearchOneCharacterAtATime(page, value, options = {}) {
  const input = page.locator('#searchInput');
  const perKeyMaxMs = options.perKeyMaxMs || 900;
  const maxGapMs = options.maxGapMs || 1800;
  let typed = '';
  for (const char of value) {
    typed += char;
    await installResponsivenessProbe(page);
    const started = Date.now();
    await input.fill(typed);
    await expect(input).toHaveValue(typed, { timeout: perKeyMaxMs });
    await expect(input).not.toBeDisabled();
    expect(Date.now() - started).toBeLessThan(perKeyMaxMs);
    await page.waitForTimeout(options.betweenKeysMs || 125);
    await expectMainThreadStayedResponsive(page, maxGapMs);
  }
}

async function commitRange(page, selector, value, options = {}) {
  const input = page.locator(selector).first();
  await expect(input).toBeVisible({ timeout: options.timeout || 30000 });
  await input.fill(value);
  await input.press('Tab');
  await waitForRowsSettled(page, { allowEmpty: options.allowEmpty, timeout: options.timeout || 180000 });
  await expect(input).toHaveValue(value);
}

async function setSingleFilter(page, filterId, value, options = {}) {
  const select = page.locator(`#single-${filterId}`);
  await expect(select).toBeVisible({ timeout: options.timeout || 30000 });
  await select.selectOption(value);
  await waitForRowsSettled(page, options);
  await expect(select).toHaveValue(value);
}

async function setFirstNonAllSingleFilterOption(page, filterId, options = {}) {
  const select = page.locator(`#single-${filterId}`);
  await expect(select).toBeVisible({ timeout: options.timeout || 30000 });
  const value = await select.locator('option').evaluateAll((items) => {
    const option = items.find((item) => item.value && item.value !== 'all');
    return option ? option.value : '';
  });
  if (!value) return '';
  await setSingleFilter(page, filterId, value, options);
  return value;
}

async function toggleMultiFilter(page, filterId, value, options = {}) {
  const button = page.locator(`[data-multi-filter="${filterId}"][data-multi-value="${value}"]`).first();
  await expect(button).toBeVisible({ timeout: options.timeout || 30000 });
  await button.click();
  await waitForRowsSettled(page, options);
  return button;
}

async function clickGroupCycle(page, groupId) {
  const button = page.locator(`[data-group-cycle="${groupId}"]`).first();
  await expect(button).toBeVisible({ timeout: 30000 });
  const before = await button.innerText();
  await button.click();
  await expect.poll(async () => button.innerText(), { timeout: 30000 }).not.toBe(before);
  return button;
}

async function setGrassrootsViewMode(page, mode, options = {}) {
  await page.locator(`[data-view-mode="${mode}"]`).click();
  await waitForRowsSettled(page, options);
  await expect(page.locator(`[data-view-mode="${mode}"]`)).toHaveClass(/is-active/);
}

async function selectOnlyYear(page, year) {
  const clear = page.locator('#clearYearsBtn');
  await expect(clear).toBeVisible({ timeout: 30000 });
  await clear.click();
  await waitForRowsSettled(page, { allowEmpty: true });

  const yearButton = page.locator(`[data-year="${year}"]`);
  await expect(yearButton).toBeVisible({ timeout: 30000 });
  await yearButton.click();
  await waitForRowsSettled(page, { allowEmpty: true, timeout: 180000 });
  await expect(yearButton).toHaveClass(/is-active/);
}

async function getVisibleTableRows(page) {
  return page.evaluate(() => {
    const headers = Array.from(document.querySelectorAll('#statsTable thead th')).map((th) => th.textContent.trim());
    return Array.from(document.querySelectorAll('#statsTableBody tr')).map((row) => {
      const cells = Array.from(row.querySelectorAll('td')).map((td) => td.textContent.trim());
      const record = {};
      headers.forEach((header, index) => {
        record[header] = cells[index] || '';
      });
      record.__text = row.textContent || '';
      return record;
    });
  });
}

async function expectVisibleRowsLimitedToYear(page, year, options = {}) {
  await expect.poll(async () => {
    const rows = await getVisibleTableRows(page);
    const dataRows = rows.filter((row) => !/no rows matched/i.test(row.__text));
    return (options.allowEmpty || dataRows.length > 0) && dataRows.every((row) => row.Year === year);
  }, { timeout: options.timeout || 120000 }).toBeTruthy();
}

async function expectSearchAndControlsHealthy(page, expectedSearch) {
  await expect(page.locator('#searchInput')).toHaveValue(expectedSearch);
  await expect(page.locator('#searchInput')).not.toBeDisabled();
  await expect(page.locator('[data-view-mode="player"]')).toBeVisible();
  await expect(page.locator('[data-view-mode="career"]')).toBeVisible();
  await expect(page.locator('[data-group-cycle="per_game"]').first()).toBeVisible();
  await expect(page.locator('[data-stat-min="pts_pg"]').first()).toBeEditable();
}

test('grassroots query matrix stays responsive across search, career, filters, and group buttons', async ({ page }) => {
  test.setTimeout(8 * 60 * 1000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`${BASE_URL}/#grassroots`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);

  const perGame = await clickGroupCycle(page, 'per_game');
  await expect(perGame).toContainText(/Per Game \((?:default|all|none)\)/);

  await searchFor(page, 'Austin Goosby');
  await expect(page.locator('#statsTableBody tr').first()).toContainText('Austin Goosby');

  await commitRange(page, '[data-stat-min="pts_pg"]', '10');
  await commitRange(page, '[data-demo-min="min"]', '0');
  await toggleMultiFilter(page, 'circuit', 'EYBL');
  await toggleMultiFilter(page, 'pos', 'SF', { allowEmpty: true });
  await toggleMultiFilter(page, 'pos', 'SF', { allowEmpty: true });
  await setSingleFilter(page, 'setting', 'AAU');
  await setSingleFilter(page, 'age_range', '17U', { allowEmpty: true });

  await searchFor(page, 'Austin Goosby', { allowEmpty: true });
  await setGrassrootsViewMode(page, 'career', { allowEmpty: true });
  await expect(page.locator('#searchInput')).toHaveValue('Austin Goosby');
  await expect(page.locator('#resultsSubtitle')).not.toContainText(/adding 2[0-9] years/i);

  await searchFor(page, 'Tyrese Haliburton', { allowEmpty: true, maxMs: 7000 });
  await expect(page.locator('#searchInput')).toHaveValue('Tyrese Haliburton');
  await expect(page.locator('#resultsSubtitle')).not.toContainText(/adding 2[0-9] years/i);
  await clickGroupCycle(page, 'per_game');
  await commitRange(page, '[data-stat-max="pts_pg"]', '30', { allowEmpty: true });

  await setGrassrootsViewMode(page, 'player', { allowEmpty: true });
  await expect(page.locator('#searchInput')).toHaveValue('Austin Goosby');

  expect(pageErrors).toEqual([]);
});

test('grassroots cache worker stores requested data assets for repeat visits', async ({ page }) => {
  test.setTimeout(4 * 60 * 1000);

  await page.goto(`${BASE_URL}/#grassroots`, { waitUntil: 'load' });
  await page.evaluate(() => navigator.serviceWorker ? navigator.serviceWorker.ready.then(() => true) : false);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForReady(page);

  const cached = await page.evaluate(async () => {
    const manifestUrl = new URL('data/vendor/grassroots_year_manifest.js?v=20260414-grassroots-career-v57', window.location.href).href;
    const cacheKey = new URL('data/vendor/grassroots_year_manifest.js', window.location.href).href;
    await fetch(manifestUrl);
    const match = await caches.match(cacheKey) || await caches.match(manifestUrl, { ignoreSearch: true });
    const keys = await caches.keys();
    return {
      hasManifest: Boolean(match),
      hasDataCache: keys.some((key) => key.startsWith('multi-explorer-data-')),
    };
  });

  expect(cached.hasManifest).toBeTruthy();
  expect(cached.hasDataCache).toBeTruthy();
});

test('grassroots abbreviated player search expands years without leaking into the next tab', async ({ page }) => {
  test.setTimeout(6 * 60 * 1000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`${BASE_URL}/#grassroots`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);

  await page.locator('#searchInput').fill('lebron j');
  await page.waitForFunction(() => (
    /LeBron James/i.test(Array.from(document.querySelectorAll('#statsTableBody tr')).map((row) => row.textContent || '').join('\n'))
  ), null, { timeout: 120000 });

  const grassrootsState = await page.evaluate(() => ({
    value: document.getElementById('searchInput')?.value || '',
    rows: Array.from(document.querySelectorAll('#statsTableBody tr')).slice(0, 8).map((row) => row.textContent || ''),
    summary: document.getElementById('filtersSummary')?.textContent || '',
  }));
  expect(grassrootsState.value).toBe('lebron j');
  expect(grassrootsState.rows.join('\n')).toContain('LeBron James');
  expect(grassrootsState.rows.join('\n')).not.toContain('LeBron Massey Jr.');
  expect(grassrootsState.summary).toContain('Search: lebron j');

  await Promise.all([
    page.waitForURL('**/#d1'),
    page.locator('a.league-link[data-id="d1"]').click(),
  ]);
  await waitForReady(page);
  await expect(page.locator('#searchInput')).toHaveValue('');
  await expect(page.locator('#filtersSummary')).toContainText('Search: none');

  expect(pageErrors).toEqual([]);
});

test('grassroots 2026 name search stays scoped and responsive through player career switch', async ({ page }) => {
  test.setTimeout(7 * 60 * 1000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`${BASE_URL}/#grassroots`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await selectOnlyYear(page, '2026');

  for (const query of ['crowe', 'lebron j', 'austin']) {
    await installResponsivenessProbe(page);
    await searchFor(page, query, { allowEmpty: true, maxMs: 7000 });
    await expect(page.locator('#searchInput')).toHaveValue(query);
    await expectVisibleRowsLimitedToYear(page, '2026', { allowEmpty: true });
    await page.waitForTimeout(2000);
    await expectVisibleRowsLimitedToYear(page, '2026', { allowEmpty: true });
    await expectMainThreadStayedResponsive(page);
  }

  await installResponsivenessProbe(page);
  await searchFor(page, 'crowe', { allowEmpty: true, maxMs: 7000 });
  await expectMainThreadStayedResponsive(page);
  await installResponsivenessProbe(page);
  await setGrassrootsViewMode(page, 'career', { allowEmpty: true, timeout: 180000 });
  await expect(page.locator('#searchInput')).toHaveValue('crowe');
  await expect(page.locator('[data-view-mode="career"]')).toHaveClass(/is-active/);
  await expectMainThreadStayedResponsive(page);

  expect(pageErrors).toEqual([]);
});

test('grassroots incremental Tyrese Haliburton search keeps scope controls and tabs stable', async ({ page }) => {
  test.setTimeout(8 * 60 * 1000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const dataRequests = trackDataRequests(page);

  await page.goto(`${BASE_URL}/#grassroots`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await selectOnlyYear(page, '2026');

  const beforeTypingRequestCount = dataRequests.count();
  await typeSearchOneCharacterAtATime(page, 'tyrese haliburton');
  await waitForRowsSettled(page, { allowEmpty: true, timeout: 180000 });
  const typingRequests = dataRequests.all.slice(beforeTypingRequestCount);
  expect(offScopeGrassrootsYearChunkRequests(typingRequests, ['2026'])).toEqual([]);
  await expectSearchAndControlsHealthy(page, 'tyrese haliburton');
  await expectVisibleRowsLimitedToYear(page, '2026', { allowEmpty: true });
  await page.waitForTimeout(2500);
  await expectVisibleRowsLimitedToYear(page, '2026', { allowEmpty: true });
  expect(dataRequests.duplicateCount()).toBeLessThanOrEqual(2);
  expect(dataRequests.count() - beforeTypingRequestCount).toBeLessThanOrEqual(8);

  await clickGroupCycle(page, 'per_game');
  await commitRange(page, '[data-stat-min="pts_pg"]', '5', { allowEmpty: true });
  await toggleMultiFilter(page, 'circuit', 'EYBL', { allowEmpty: true });
  await toggleMultiFilter(page, 'circuit', 'EYBL', { allowEmpty: true });
  await setSingleFilter(page, 'setting', 'AAU', { allowEmpty: true });
  await expectSearchAndControlsHealthy(page, 'tyrese haliburton');
  await expectVisibleRowsLimitedToYear(page, '2026', { allowEmpty: true });

  await installResponsivenessProbe(page);
  await setGrassrootsViewMode(page, 'career', { allowEmpty: true, timeout: 180000 });
  await expectSearchAndControlsHealthy(page, 'tyrese haliburton');
  await expectMainThreadStayedResponsive(page);
  await setGrassrootsViewMode(page, 'player', { allowEmpty: true, timeout: 180000 });
  await expectSearchAndControlsHealthy(page, 'tyrese haliburton');

  await Promise.all([
    page.waitForURL('**/#player_career'),
    page.locator('a.league-link[data-id="player_career"]').click(),
  ]);
  await waitForReady(page);
  await expect(page.locator('#searchInput')).toHaveValue('');
  await typeSearchOneCharacterAtATime(page, 'tyrese haliburton', { perKeyMaxMs: 1000, maxGapMs: 2200 });
  await waitForRowsSettled(page, { allowEmpty: true, timeout: 180000 });
  await expect(page.locator('#searchInput')).toHaveValue('tyrese haliburton');
  await expect(page.locator('#searchInput')).not.toBeDisabled();

  await Promise.all([
    page.waitForURL('**/#grassroots'),
    page.locator('a.league-link[data-id="grassroots"]').click(),
  ]);
  await waitForReady(page, { allowEmpty: true });
  await expect(page.locator('#searchInput')).toHaveValue('tyrese haliburton');
  await expectVisibleRowsLimitedToYear(page, '2026', { allowEmpty: true });

  expect(pageErrors).toEqual([]);
});

test('grassroots career all-years search defers broad prefixes and stays responsive', async ({ page }) => {
  test.setTimeout(8 * 60 * 1000);
  const pageErrors = [];
  const pageDialogs = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('dialog', async (dialog) => {
    pageDialogs.push(dialog.message());
    await dialog.dismiss().catch(() => {});
  });
  const dataRequests = trackDataRequests(page);

  await page.goto(`${BASE_URL}/#grassroots`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await setGrassrootsViewMode(page, 'career', { allowEmpty: true, timeout: 180000 });

  const beforeAllYears = dataRequests.count();
  await page.locator('#selectAllYearsBtn').click();
  await waitForRowsSettled(page, { allowEmpty: true, timeout: 180000 });
  await expect(page.locator('#searchInput')).not.toBeDisabled();
  expect(grassrootsYearChunkRequests(dataRequests.all.slice(beforeAllYears))).toEqual([]);

  const beforeCrowe = dataRequests.count();
  for (const prefix of ['c', 'cr', 'cro', 'crow']) {
    await installResponsivenessProbe(page);
    await page.locator('#searchInput').fill(prefix);
    await expect(page.locator('#searchInput')).toHaveValue(prefix, { timeout: 900 });
    await page.waitForTimeout(450);
    await expectMainThreadStayedResponsive(page, 1800);
    expect(grassrootsYearChunkRequests(dataRequests.all.slice(beforeCrowe))).toEqual([]);
  }
  await installResponsivenessProbe(page);
  await page.locator('#searchInput').fill('crowe');
  await expect(page.locator('#searchInput')).toHaveValue('crowe', { timeout: 900 });
  await page.waitForTimeout(900);
  await expectMainThreadStayedResponsive(page, 2500);
  const croweYears = grassrootsYearChunkRequests(dataRequests.all.slice(beforeCrowe));
  expect(croweYears).not.toContain('1999');
  expect(new Set(croweYears).size).toBeLessThanOrEqual(12);

  await page.locator('#searchInput').fill('');
  await page.waitForTimeout(1000);
  await waitForRowsSettled(page, { allowEmpty: true, timeout: 180000 });
  const beforeTyrese = dataRequests.count();
  await typeSearchOneCharacterAtATime(page, 'tyrese haliburton', { perKeyMaxMs: 1000, maxGapMs: 1800, betweenKeysMs: 100 });
  await page.waitForFunction(() => /Tyrese Haliburton/i.test(
    Array.from(document.querySelectorAll('#statsTableBody tr')).map((row) => row.textContent || '').join('\n')
  ), null, { timeout: 180000 });
  await waitForRowsSettled(page, { allowEmpty: false, timeout: 180000, delay: 500 });
  await expectSearchAndControlsHealthy(page, 'tyrese haliburton');
  const tyreseYears = grassrootsYearChunkRequests(dataRequests.all.slice(beforeTyrese));
  expect(tyreseYears).toContain('2018');
  expect(new Set(tyreseYears).size).toBeLessThanOrEqual(8);
  const tyreseRow = page.locator('#statsTableBody tr').filter({ hasText: 'Tyrese Haliburton' }).first();
  await expect(tyreseRow).toContainText('2018');
  await expect(tyreseRow).toContainText('Oshkosh North');
  await expect(tyreseRow).toContainText('68');

  await clickGroupCycle(page, 'per_game');
  await commitRange(page, '[data-stat-min="pts_pg"]', '5', { allowEmpty: true, timeout: 180000 });
  await setSingleFilter(page, 'status_path', 'd1', { allowEmpty: true, timeout: 180000 });
  await expectSearchAndControlsHealthy(page, 'tyrese haliburton');

  expect(pageErrors).toEqual([]);
  expect(pageDialogs).toEqual([]);
});

test('grassroots Nike circuit remap and explicit-year search avoid off-scope year loads', async ({ page }) => {
  test.setTimeout(8 * 60 * 1000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const dataRequests = trackDataRequests(page);

  await page.goto(`${BASE_URL}/#grassroots`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await selectOnlyYear(page, '2026');

  await setSingleFilter(page, 'setting', 'AAU', { allowEmpty: true });
  await expect(page.locator('[data-multi-filter="circuit"][data-multi-value="Nike Showcases"]').first()).toBeVisible();
  await expect(page.locator('[data-multi-filter="circuit"][data-multi-value="Nike Other"]')).toHaveCount(0);
  await expect(page.locator('[data-multi-filter="circuit"][data-multi-value="Nike Extravaganza"]')).toHaveCount(0);
  await expect(page.locator('[data-multi-filter="circuit"][data-multi-value="Nike Global Challenge"]')).toHaveCount(0);
  await toggleMultiFilter(page, 'circuit', 'Nike Showcases', { allowEmpty: true });
  await toggleMultiFilter(page, 'circuit', 'Nike Showcases', { allowEmpty: true });

  const beforeCroweSearch = dataRequests.count();
  await typeSearchOneCharacterAtATime(page, 'crowe', { perKeyMaxMs: 1000, maxGapMs: 2200 });
  await waitForRowsSettled(page, { allowEmpty: true, timeout: 180000 });
  await expectSearchAndControlsHealthy(page, 'crowe');
  await expectVisibleRowsLimitedToYear(page, '2026', { allowEmpty: true });
  const croweRequests = dataRequests.all.slice(beforeCroweSearch);
  expect(offScopeGrassrootsYearChunkRequests(croweRequests, ['2026'])).toEqual([]);

  await installResponsivenessProbe(page);
  await setGrassrootsViewMode(page, 'career', { allowEmpty: true, timeout: 180000 });
  await expectSearchAndControlsHealthy(page, 'crowe');
  await expectVisibleRowsLimitedToYear(page, '2026', { allowEmpty: true });
  await expectMainThreadStayedResponsive(page, 3000);
  const careerRequests = dataRequests.all.slice(beforeCroweSearch);
  expect(offScopeGrassrootsYearChunkRequests(careerRequests, ['2026'])).toEqual([]);

  expect(pageErrors).toEqual([]);
});

test('grassroots older-year load remains editable under weird filter combinations', async ({ page }) => {
  test.setTimeout(8 * 60 * 1000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const dataRequests = trackDataRequests(page);

  await page.goto(`${BASE_URL}/#grassroots`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await page.locator('#clearYearsBtn').click();
  await waitForRowsSettled(page, { allowEmpty: true });

  await installResponsivenessProbe(page);
  const beforeYearLoad = dataRequests.count();
  await page.locator('[data-year="2025"]').click();
  await page.locator('#single-setting').selectOption('AAU');
  await page.locator('#single-age_range').selectOption('17U');
  await page.locator('#searchInput').fill('austin goosby');
  await expect(page.locator('#searchInput')).toHaveValue('austin goosby', { timeout: 5000 });
  await expect(page.locator('#searchInput')).not.toBeDisabled();
  await expect.poll(() => (
    dataRequests.all.slice(beforeYearLoad).some((url) => /\/grassroots_year_chunks\/2025\.js$/i.test(url))
  ), { timeout: 180000 }).toBeTruthy();
  await page.waitForFunction(() => /Austin Goosby/i.test(
    Array.from(document.querySelectorAll('#statsTableBody tr')).map((row) => row.textContent || '').join('\n')
  ), null, { timeout: 180000 });
  await waitForRowsSettled(page, { allowEmpty: false, timeout: 180000, delay: 500 });
  await expectVisibleRowsLimitedToYear(page, '2025');
  await expectMainThreadStayedResponsive(page, 8000);

  await toggleMultiFilter(page, 'circuit', 'EYBL', { allowEmpty: true, timeout: 180000 });
  await toggleMultiFilter(page, 'circuit', 'EYBL', { allowEmpty: true, timeout: 180000 });
  await clickGroupCycle(page, 'per_game');
  await commitRange(page, '[data-stat-min="pts_pg"]', '5', { allowEmpty: true, timeout: 180000 });
  await setSingleFilter(page, 'status_path', 'd1', { allowEmpty: true, timeout: 180000 });
  await expect(page.locator('#searchInput')).toHaveValue('austin goosby');
  await expect(page.locator('#searchInput')).not.toBeDisabled();

  expect(pageErrors).toEqual([]);
});

test('nba companion loads from the optimized path with normalized percentage stats', async ({ page }) => {
  test.setTimeout(6 * 60 * 1000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`${BASE_URL}/#nba_companion`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page, { timeout: 240000 });
  await expect(page.locator('#statsTableBody tr').first()).not.toContainText('No rows matched');

  const values = await page.evaluate(() => {
    const headers = Array.from(document.querySelectorAll('#statsTable thead th')).map((th) => th.textContent.trim());
    const cells = Array.from(document.querySelectorAll('#statsTableBody tr:first-child td')).map((td) => td.textContent.trim());
    const cellFor = (label) => cells[headers.indexOf(label)] || '';
    return {
      ncaaTs: cellFor('NCAA TS%'),
      nbaTs: cellFor('NBA TS%'),
      ncaaEfg: cellFor('NCAA eFG%'),
      nbaEfg: cellFor('NBA eFG%'),
    };
  });

  for (const value of Object.values(values)) {
    expect(value).not.toMatch(/^0\.\d+/);
    expect(Number(value)).toBeGreaterThan(1);
  }

  expect(pageErrors).toEqual([]);
});

test('JUCO and NAIA stay responsive through large loads, search, filters, and groups', async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  for (const target of [
    { id: 'juco', query: 'adams', primaryFilter: 'level', secondaryFilter: 'region' },
    { id: 'naia', query: 'adams', primaryFilter: 'division', secondaryFilter: 'conference' },
  ]) {
    await page.goto(`${BASE_URL}/#${target.id}`, { waitUntil: 'domcontentloaded' });
    await installResponsivenessProbe(page);
    await waitForReady(page, { timeout: 240000 });
    await expectMainThreadStayedResponsive(page, 10000);

    await typeSearchOneCharacterAtATime(page, target.query, { perKeyMaxMs: 1400, maxGapMs: 4500 });
    await waitForRowsSettled(page, { allowEmpty: true, timeout: 180000 });
    await expect(page.locator('#searchInput')).toHaveValue(target.query);
    await expect(page.locator('#searchInput')).not.toBeDisabled();

    await commitRange(page, '[data-demo-min="min"]', '50', { allowEmpty: true, timeout: 180000 });
    await setFirstNonAllSingleFilterOption(page, target.primaryFilter, { allowEmpty: true, timeout: 180000 });
    await setFirstNonAllSingleFilterOption(page, target.secondaryFilter, { allowEmpty: true, timeout: 180000 });
    await clickGroupCycle(page, 'per_game');
    await commitRange(page, '[data-stat-min="pts_pg"]', '2', { allowEmpty: true, timeout: 180000 });
    await expect(page.locator('#searchInput')).toHaveValue(target.query);
    await expect(page.locator('#searchInput')).not.toBeDisabled();
  }

  expect(pageErrors).toEqual([]);
});

test('rapid tab switching settles on the final route without stale search state', async ({ page }) => {
  test.setTimeout(4 * 60 * 1000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`${BASE_URL}/#home`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('a.league-link[data-id="d1"]');

  await page.evaluate(async () => {
    const ids = ['d1', 'd2', 'naia', 'juco', 'fiba', 'nba_companion', 'player_career', 'grassroots'];
    for (const id of ids) {
      document.querySelector(`a.league-link[data-id="${id}"]`)?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  });

  await page.waitForURL('**/#grassroots');
  await waitForReady(page);
  await expect(page.locator('a.league-link[data-id="grassroots"]')).toHaveClass(/is-active/);
  await expect(page.locator('#searchInput')).toHaveValue('');
  await searchFor(page, 'Austin Goosby');
  await expect(page.locator('#statsTableBody tr').first()).toContainText('Austin Goosby');

  expect(pageErrors).toEqual([]);
});

test('player career query matrix keeps filters editable while switching modes', async ({ page }) => {
  test.setTimeout(8 * 60 * 1000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`${BASE_URL}/#player_career`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);

  await searchFor(page, 'Shai Gilgeous-Alexander', { maxMs: 7000 });
  await expect(page.locator('#statsTableBody tr').first()).toContainText('Shai Gilgeous-Alexander');
  await commitRange(page, '[data-demo-min="min"]', '0');
  await toggleMultiFilter(page, 'competition_level', 'NBA', { allowEmpty: true });
  await toggleMultiFilter(page, 'competition_level', 'NBA', { allowEmpty: true });
  await setSingleFilter(page, 'status_path', 'nba', { allowEmpty: true });

  await setGrassrootsViewMode(page, 'career', { allowEmpty: true });
  await expect(page.locator('#searchInput')).toHaveValue('');
  await searchFor(page, 'Shai Gilgeous-Alexander', { allowEmpty: true, maxMs: 7000 });
  await commitRange(page, '[data-stat-min="pts_pg"]', '20', { allowEmpty: true });
  await clickGroupCycle(page, 'summary');

  expect(pageErrors).toEqual([]);
});
