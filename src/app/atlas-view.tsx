import { action, atom, bind, computed, reatomRoute, urlAtom, withLocalStorage } from '@reatom/core';
import { h, mount } from '@reatom/jsx';
import { createInterfaceAudio, type InterfaceCue } from '../audio/interface-audio';
import { mapPlacementsByYear, readCatalog, selectMapPlacements, type MapPlacement, type War } from '../catalog';
import { ww1Episodes } from '../catalog/ww1-episodes';
import { ww2Episodes } from '../catalog/ww2-episodes';
import { WarDialog, WarPreview } from '../card/war-dialog';
import { SceneModuleLoadError, type SceneLoader } from '../card/scene-slot';
import { readCardContent } from '../content';
import { copy, type Locale } from '../i18n/atlas-copy';
import { MapSources, WorldMap, type MapViewState } from '../map/world-map';
import { createUnitCalibration } from '../simulation/unit-calibration';
import { PixelIcon } from '../ui/pixel-icon';
import { worldEmblem } from '@/shared/assets/atlas-design';
import { PeriodSlider } from './period-slider';
import '@/shared/ui/atlas-material.css';
import './desktop-atlas.css';

const loadWarScene: SceneLoader = async (host, options) => {
  const { mountScene } = await import('../simulation/mount-scene').catch(error => {
    // The browser may cache a failed module import for the lifetime of the document.
    throw new SceneModuleLoadError('Could not import the scene module', { cause: error });
  });
  options.signal.throwIfAborted();
  return mountScene(host, options);
};

const atlasLocaleRoute = reatomRoute({
  path: ':locale',
  params: ({ locale }): { locale: Locale } | null => locale === 'ru' || locale === 'en' ? { locale } : null,
}, 'atlas.localeRoute');

interface WarRouteSearch {
  war?: string;
  flag?: string;
  episode?: string;
}

// A search-only route keeps the static locale entry path intact.
const warDialogRoute = reatomRoute({
  search: {
    decode: ({ war, flag, episode }: WarRouteSearch): WarRouteSearch => ({ war, flag, episode }),
    encode: ({ war, flag, episode }: WarRouteSearch) => ({ war, flag, episode }),
  },
}, 'atlas.warDialogRoute');

interface OpenWar {
  war: War;
  origin: MapViewState | null;
  hasMapEntry: boolean;
}

interface PreviewedFlag {
  placement: MapPlacement;
  open: () => void;
}

export function createAtlasRoot(initialLocale: Locale) {
  const locale = computed(() => atlasLocaleRoute()?.locale ?? initialLocale, 'app.locale');
  const interfaceSound = atom(false, 'app.interfaceSound').extend(withLocalStorage('pixelAtlas.interfaceSound'));
  const audio = createInterfaceAudio();
  const playCue = (cue: InterfaceCue) => {
    if (interfaceSound()) audio.play(cue);
  };
  const toggleSound = action((trusted: boolean) => {
    const enabled = interfaceSound.set(!interfaceSound());
    if (!enabled) audio.close();
    else if (trusted) {
      audio.activate();
      audio.play('press');
    }
  }, 'app.toggleInterfaceSound');
  const prepareAudio = bind((event: Event) => {
    if (event.isTrusted && interfaceSound()) audio.activate();
  });

  return (
    <div ref={() => {
      document.addEventListener('pointerdown', prepareAudio, true);
      document.addEventListener('keydown', prepareAudio, true);
      window.addEventListener('pagehide', audio.close);
      const unsubscribe = interfaceSound.subscribe(enabled => {
        if (!enabled) audio.close();
      });
      return () => {
        document.removeEventListener('pointerdown', prepareAudio, true);
        document.removeEventListener('keydown', prepareAudio, true);
        window.removeEventListener('pagehide', audio.close);
        unsubscribe();
        audio.close();
      };
    }}>
      {() => createAtlasView(locale(), interfaceSound, toggleSound, playCue)}
    </div>
  );
}

