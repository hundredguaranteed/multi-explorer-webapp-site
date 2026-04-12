const { test, expect } = require('@playwright/test');

async function waitForReady(page, timeout = 120000, options = {}) {
  const allowEmpty = Boolean(options.allowEmpty);
  try {
    await page.waitForFunction((allowNoRows) => {
      const status = (document.getElementById('statusPill')?.textContent || '').toLowerCase();
      const searchInput = document.getElementById('searchInput');
      const rows = document.querySelectorAll('#statsTableBody tr');
      return searchInput && !status.includes('loading') && !status.includes('failed') && (allowNoRows || rows.length > 0);
    }, allowEmpty, { timeout });
  } catch (error) {
    const snapshot = await page.evaluate(() => ({
      status: document.getElementById('statusPill')?.textContent || '',
      disabled: document.getElementById('searchInput')?.disabled,
      rows: document.querySelectorAll('#statsTableBody tr').length,
      hash: window.location.hash,
    }));
    // eslint-disable-next-line no-console
    console.log('waitForReady timeout snapshot', snapshot);
    throw error;
  }
  await page.waitForTimeout(400);
}

async function switchTab(page, tabId) {
  await page.evaluate((id) => {
    window.location.hash = `#${id}`;
  }, tabId);
  await page.waitForFunction((id) => window.location.hash === `#${id}`, tabId, { timeout: 10000 });
  await waitForReady(page);
}

async function searchFor(page, value, options = {}) {
  const input = page.locator('#searchInput');
  await input.fill('');
  if (value) {
    await input.type(value, { delay: 20 });
  }
  await input.press('Tab');
  await waitForReady(page, options.timeout || 120000, { allowEmpty: options.allowEmpty });
}

async function setRangeInput(locator, value, options = {}) {
  await locator.fill(value);
  await locator.press('Tab');
  await waitForReady(locator.page(), options.timeout || 120000, { allowEmpty: options.allowEmpty });
}

async function selectSingleFilter(page, filterId, value, options = {}) {
  await page.locator(`#single-${filterId}`).evaluate((element, nextValue) => {
    element.value = nextValue;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await waitForReady(page, options.timeout || 120000, { allowEmpty: options.allowEmpty });
}

async function selectAllYears(page, timeout = 240000) {
  await page.locator('#selectAllYearsBtn').click();
  await waitForReady(page, timeout);
}

async function selectYear(page, year, timeout = 120000) {
  await page.locator('#yearQuickSelect').selectOption(year);
  await waitForReady(page, timeout);
}

async function setGrassrootsViewMode(page, mode) {
  await page.locator(`[data-view-mode="${mode}"]`).click();
  await waitForReady(page);
}

async function getTableRows(page) {
  return page.evaluate(() => {
    const headers = Array.from(document.querySelectorAll('#statsTableHead th')).map((cell, index) => {
      const label = (cell.textContent || '').trim();
      return label || `col_${index}`;
    });
    return Array.from(document.querySelectorAll('#statsTableBody tr')).map((row) => {
      const out = {};
      Array.from(row.cells).forEach((cell, index) => {
        out[headers[index]] = (cell.textContent || '').trim();
      });
      return out;
    });
  });
}

function isNoResultsRowText(text) {
  return /no rows matched the current filters\./i.test(String(text || '').trim());
}

async function expectNoDataRows(page) {
  const rowTexts = await page.locator('#statsTableBody tr').allTextContents();
  expect(rowTexts.some((text) => isNoResultsRowText(text))).toBeTruthy();
  expect(rowTexts.filter((text) => !isNoResultsRowText(text))).toHaveLength(0);
}

test('runtime regression smoke', async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);
  const issues = [];

  page.on('pageerror', (error) => issues.push(`pageerror: ${error.message}`));
  page.on('crash', () => issues.push('page crashed'));

  await page.goto('http://127.0.0.1:8787/#d1', { waitUntil: 'networkidle' });
  await waitForReady(page);

  await searchFor(page, 'Malique Ewin');
  await expect(page.locator('#statsTableBody tr').first()).toContainText('Malique Ewin');

  await switchTab(page, 'd2');
  await selectAllYears(page);
  await searchFor(page, 'Bennett Stirtz');
  await expect(page.locator('#statsTableBody tr').first()).toContainText('Bennett Stirtz');

  await switchTab(page, 'player_career');
  await selectAllYears(page);
  await searchFor(page, 'Shai Gilgeous-Alexander');
  await expect(page.locator('#statsTableBody tr').first()).toContainText('Shai Gilgeous-Alexander');

  await switchTab(page, 'grassroots');
  await selectAllYears(page);
  await searchFor(page, 'Austin Goosby');
  await expect(page.locator('#statsTableBody tr').first()).toContainText('Austin Goosby');

  expect(issues, issues.join('\n')).toEqual([]);
});

test('d1 keeps original defense and shooting values', async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);

  await page.goto('http://127.0.0.1:8787/#d1', { waitUntil: 'networkidle' });
  await waitForReady(page);
  await selectAllYears(page);
  await searchFor(page, 'Buddy Hield');

  const rows = await getTableRows(page);
  const buddy2016 = rows.find((row) => row.Player === 'Buddy Hield' && row.Year === '2016');

  expect(buddy2016).toBeTruthy();
  expect(buddy2016['STL%']).toBe('1.8');
  expect(buddy2016['BLK%']).toBe('1.4');
  expect(buddy2016['eFG%']).toBe('62.3');
  expect(buddy2016['TS%']).toBe('67.1');
});

