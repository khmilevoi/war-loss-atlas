import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

test('stops scene audio before computing the reduced-motion overview', async ({ page }) => {
  await page.addInitScript(() => {
    const audio = { motorStarts: 0, motorStops: 0, voiceStarts: 0 };
    Object.defineProperty(window, 'motionAudioAudit', { value: audio });
    const start = OscillatorNode.prototype.start;
    const stop = OscillatorNode.prototype.stop;
    OscillatorNode.prototype.start = function (when) {
      if (this.type === 'sawtooth') audio.motorStarts++;
      return start.call(this, when);
    };
    OscillatorNode.prototype.stop = function (when) {
      if (this.type === 'sawtooth') audio.motorStops++;
      return stop.call(this, when);
    };
    const startVoice = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      audio.voiceStarts++;
      return startVoice.apply(this, args);
    };
  });

  await page.goto('/en/');
  await page.evaluate(() => {
    let now = -40;
    let next = 0;
    const pending = new Map<number, FrameRequestCallback>();
    window.requestAnimationFrame = callback => {
      pending.set(++next, callback);
      return next;
    };
    window.cancelAnimationFrame = handle => { pending.delete(handle); };
    Object.defineProperty(window, 'advanceMotionAudioAudit', { value: (duration: number) => {
      const end = now + duration;
      while (now < end) {
        now += 40;
        const callbacks = [...pending.values()];
        pending.clear();
        for (const callback of callbacks) callback(now);
      }
    } });
  });
  const advance = (duration: number) => page.evaluate(value => (window as Window & {
    advanceMotionAudioAudit?: (duration: number) => void;
  }).advanceMotionAudioAudit!(value), duration);
  await page.getByRole('button', { name: 'Atomic bombing of Hiroshima', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Second World War' });
  const sound = dialog.getByRole('button', { name: 'Sound', exact: true });
  await sound.click();
  await expect(sound).toHaveAttribute('aria-pressed', 'true');
  await advance(2400);

  const counts = () => page.evaluate(() => (window as Window & {
    motionAudioAudit?: { motorStarts: number; motorStops: number; voiceStarts: number };
  }).motionAudioAudit!);
  const before = await counts();
  expect(before.motorStarts).toBeGreaterThan(before.motorStops);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(async () => (await counts()).motorStops).toBe(before.motorStarts);
  const field = dialog.locator('canvas[data-scene-canvas="ww2-overview"]');
  const finale = await field.evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL());
  await advance(1200);
  expect(await counts()).toEqual({
    motorStarts: before.motorStarts, motorStops: before.motorStarts, voiceStarts: before.voiceStarts,
  });
  expect(await field.evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL())).toBe(finale);
});

const frozenPreview = new URL('../../reference/battle-preview/', import.meta.url);

test('episode flash fills the viewport, leaves a static field, and resets on restart', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/en/');
  await page.clock.install();
  await page.getByRole('button', { name: 'Atomic bombing of Hiroshima', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Second World War' });
  await dialog.getByRole('button', { name: 'Atomic bombing of Hiroshima', exact: true }).click();
  const canvas = dialog.locator('canvas[data-scene-canvas="hiroshima"]');
  const flash = dialog.locator('[data-scene-flash="hiroshima"]');
  const pixels = () => canvas.evaluate((field: HTMLCanvasElement) => field.toDataURL());
  await expect(canvas).toBeVisible();
  const before = await pixels();
  await page.clock.runFor(8380);
  const layer = await flash.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { rect: [rect.x, rect.y, rect.width, rect.height], background: style.backgroundColor, opacity: Number(style.opacity) };
  });
  expect(layer.rect).toEqual([0, 0, 1280, 800]);
  expect(layer.background).toBe('rgb(255, 255, 255)');
  expect(layer.opacity).toBeGreaterThan(.9);

  await page.clock.runFor(1800);
  await expect(flash).toHaveCSS('opacity', '0');
  const aftermath = await pixels();
  expect(aftermath).not.toBe(before);
  await page.clock.runFor(400);
  expect(await pixels()).toBe(aftermath);
  await dialog.getByRole('button', { name: 'Restart', exact: true }).click();
  expect(await pixels()).not.toBe(aftermath);
});

