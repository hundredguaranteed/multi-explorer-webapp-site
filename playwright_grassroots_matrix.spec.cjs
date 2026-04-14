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

async function searchFor(page, value, options = {}) {
  const input = page.locator('#searchInput');
  const started = Date.now();
  await input.fill(value);
  await waitForRowsSettled(page, options);
  expect(Date.now() - started).toBeLessThan(options.maxMs || 7000);
  await expect(input).toHaveValue(value);
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
    const manifestUrl = new URL('data/vendor/grassroots_year_manifest.js?v=20260414-search-companion-v54', window.location.href).href;
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