test('status filters use realgm-linked outcomes instead of text heuristics', async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);

  await page.goto('http://127.0.0.1:8787/#d1', { waitUntil: 'networkidle' });
  await waitForReady(page);

  await selectSingleFilter(page, 'status_path', 'nba', { allowEmpty: true });
  await searchFor(page, 'Cameron Clark');
  await expect(page.locator('#statsTableBody tr').first()).toContainText('Cameron Clark');

  await selectAllYears(page);
  await searchFor(page, 'Buddy Hield');
  await expect(page.locator('#statsTableBody tr').first()).toContainText('Buddy Hield');

  await selectSingleFilter(page, 'status_path', 'former_juco');
  await searchFor(page, 'Chris Duarte');
  await expect(page.locator('#statsTableBody tr').first()).toContainText('Chris Duarte');

  await switchTab(page, 'juco');
  await selectAllYears(page);
  await selectSingleFilter(page, 'status_path', 'nba');
  await searchFor(page, 'Chris Duarte');
  await expect(page.locator('#statsTableBody tr').first()).toContainText('Chris Duarte');

  await searchFor(page, 'Donyae May');
  await expect(page.locator('#statsTableBody tr').first()).toContainText('Donyae May');

  await selectSingleFilter(page, 'status_path', 'd1');
  await searchFor(page, 'Chris Duarte');
  await expect(page.locator('#statsTableBody tr').first()).toContainText('Chris Duarte');

  await switchTab(page, 'd2');
  await selectAllYears(page);
  await selectSingleFilter(page, 'status_path', 'd1');
  await searchFor(page, 'Bennett Stirtz');
  await expect(page.locator('#statsTableBody tr').first()).toContainText('Bennett Stirtz');

  await selectSingleFilter(page, 'status_path', 'nba', { allowEmpty: true });
  await searchFor(page, 'Bennett Stirtz');
  await expect(page.locator('#statsTableBody tr').first()).toContainText('Bennett Stirtz');
});

test('status filters stay realgm-linked across naia fiba and grassroots', async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);

  await page.goto('http://127.0.0.1:8787/#naia', { waitUntil: 'networkidle' });
  await waitForReady(page);
  await switchTab(page, 'naia');
  await selectAllYears(page);
  await selectSingleFilter(page, 'status_path', 'd1');
  await searchFor(page, 'Luke Almodovar');
  await expect(page.locator('#statsTableBody tr').first()).toContainText('Luke Almodovar');

  await selectSingleFilter(page, 'status_path', 'nba', { allowEmpty: true });
  await searchFor(page, 'Luke Almodovar');
  await expect(page.locator('#statsTableBody tr').first()).toContainText('Luke Almodovar');

  await switchTab(page, 'fiba');
  await selectAllYears(page);
  await selectSingleFilter(page, 'status_path', 'nba');
  await searchFor(page, 'Pau Gasol');
  await expect(page.locator('#statsTableBody tr').first()).toContainText('Pau Gasol');

  await selectSingleFilter(page, 'status_path', 'd1');
  await searchFor(page, 'Pau Gasol');
  await expect(page.locator('#statsTableBody tr').first()).toContainText('Pau Gasol');

  await switchTab(page, 'grassroots');
  await selectYear(page, '2021');
  await selectSingleFilter(page, 'status_path', 'nba');
  await searchFor(page, 'Emoni Bates');
  await expect(page.locator('#statsTableBody tr').first()).toContainText('Emoni Bates');

  await searchFor(page, 'Jayden Hodge', { allowEmpty: true });
  await expectNoDataRows(page);
});

test('minute filters stay attached to the active tab state while searching', async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);

  const scenarios = [
    { tab: 'd1', minuteSelector: '[data-demo-min="min"]', search: 'cooper', expectedText: 'Cooper' },
    { tab: 'd2', minuteSelector: '[data-demo-min="min"]', search: 'bennett', expectedText: 'Bennett' },
    { tab: 'player_career', minuteSelector: '[data-demo-min="min"]', allYears: true, search: 'shai', expectedText: 'Shai' },
    { tab: 'nba', minuteSelector: '[data-demo-min="mp"]', allYears: true, search: 'haliburton', expectedText: 'Haliburton' },
  ];

  await page.goto('http://127.0.0.1:8787/#d1', { waitUntil: 'networkidle' });
  await waitForReady(page);

  for (const scenario of scenarios) {
    await switchTab(page, scenario.tab);
    if (scenario.allYears) await selectAllYears(page);
    const minuteInput = page.locator(scenario.minuteSelector).first();
    await setRangeInput(minuteInput, '0');
    await searchFor(page, scenario.search);
    await expect(minuteInput).toHaveValue('0');
    await expect(page.locator('#statsTableBody tr').first()).toContainText(scenario.expectedText);
  }

  await switchTab(page, 'grassroots');
  await setGrassrootsViewMode(page, 'career');
  await selectAllYears(page);
  const grassrootsMinuteInput = page.locator('[data-demo-min="min"]').first();
  await setRangeInput(grassrootsMinuteInput, '0');
  await searchFor(page, 'Tyrese Haliburton', { timeout: 180000 });
  await expect(grassrootsMinuteInput).toHaveValue('0');
  await expect(page.locator('#statsTableBody tr').first()).toContainText('Tyrese Haliburton', { timeout: 180000 });
});