test('reduced motion immediately shows a stable Nagasaki scene without flashing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en/');
  await page.clock.install();
  await page.getByRole('button', { name: 'Atomic bombing of Nagasaki', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Second World War' });
  await dialog.getByRole('button', { name: 'Atomic bombing of Nagasaki', exact: true }).click();
  const canvas = dialog.locator('canvas[data-scene-canvas="nagasaki"]');
  const flash = dialog.locator('[data-scene-flash="nagasaki"]');
  await expect(canvas).toBeVisible();
  await expect(flash).toHaveCSS('opacity', '0');
  const before = await canvas.evaluate((field: HTMLCanvasElement) => field.toDataURL());
  await page.clock.runFor(12000);
  await expect(flash).toHaveCSS('opacity', '0');
  expect(await canvas.evaluate((field: HTMLCanvasElement) => field.toDataURL())).toBe(before);
});

test('closes the native AudioContext when a scene is removed', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeAudioContext = AudioContext;
    const audit = { opened: 0, closed: 0 };
    Object.defineProperty(window, 'sceneAudioAudit', { value: audit });
    window.AudioContext = class extends NativeAudioContext {
      constructor() { super(); audit.opened++; }
      async close() {
        await super.close();
        audit.closed++;
      }
    };
  });
  const counts = () => page.evaluate(() => (window as Window & { sceneAudioAudit?: { opened: number; closed: number } }).sceneAudioAudit);
  await page.goto('/en/');
  await page.getByRole('button', { name: 'Atomic bombing of Hiroshima', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Second World War' });
  const sound = dialog.getByRole('button', { name: 'Sound', exact: true });
  await expect(sound).toBeEnabled();
  expect(await counts()).toEqual({ opened: 0, closed: 0 });
  await sound.click();
  await expect(sound).toHaveAttribute('aria-pressed', 'true');
  await sound.click();
  await expect(sound).toHaveAttribute('aria-pressed', 'false');
  await sound.click();
  await expect(sound).toHaveAttribute('aria-pressed', 'true');
  expect(await counts()).toEqual({ opened: 1, closed: 0 });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect.poll(counts).toEqual({ opened: 1, closed: 1 });
});


test('matches the frozen preview opening frame pixel for pixel', async ({ page }) => {
  await page.goto('/en/');
  const testClock = new Date('2026-11-07T00:00:00.000Z');
  await page.clock.install({ time: testClock });
  await page.clock.pauseAt(new Date(testClock.getTime() + 1000));
  await page.getByRole('button', { name: 'Atomic bombing of Hiroshima', exact: true }).click();
  const canvas = page.locator('canvas[data-scene-canvas="ww2-overview"]');
  await expect(canvas).toBeVisible();

  const frozen = (name: string) => new URL(name, frozenPreview);
  const roster = await import(frozen('atlas-unit-roster.mjs').href);
  await page.addScriptTag({ path: fileURLToPath(frozen('battle-engine.js')) });
  const assets = Object.fromEntries(await Promise.all(
    Object.entries({
      infantrySprites: 'infantry',
      vehicleSprites: 'vehicles',
      terrainSprites: 'terrain',
      roadSprites: 'roads',
      nukeSprites: 'nuke',
      tankCrewSprites: 'tank-crew',
      equipmentWreckSprites: 'equipment-wrecks',
    }).map(async ([key, name]) => {
      const image = await readFile(frozen(`battle-topdown-${name}.png`));
      return [key, `data:image/png;base64,${image.toString('base64')}`] as const;
    }),
  ));
  const original = await page.evaluate(async ({ assets, roster }) => {
    const images = Object.fromEntries(await Promise.all(Object.entries(assets).map(async ([key, url]) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return [key, image];
    })));
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 576;
    const createPreview = (window as Window & {
      createAtlasBattle?: (canvas: HTMLCanvasElement, options: Record<string, unknown>) => { dispose(): void };
    }).createAtlasBattle;
    if (!createPreview) throw new Error('Frozen preview engine did not initialize');
    const preview = createPreview(canvas, {
      ...images, roster, seed: 1943, era: 'eastern-front', paused: true, reducedMotion: false,
    });
    try {
      return canvas.toDataURL();
    } finally {
      preview.dispose();
    }
  }, { assets, roster: { units: roster.units, scenarios: roster.scenarios, equipmentSheets: roster.equipmentSheets } });
  expect(await canvas.evaluate((field: HTMLCanvasElement) => field.toDataURL()) === original).toBe(true);
});