function createAtlasView(
  locale: Locale,
  interfaceSound: () => boolean,
  toggleSound: (trusted: boolean) => void,
  playCue: (cue: InterfaceCue) => void,
) {
  const text = copy[locale];
  const catalog = readCatalog([...ww1Episodes, ...ww2Episodes]);
  const calibrateUnits = createUnitCalibration(catalog.wars.map(war => war.estimate));
  const placements = selectMapPlacements(catalog).map(placement => {
    const ref = placement.episodeId === null ? placement.warId
      : { warId: placement.warId, episodeId: placement.episodeId };
    const brief = readCardContent(ref, locale);
    return brief ? { ...placement, names: { ...placement.names, [locale]: brief.title } } : placement;
  });
  const byFlagId = new Map(placements.map(placement => [placement.flagId, placement]));
  const byYear = mapPlacementsByYear(catalog, placements);
  const datedRecords = [...catalog.wars, ...catalog.episodes];
  const periodLimits = {
    from: Math.min(...datedRecords.map(record => record.period.from)),
    to: Math.max(...datedRecords.map(record => record.period.to)),
  };
  const period = atom(periodLimits, 'app.mapPeriod');
  const byWarId = new Map<string, War>(catalog.wars.map(war => [war.id, war]));
  const viewSnapshots = new Map<string, MapViewState>();
  const selection = atom<OpenWar | null>(null, 'app.warSelection');
  const preview = atom<PreviewedFlag | null>(null, 'app.mapPreview');
  const visiblePlacements = computed(() => {
    const { from, to } = period();
    if (from === periodLimits.from && to === periodLimits.to) return placements;
    const visible = new Set<MapPlacement>();
    for (const [year, entries] of byYear) {
      if (from <= year && year <= to) for (const placement of entries) visible.add(placement);
    }
    return placements.filter(placement => visible.has(placement));
  }, 'app.visiblePlacements');
  const selectPeriod = action((next: typeof periodLimits) => {
    const prior = period();
    if (next.from === prior.from && next.to === prior.to) return;
    period.set(next);
    const active = preview();
    if (active && !visiblePlacements().includes(active.placement)) preview.set(null);
  }, 'app.selectMapPeriod');
  let dialog: HTMLDialogElement;
  let restoreMap: (state: MapViewState) => void;
  let unmountCard: (() => void) | undefined;
  let returningToMap = false;

  function closeDialog() {
    const open = selection();
    if (!open || returningToMap) return;
    returningToMap = true;
    if (!open.hasMapEntry) {
      warDialogRoute.go({}, true);
      return;
    }
    const currentUrl = urlAtom().href;
    // Reatom writes the URL after the current transaction. Wait for that history entry.
    window.setTimeout(() => {
      if (window.location.href === currentUrl) history.back();
    }, 0);
  }

  const selectEpisode = action((episodeId: string | null) => {
    const route = warDialogRoute();
    if (route?.war) warDialogRoute.go({ ...route, episode: episodeId ?? undefined }, true);
    playCue('press');
  }, 'app.selectEpisode');

  const applySelection = action((params: WarRouteSearch | null) => {
    returningToMap = false;
    const prior = selection();
    const war = params?.war ? byWarId.get(params.war) : undefined;
    const explicitFlag = params?.flag ? byFlagId.get(params.flag) : undefined;
    const originFlag = war && explicitFlag?.warId === war.id ? explicitFlag
      : placements.find(placement => placement.warId === war?.id);
    const storedView = originFlag ? viewSnapshots.get(originFlag.flagId) : undefined;
    const origin = storedView ?? (originFlag ? { flagId: originFlag.flagId, zoom: 1, left: 0, top: 0 } : null);
    if (war && prior?.war.id === war.id && prior.origin?.flagId === origin?.flagId) return;

    unmountCard?.();
    unmountCard = undefined;
    if (!war) {
      if (dialog.open) dialog.close();
      selection.set(null);
      if (prior) playCue('close');
      if (prior?.origin) restoreMap(prior.origin);
      else if (prior) document.getElementById('map-title')?.focus();
      return;
    }

    const episodes = catalog.episodes.filter(episode => episode.warId === war.id);
    unmountCard = mount(dialog, <WarDialog war={war} episodes={episodes} locale={locale} onClose={closeDialog}
      calibratedUnits={calibrateUnits(war.estimate)}
      loadScene={loadWarScene} initialEpisodeId={params?.episode} onEpisodeChange={selectEpisode} />).unmount;
    selection.set({ war, origin, hasMapEntry: storedView !== undefined });
    if (!dialog.open) {
      dialog.showModal();
      playCue('open');
    }
  }, 'app.applyWarSelection');

  const openFlag = action((placement: MapPlacement, state: MapViewState) => {
    if (selection()) return;
    viewSnapshots.set(state.flagId, state);
    warDialogRoute.go({ war: placement.warId, flag: placement.flagId });
  }, 'app.openWarFlag');

  return (
    <div class="atlas-shell" ref={() => {
      document.documentElement.lang = locale;
      document.title = text.title;
      let unsubscribe: (() => void) | undefined;
      let mounted = true;
      // Subscribe after the map and native dialog refs have connected.
      queueMicrotask(bind(() => {
        if (mounted) unsubscribe = warDialogRoute.subscribe(applySelection);
      }));
      return () => {
        mounted = false;
        unsubscribe?.();
        unmountCard?.();
      };
    }}>
      <header class="atlas-header">
        <div class="atlas-brand">
          <img class="atlas-brand__emblem" src={worldEmblem} alt="" />
          <h1 aria-label={text.title}>{text.atlasBrand}</h1>
        </div>
        <div class="atlas-header__actions">
          <MapSources locale={locale} />
          <button class="atlas-interface-sound atlas-sprite-button pixel-action" type="button" aria-pressed={interfaceSound}
            on:click={event => toggleSound(event.isTrusted)}>
            {() => <PixelIcon name={interfaceSound() ? 'sound' : 'mute'} />}
            <span class="atlas-desktop-visually-hidden">{text.interfaceSound}</span>
          </button>
          <nav class="atlas-languages" aria-label={text.language}>
            <a class="atlas-sprite-button" href="/ru/" lang="ru" hreflang="ru" aria-label="Русский" aria-current={locale === 'ru' ? 'page' : undefined}>
              <span class="atlas-language-name">Русский</span><span class="atlas-language-short">RU</span>
            </a>
            <a class="atlas-sprite-button" href="/en/" lang="en" hreflang="en" aria-label="English" aria-current={locale === 'en' ? 'page' : undefined}>
              <span class="atlas-language-name">English</span><span class="atlas-language-short">EN</span>
            </a>
          </nav>
        </div>
      </header>
      <main class="atlas-map-layout">
        <div class="atlas-map-layout__main">
          <WorldMap placements={visiblePlacements} locale={locale} onFlagOpen={openFlag} playCue={playCue}
            selectedFlag={() => selection()?.origin?.flagId ?? preview()?.placement.flagId}
            onFlagPreview={(placement, open) => preview.set({ placement, open })}
            registerRestore={restore => { restoreMap = restore; }} />
          <PeriodSlider limits={periodLimits} selected={period} onSelect={selectPeriod} locale={locale} />
        </div>
        <aside class="atlas-map-preview" aria-label={text.mapPreview}
          aria-describedby={() => preview() ? undefined : 'atlas-preview-help'}>
          {() => {
            const active = preview();
            const war = active ? byWarId.get(active.placement.warId) : undefined;
            if (!active || !war) {
              return <div class="war-preview">
                <h2>{text.mapPreview}</h2>
                <p id="atlas-preview-help" class="atlas-visually-hidden">{text.mapPreviewHelp}</p>
              </div>;
            }
            const episode = active.placement.episodeId === null ? undefined
              : catalog.episodes.find(candidate => candidate.warId === war.id && candidate.episodeId === active.placement.episodeId);
            return <WarPreview war={war} episode={episode} locale={locale} onOpen={active.open}
              onDismiss={() => {
                preview.set(null);
                document.getElementById('map-title')?.focus();
              }} />;
          }}
        </aside>
      </main>
      <dialog class="war-dialog" aria-labelledby="war-dialog-title" ref={element => { dialog = element; }}
        on:cancel={event => { event.preventDefault(); closeDialog(); }} />
    </div>
  );
}
