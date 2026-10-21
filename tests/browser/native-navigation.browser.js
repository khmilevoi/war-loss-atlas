// With `PORT=4173 npm run dev`, run through browser_run_code_unsafe(filename)
// or: playwright-cli -s=atlas-task3-dev run-code --filename=tests/browser/native-navigation.browser.js
// A disposable browser context keeps each run's test-only instrumentation isolated.
async (seedPage) => {
  const browser = seedPage.context().browser();
  if (!browser) throw new Error('A dedicated test browser is required');
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    window.__atlasNavigationProbe = { clicks: 0, popstates: 0, pushes: [] };
    const add = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (this === document.body && type === 'click') window.__atlasNavigationProbe.clicks++;
      if (this === window && type === 'popstate') window.__atlasNavigationProbe.popstates++;
      return add.call(this, type, listener, options);
    };
    const push = history.pushState;
    history.pushState = function(...args) {
      window.__atlasNavigationProbe.pushes.push(String(args[2]));
      return push.apply(this, args);
    };
  });
  await page.goto('http://127.0.0.1:4173/');
  await page.waitForLoadState('networkidle');
  const initial = await page.evaluate(() => ({ ...window.__atlasNavigationProbe, historyLength: history.length }));
  await page.getByRole('navigation').getByRole('link', { name: 'Данные и расчёты', exact: true }).click();
  await page.getByRole('heading', { name: 'Данные и расчёты', exact: true }).waitFor();
  const afterClick = await page.evaluate(() => ({ ...window.__atlasNavigationProbe, historyLength: history.length }));
  await page.goBack();
  await page.waitForLoadState('networkidle');
  const back = await page.evaluate(() => ({ pathname: location.pathname,
    layer: document.querySelector('section[data-layer]')?.getAttribute('data-layer'),
    selected: document.querySelector('section[data-layer]')?.getAttribute('data-selected-id') }));
  await page.goto('http://127.0.0.1:4173/data?q=India&selected=11345');
  await page.waitForLoadState('networkidle');
  const directData = await page.evaluate(() => ({
    query: document.querySelector('input[type="search"]')?.value,
    layer: document.querySelector('section[data-layer]')?.getAttribute('data-layer'),
    selected: document.querySelector('section[data-layer]')?.getAttribute('data-selected-id'),
    rows: document.querySelectorAll('[data-row-id]').length,
  }));
  const result = { initial, afterClick, back, directData, errors };
  if (initial.clicks !== 1 || initial.popstates !== 1 || afterClick.pushes.length !== 1
    || afterClick.historyLength !== initial.historyLength + 1 || back.pathname !== '/'
    || back.layer !== 'history' || back.selected !== 'ww2' || directData.query !== 'India'
    || directData.layer !== 'ucdp' || directData.selected !== '11345' || !directData.rows || errors.length) {
    throw new Error(`Native browser navigation regression: ${JSON.stringify(result)}`);
  }
  return result;
  } finally { await context.close(); }
}