test('measures a cold throttled start and a cached scene reopening', async ({ page, context }, testInfo) => {
  test.setTimeout(70000);
  await page.addInitScript(() => {
    const markStartup = () => {
      const loader = document.querySelector('.startup__tiles');
      if (!loader) {
        if (!document.querySelector('[data-testid="map-land"]')) requestAnimationFrame(markStartup);
      } else if (loader.getBoundingClientRect().width > 0 && getComputedStyle(loader).backgroundImage !== 'none') {
        performance.mark('atlas-startup-ready');
      } else requestAnimationFrame(markStartup);
    };
    requestAnimationFrame(markStartup);
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.clearBrowserCache');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 100, downloadThroughput: 156250, uploadThroughput: 93750,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const resources = () => page.evaluate(() => (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
    .filter(entry => /\/(mount-scene-|battle-topdown-)/.test(entry.name))
    .map(entry => ({ file: new URL(entry.name).pathname.split('/').at(-1), bytes: entry.encodedBodySize,
      transferBytes: entry.transferSize })));

  await page.goto('/en/', { waitUntil: 'commit' });
  const flag = page.getByRole('button', { name: 'Atomic bombing of Hiroshima', exact: true });
  await expect(flag).toBeVisible({ timeout: 30000 });
  const startup = await page.evaluate(() => ({
    loaderFrameMs: Math.round(performance.getEntriesByName('atlas-startup-ready')[0]?.startTime ?? -1),
    mapUsableMs: Math.round(performance.now()),
  }));
  expect(startup.loaderFrameMs).toBeGreaterThan(0);
  expect(startup.mapUsableMs).toBeGreaterThan(startup.loaderFrameMs);
  expect(await resources()).toEqual([]);

  const canvas = page.locator('canvas[data-scene-canvas="ww2-overview"]');
  const timeToFrame = async () => {
    const started = await page.evaluate(() => performance.now());
    await flag.click();
    await expect(canvas).toBeVisible({ timeout: 20000 });
    return Math.round(await page.evaluate(started => performance.now() - started, started));
  };
  const firstFrameMs = await timeToFrame();
  const coldResources = await resources();
  expect(coldResources.filter(item => item.file?.startsWith('battle-topdown-'))).toHaveLength(6);
  expect(coldResources.some(item => item.file?.includes('battle-topdown-nuke'))).toBe(false);
  expect(coldResources.some(item => item.file?.startsWith('mount-scene-'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(canvas).toHaveCount(0);
  const cachedFrameMs = await timeToFrame();
  expect(await resources()).toEqual(coldResources);

  const measurements = {
    profile: { latencyMs: 100, downloadBytesPerSecond: 156250, cpuFactor: 4 },
    startup, firstFrameMs, cachedFrameMs, sceneFiles: coldResources,
    coldEncodedBytes: coldResources.reduce((sum, item) => sum + item.bytes, 0),
    coldTransferredBytes: coldResources.reduce((sum, item) => sum + item.transferBytes, 0),
    reopenedAdditionalRequests: 0,
  };
  await testInfo.attach('scene-network.json', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
  console.log('Scene network sample', JSON.stringify(measurements));
});


test('keeps every selected sprite visually identical to its PNG source in Chrome', async ({ page }) => {
  const source = (name: string) => new URL(name, frozenPreview);
  const selected = (name: string) => new URL(`../../src/resources/assets/${name}`, import.meta.url);
  const dataUrl = async (file: URL) => `data:image/${file.pathname.endsWith('.webp') ? 'webp' : 'png'};base64,${(await readFile(file)).toString('base64')}`;
  const manifest = JSON.parse(await readFile(selected('scene-sprites.json'), 'utf8')) as {
    files: Record<string, { path: string; frameGrid: { width: number; height: number } }>;
  };
  const inputs = await Promise.all(Object.values(manifest.files).map(async asset => ({
    name: asset.path,
    expected: [asset.frameGrid.width, asset.frameGrid.height],
    source: await dataUrl(source(asset.path.replace(/\.[^.]+$/, '.png'))),
    selected: await dataUrl(selected(asset.path)),
  })));
  const result = await page.evaluate(async inputs => {
    const decode = async (url: string) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    };
    const read = (image: HTMLImageElement, divisor: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth / divisor;
      canvas.height = image.naturalHeight / divisor;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Canvas 2D is unavailable');
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    return Promise.all(inputs.map(async input => {
      const [source, selected] = await Promise.all([decode(input.source), decode(input.selected)]);
      const size = [source.naturalWidth, source.naturalHeight, selected.naturalWidth, selected.naturalHeight];
      const mismatched = [1, 2].map(divisor => {
        const old = read(source, divisor), next = read(selected, divisor);
        return old.reduce((count, channel, index) => count + Number(channel !== next[index]), 0);
      });
      return { name: input.name, size, mismatched };
    }));
  }, inputs);
  for (let index = 0; index < result.length; index++) {
    expect(result[index].size, result[index].name).toEqual([...inputs[index].expected, ...inputs[index].expected]);
    expect(result[index].mismatched, result[index].name).toEqual([0, 0]);
  }
});

test('finishes the WWII overview on a settled field without a flash and restarts', async ({ page }, testInfo) => {
  test.setTimeout(45000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/en/');
  await page.clock.install();
  await page.getByRole('button', { name: 'Atomic bombing of Hiroshima', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Second World War' });
  const field = dialog.locator('canvas[data-scene-canvas="ww2-overview"]');
  const flash = dialog.locator('[data-scene-flash="ww2-overview"]');
  const readField = () => field.evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable');
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let craters = 0;
    let blood = 0;
    for (let offset = 0; offset < rgba.length; offset += 4) {
      if (rgba[offset] === 29 && rgba[offset + 1] === 23 && rgba[offset + 2] === 24) craters++;
      if (rgba[offset] === 153 && rgba[offset + 1] === 14 && rgba[offset + 2] === 32) blood++;
    }
    return { image: canvas.toDataURL(), craters, blood };
  });
  await expect(field).toBeVisible();
  expect((await readField()).craters).toBe(0);
  await page.clock.runFor(24600);
  await expect(flash).toHaveCSS('opacity', '0');
  const terminal = await readField();
  expect(terminal.craters).toBeGreaterThan(500);
  expect(terminal.blood).toBeGreaterThan(300);
  await page.clock.runFor(1000);
  expect((await readField()).image === terminal.image).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('ww2-finale.png') });
  await dialog.getByRole('button', { name: 'Restart', exact: true }).click();
  expect((await readField()).craters).toBe(0);
});

test('uses distinct river motifs in the two static episode fields', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en/');
  await page.getByRole('button', { name: 'Atomic bombing of Hiroshima', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Second World War' });
  for (const [id, city, expected] of [['hiroshima', 'Hiroshima', 2], ['nagasaki', 'Nagasaki', 1]] as const) {
    await dialog.getByRole('button', { name: `Atomic bombing of ${city}`, exact: true }).click();
    const field = dialog.locator(`canvas[data-scene-canvas="${id}"]`);
    await expect(field).toBeVisible();
    const channels = await field.evaluate((canvas: HTMLCanvasElement) => {
      const rgba = canvas.getContext('2d')?.getImageData(0, 4, canvas.width, 1).data;
      if (!rgba) throw new Error('Canvas 2D is unavailable');
      let count = 0, prior = false;
      for (let offset = 0; offset < rgba.length; offset += 4) {
        const isWater = (rgba[offset] === 52 && rgba[offset + 1] === 75 && rgba[offset + 2] === 74)
          || (rgba[offset] === 101 && rgba[offset + 1] === 121 && rgba[offset + 2] === 118);
        if (isWater && !prior) count++;
        prior = isWater;
      }
      return count;
    });
    expect(channels).toBe(expected);
    await page.screenshot({ path: testInfo.outputPath(`${id}-terrain.png`) });
  }
});
