import { atom, computed } from '@reatom/core';
import { h } from '@reatom/jsx';
import type { Episode, Estimate, Period, War } from '../catalog';
import { readCardContent } from '../content';
import { copy, formatDate, formatNumber, formatPeriod, historicEstimateScope, type Locale } from '../i18n/atlas-copy';
import { PixelIcon } from '../ui/pixel-icon';
import { atlasScenes, resolveCardScene } from '../simulation/scene-config';
import { SceneSlot, type SceneLoader } from './scene-slot';
import './card.css';

function formatEstimate(estimate: Estimate, locale: Locale): string {
  const text = copy[locale];
  const { qualifier } = estimate;
  if (qualifier === 'unknown') return text.unknown;
  const value = qualifier === 'more-than' || qualifier === 'at-least' ? estimate.low : estimate.value;
  if (value === null) return text.unknown;
  const prefix = { approximate: text.approximate, 'more-than': text.moreThan, 'at-least': text.atLeast, reported: '' }[qualifier];
  return [prefix, formatNumber(value, locale)].filter(Boolean).join(' ');
}

function EstimateSummary({ estimate, period, scope, uncertainty, locale }: {
  estimate: Estimate; period: Period | string; scope: string; uncertainty?: string; locale: Locale;
}) {
  const text = copy[locale];
  return (
    <section class="war-estimate">
      <h3>{text.deaths}</h3>
      <p class="war-estimate__value">{formatEstimate(estimate, locale)}</p>
      <dl>
        <div>
          <dt>{text.estimatePeriod}</dt>
          <dd>{typeof period === 'string' ? period : formatPeriod(period)}</dd>
        </div>
        <div>
          <dt>{text.estimateScope}</dt>
          <dd>{scope}</dd>
        </div>
        {estimate.low !== null && estimate.high !== null ? (
          <div>
            <dt>{text.reportedRange}</dt>
            <dd>{formatNumber(estimate.low, locale)}–{formatNumber(estimate.high, locale)}</dd>
          </div>
        ) : null}
      </dl>
      {uncertainty ? <p class="war-estimate__note">{uncertainty}</p> : null}
    </section>
  );
}

function EpisodeBrief({ episode, locale }: { episode: Episode; locale: Locale }) {
  const text = copy[locale];
  const brief = readCardContent(episode, locale);
  const sourcePeriod = episode.estimatePeriod;
  const estimatePeriod = sourcePeriod
    ? `${formatDate(sourcePeriod.from, locale)} – ${formatDate(sourcePeriod.through, locale)}`
    : episode.period;
  const sources = new Map([episode.estimate.source, ...(brief?.sources ?? [])].map(source => [source.url, source]));
  return (
    <div class="war-episode__detail">
      {episode.date ? (
        <p>{text.episodeDate} <time datetime={episode.date.iso}>{brief?.period ?? formatDate(episode.date.iso, locale)}</time></p>
      ) : null}
      {brief ? (
        <div class="war-dialog__context">
          <p><strong>{brief.region}</strong></p>
          {brief.paragraphs.map(paragraph => <p>{paragraph}</p>)}
        </div>
      ) : null}
      <EstimateSummary estimate={episode.estimate} period={estimatePeriod}
        scope={locale === 'ru' ? episode.estimate.scope : text.episodeScope} locale={locale} />
      <ul class="war-dialog__sources" aria-label={text.sources}>
        {Array.from(sources.values(), source => <li><a href={source.url}>{source.title}</a></li>)}
        {episode.anchor?.coordinateSourceUrl ? (
          <li><a href={episode.anchor.coordinateSourceUrl}>{text.anchorCoordinates}</a></li>
        ) : null}
      </ul>
    </div>
  );
}

