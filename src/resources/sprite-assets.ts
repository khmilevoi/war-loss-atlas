import manifest from './assets/scene-sprites.json';

export const sceneSpriteManifest = manifest;
export type SpriteName = keyof typeof manifest.files;
export type SceneAssetId = keyof typeof manifest.scenes;
type ImageDecoder = (url: string, name: SpriteName) => Promise<HTMLImageElement>;

export type SceneSprites = Partial<Record<SpriteName, HTMLImageElement>>;

const urls = import.meta.glob<string>('./assets/battle-topdown-*', {
  eager: true, import: 'default', query: '?url&no-inline',
});

function decodeImage(url: string) {
  const image = new Image();
  image.src = url;
  return image.decode().then(() => image);
}

/** Retains at most the entries in the versioned manifest and shares each in-flight decode. */
export function createSceneSpriteLoader(decode: ImageDecoder = decodeImage) {
  const decoded = new Map<SpriteName, Promise<HTMLImageElement>>();

  function load(name: SpriteName): Promise<HTMLImageElement> {
    const existing = decoded.get(name);
    if (existing) return existing;
    const asset = manifest.files[name];
    const url = urls[`./assets/${asset.path}`];
    if (!url) return Promise.reject(new Error(`Missing sprite URL: ${name}`));
    const loading = Promise.resolve().then(() => decode(url, name)).then(image => {
      if (image.naturalWidth !== asset.frameGrid.width || image.naturalHeight !== asset.frameGrid.height) {
        throw new Error(`Unexpected dimensions for sprite: ${name}`);
      }
      return image;
    }).catch((error: unknown) => {
      decoded.delete(name);
      throw error;
    });
    decoded.set(name, loading);
    return loading;
  }

  return async function loadSceneSprites(id: SceneAssetId, signal: AbortSignal, { reducedMotion = false } = {}): Promise<SceneSprites> {
    signal.throwIfAborted();
    let cancel = () => {};
    const abort = new Promise<never>((_, reject) => {
      cancel = () => reject(signal.reason);
      signal.addEventListener('abort', cancel, { once: true });
    });
    try {
      const scene = manifest.scenes[id];
      const required = scene.required as SpriteName[];
      const optional = [...scene.optional, ...(reducedMotion ? [] : scene.animated)] as SpriteName[];
      const prepared = Promise.all([
        ...required.map(async name => [name, await load(name)] as const),
        ...optional.map(async name => [name, await load(name).catch(() => undefined)] as const),
      ]);
      const sprites = await Promise.race([prepared, abort]);
      signal.throwIfAborted();
      return Object.fromEntries(sprites);
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  };
}

export const loadSceneSprites = createSceneSpriteLoader();
