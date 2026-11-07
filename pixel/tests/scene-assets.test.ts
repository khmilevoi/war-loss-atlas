import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  createSceneSpriteLoader, sceneSpriteManifest, type SpriteName,
} from '../src/resources/sprite-assets';

const decodedImage = (name: SpriteName) => ({
  naturalWidth: sceneSpriteManifest.files[name].frameGrid.width,
  naturalHeight: sceneSpriteManifest.files[name].frameGrid.height,
}) as HTMLImageElement;

describe('versioned scene sprite sets', () => {
  it('selects the smallest browser-compatible file and matches recorded hashes', async () => {
    expect(sceneSpriteManifest.version).toMatch(/^battle-v1-[a-f0-9]{12}$/);
    for (const item of Object.values(sceneSpriteManifest.files)) {
      const excluded = new Set<string>(item.excludedByBrowserParity);
      const eligible = Object.entries(item.candidateBytes)
        .filter(([format]) => !excluded.has(format));
      expect(item.bytes).toBe(Math.min(...eligible.map(([, bytes]) => bytes)));
      const bytes = await readFile(new URL(`../src/resources/assets/${item.path}`, import.meta.url));
      expect(bytes.byteLength).toBe(item.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(item.sha256);
      expect(item.frameGrid.width % item.frameGrid.columns).toBe(0);
      expect(item.frameGrid.height % item.frameGrid.rows).toBe(0);
    }
  });

  it('requests only the scene subset and shares decoded images across concurrent/reopened scenes', async () => {
    const decode = vi.fn(async (_url: string, name: SpriteName) => decodedImage(name));
    const load = createSceneSpriteLoader(decode);
    const signal = new AbortController().signal;
    await Promise.all([load('ww2-overview', signal), load('ww2-overview', signal)]);
    expect(decode.mock.calls.map(([, name]) => name).sort()).toEqual([
      'equipmentWrecks', 'infantry', 'roads', 'tankCrew', 'terrain', 'vehicles',
    ]);
    await load('hiroshima', signal);
    await load('nagasaki', signal);
    expect(decode.mock.calls.filter(([, name]) => name === 'nuke')).toHaveLength(1);
    expect(decode.mock.calls.filter(([, name]) => name === 'japanTerrain')).toHaveLength(1);
    expect(decode).toHaveBeenCalledTimes(8);
  });

  it('can abort one waiter without rejecting another and omits effect sheets when reduced', async () => {
    let resolveTerrain: (image: HTMLImageElement) => void = () => {};
    const terrain = new Promise<HTMLImageElement>(resolve => { resolveTerrain = resolve; });
    const decode = vi.fn(async (_url: string, name: SpriteName) => name === 'terrain' ? terrain : decodedImage(name));
    const load = createSceneSpriteLoader(decode);
    const cancelled = new AbortController();
    const first = load('hiroshima', cancelled.signal, { reducedMotion: true });
    const second = load('hiroshima', new AbortController().signal, { reducedMotion: true });
    cancelled.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    resolveTerrain(decodedImage('terrain'));
    await expect(second).resolves.toHaveProperty('terrain');
    expect(decode.mock.calls.map(([, name]) => name).sort()).toEqual(['japanTerrain', 'roads', 'terrain']);
  });

  it('retries rejected or dimension-mismatched required assets', async () => {
    let attempts = 0;
    const load = createSceneSpriteLoader(async (_url, name) => {
      if (name === 'terrain' && attempts++ === 0) return { naturalWidth: 1, naturalHeight: 1 } as HTMLImageElement;
      return decodedImage(name);
    });
    const signal = new AbortController().signal;
    await expect(load('nagasaki', signal)).rejects.toThrow('Unexpected dimensions');
    await expect(load('nagasaki', signal)).resolves.toHaveProperty('terrain');
    expect(attempts).toBe(2);
  });
});