export function WarDialog({ war, episodes, locale, onClose, loadScene, initialEpisodeId, onEpisodeChange }: {
  war: War; episodes: readonly Episode[]; locale: Locale; onClose: () => void; loadScene?: SceneLoader;
  initialEpisodeId?: string;
  onEpisodeChange: (episodeId: string | null) => void;
}) {
  const text = copy[locale];
  const brief = readCardContent(war.id, locale);
  const scope = war.sourceKind === 'ucdp' ? text.ucdpScope : historicEstimateScope(war.id, locale);
  const uncertainty = war.sourceKind === 'ucdp' ? text.ucdpLimit
    : brief === null && locale === 'ru' ? war.estimate.uncertainty : undefined;
  const sources = new Map([war.estimate.source, ...(brief?.sources ?? [])].map(source => [source.url, source]));
  const initialEpisode = episodes.find(episode => episode.episodeId === initialEpisodeId);
  const expanded = atom<string | null>(initialEpisode?.episodeId ?? null, 'warDialog.expandedEpisode');
  const scene = computed(() => loadScene ? resolveCardScene(atlasScenes, war.id, expanded()) : null, 'warDialog.scene');
  return (
    <div class="war-dialog__frame">
      <header class="war-dialog__header">
        <PixelIcon name="flag" size={32} />
        <h2 id="war-dialog-title">{brief?.title ?? war.names[locale]}</h2>
        <span class="war-dialog__period">{formatPeriod(war.period)}</span>
        <button type="button" class="war-dialog__close pixel-action" aria-label={text.close} autofocus
          on:click={onClose}><PixelIcon name="close" size={24} /></button>
      </header>
      <div class={() => `war-dialog__body${scene() ? ' war-dialog__body--scene' : ''}`}>
        {() => {
          const selected = scene();
          if (!selected || !loadScene) return null;
          const episode = episodes.find(candidate => candidate.episodeId === selected.episodeId);
          const label = episode ? readCardContent(episode, locale)?.title ?? episode.names[locale] : text.overview;
          return <SceneSlot scene={selected} label={label} locale={locale} load={loadScene} />;
        }}
        <aside class="war-dialog__information">
          <EstimateSummary estimate={war.estimate} period={war.period} scope={scope} uncertainty={uncertainty} locale={locale} />
          <div class="war-dialog__brief">
          {brief ? (
            <section class="war-dialog__context">
              <h3>{text.context}</h3>
              {brief.paragraphs.map(paragraph => <p>{paragraph}</p>)}
            </section>
          ) : null}
          <section>
            <h3>{text.geography}</h3>
            {brief ? <p>{brief.region}</p> : null}
            {war.anchor ? (
              <p>
                {locale === 'ru' ? `${war.anchor.label}. ` : text.illustrativeAnchor + ' '}
                <a href={war.anchor.sourceUrl}>{text.anchorSource}</a>
              </p>
            ) : <p>{text.unknown}</p>}
          </section>
          <section>
            <h3>{text.sources}</h3>
            <ul class="war-dialog__sources">
              {Array.from(sources.values(), source => <li><a href={source.url}>{source.title}</a></li>)}
            </ul>
          </section>
          {episodes.length ? (
            <section>
              <h3>{text.episodes}</h3>
              {episodes.map((episode, index) => {
                const name = readCardContent(episode, locale)?.title ?? episode.names[locale];
                const heading = `war-episode-toggle-${index}`;
                const panel = `war-episode-panel-${index}`;
                return (
                  <div class="war-episode">
                    <button type="button" id={heading} aria-controls={panel}
                      aria-expanded={() => expanded() === episode.episodeId}
                      on:click={() => {
                        const next = expanded.set(expanded() === episode.episodeId ? null : episode.episodeId);
                        onEpisodeChange(next);
                      }}>
                      {name}
                    </button>
                    <div id={panel} role="region" aria-labelledby={heading}
                      hidden={() => expanded() !== episode.episodeId}>
                      <EpisodeBrief episode={episode} locale={locale} />
                    </div>
                  </div>
                );
              })}
            </section>
          ) : null}
          </div>
        </aside>
      </div>
      <footer class="war-dialog__footer">
        <button type="button" on:click={onClose}>{text.back}</button>
      </footer>
    </div>
  );
}
