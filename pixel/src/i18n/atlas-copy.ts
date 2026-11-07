export const startupCopy = {
  ru: {
    title: 'Пиксельный атлас войн',
    startupStatus: 'Карта собирается',
    startupNoScript: 'Для запуска атласа включите JavaScript и обновите страницу.',
    startupError: 'Не удалось загрузить карту.',
    startupRetry: 'Повторить загрузку',
  },
  en: {
    title: 'Pixel War Atlas',
    startupStatus: 'Assembling the map',
    startupNoScript: 'Enable JavaScript and reload the page to open the atlas.',
    startupError: 'The map could not be loaded.',
    startupRetry: 'Try loading again',
  },
} as const;

export const copy = {
  ru: {
    ...startupCopy.ru,
    language: 'Язык',
    interfaceSound: 'Звуки интерфейса',
    worldMap: 'Карта мира',
    mapDescription: 'Выберите отметку, чтобы открыть карточку. Клавиши со стрелками перемещают фокус между отметками.',
    mapScale: 'Оценки UCDP',
    scaleLow: 'Меньше погибших',
    scaleHigh: 'Больше погибших',
    scaleDetails: 'Как читать шкалу',
    scaleScope: 'Оттенок показывает оценку UCDP за годы наблюдения. Если несколько флагов делят точку, оттенок соответствует наибольшей отдельной оценке.',
    mapHistory: 'Исторические оценки',
    mapUnknown: 'Нет данных',
    mapAnchors: 'Точки обозначают регионы условно. Размер ореола не показывает территорию боёв.',
    mapSource: 'Геометрия суши · Natural Earth',
    zoomIn: 'Приблизить',
    zoomOut: 'Отдалить',
    zoomReset: 'Показать весь мир',
    flagGroup: 'Флаги в этой точке',
    close: 'Закрыть',
    back: 'Вернуться к карте',
    deaths: 'Погибшие',
    estimatePeriod: 'Период оценки',
    episodeDate: 'Дата события',
    estimateScope: 'Что учитывает оценка',
    sources: 'Источники',
    geography: 'География',
    context: 'Краткая история',
    unknown: 'Нет данных',
    approximate: 'Около',
    moreThan: 'Более',
    atLeast: 'Не менее',
    illustrativeAnchor: 'Условная метка для навигации.',
    anchorSource: 'Основание размещения на карте',
    anchorCoordinates: 'Координаты ориентира',
    reportedRange: 'Диапазон источника',
    episodes: 'Знаковые сражения',
    ucdpScope: 'Смерти, связанные с боями. Число суммирует наблюдения UCDP за указанный период.',
    ucdpLimit: 'Период наблюдения может охватывать лишь часть конфликта.',
    historicScope: 'Отдельная историческая оценка. Её нельзя сравнивать с боевыми потерями UCDP.',
    ww1EstimateScope: 'Общая оценка погибших. Публикация не раскрывает её состав.',
    ww2EstimateScope: 'Общая оценка погибших, включая мирных жителей, умерших от голода, геноцида и бомбардировок.',
    usCivilEstimateScope: 'Смерти непосредственно в результате войны по определению источника. Оценка включает смерти за пределами поля боя.',
    koreaEstimateScope: 'Только погибшие мирные жители Северной и Южной Кореи.',
    noScene: 'Сцена пока недоступна.',
    overview: 'Обзор войны',
    sceneLoading: 'Сцена загружается',
    sceneError: 'Не удалось загрузить сцену.',
    sceneRetry: 'Повторить',
    sceneRestart: 'Перезапустить',
    sceneSound: 'Звук',
    sceneSoundUnavailable: 'Не удалось включить звук.',
    sceneNote: 'Число юнитов задаёт условный масштаб сцены. Оценка погибших приведена отдельно.',
    episodeScope: 'Смерти от атомной бомбардировки в городе за указанный период.',
    continents: ['Северная Америка', 'Южная Америка', 'Европа', 'Африка', 'Азия', 'Австралия'],
  },
  en: {
    ...startupCopy.en,
    language: 'Language',
    interfaceSound: 'Interface sounds',
    worldMap: 'World map',
    mapDescription: 'Select a marker to open a war card. Use the arrow keys to move between markers.',
    mapScale: 'UCDP estimates',
    scaleLow: 'Fewer deaths',
    scaleHigh: 'More deaths',
    scaleDetails: 'How to read the scale',
    scaleScope: 'Shades show UCDP estimates for the years observed. If several flags share a point, its shade represents the largest individual estimate.',
    mapHistory: 'Historical estimates',
    mapUnknown: 'No data',
    mapAnchors: 'Markers represent regions approximately. Halo size does not show the area of fighting.',
    mapSource: 'Land geometry · Natural Earth',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    zoomReset: 'Show the whole world',
    flagGroup: 'Flags at this point',
    close: 'Close',
    back: 'Back to the map',
    deaths: 'Deaths',
    estimatePeriod: 'Estimate period',
    episodeDate: 'Event date',
    estimateScope: 'What the estimate covers',
    sources: 'Sources',
    geography: 'Geography',
    context: 'Brief history',
    unknown: 'No data',
    approximate: 'About',
    moreThan: 'More than',
    atLeast: 'At least',
    illustrativeAnchor: 'Illustrative marker for navigation.',
    anchorSource: 'Basis for map placement',
    anchorCoordinates: 'Landmark coordinates',
    reportedRange: 'Source range',
    episodes: 'Landmark episodes',
    ucdpScope: 'Battle-related deaths. The figure totals UCDP observations for the period shown.',
    ucdpLimit: 'The observation period may cover only part of the conflict.',
    historicScope: 'A separate historical estimate, outside the UCDP battle-death scale.',
    ww1EstimateScope: 'Estimated total deaths. The source leaves the breakdown unspecified.',
    ww2EstimateScope: 'Estimated total deaths, including civilians killed by famine, genocide and bombing.',
    usCivilEstimateScope: 'Deaths directly attributable to the war as defined by the source, including deaths outside the battlefield.',
    koreaEstimateScope: 'Deaths among North and South Korean civilians only.',
    noScene: 'The scene is not available yet.',
    overview: 'War overview',
    sceneLoading: 'Loading the scene',
    sceneError: 'The scene could not be loaded.',
    sceneRetry: 'Try again',
    sceneRestart: 'Restart',
    sceneSound: 'Sound',
    sceneSoundUnavailable: 'Sound could not be enabled.',
    sceneNote: 'Unit counts set the scale of the illustrative scene. The death estimate is shown separately.',
    episodeScope: 'Deaths caused by the atomic bombing in the city during the period shown.',
    continents: ['North America', 'South America', 'Europe', 'Africa', 'Asia', 'Australia'],
  },
} as const;

export type Locale = keyof typeof copy;

export const sceneTerrainCopy = {
  ru: {
    'ww2-overview': { note: 'Начальный зимний ландшафт отсылает к Восточному фронту 1943 года.', source: 'Мемориальный музей Холокоста США' },
    hiroshima: { note: 'Мотив местности — город на равнине в дельте реки Ота.', source: 'История Хиросимы' },
    nagasaki: { note: 'Мотив местности — долина Ураками и склоны холмов.', source: 'Архив Нагасаки' },
  },
  en: {
    'ww2-overview': { note: 'The opening winter landscape evokes the Eastern Front in 1943.', source: 'US Holocaust Memorial Museum' },
    hiroshima: { note: 'The terrain is inspired by the city on the flat Ōta River delta.', source: 'History of Hiroshima' },
    nagasaki: { note: 'The terrain is inspired by the Urakami valley and its hillsides.', source: 'Nagasaki city archive' },
  },
} as const satisfies Record<Locale, Record<string, { note: string; source: string }>>;

const scopeKeys: Readonly<Partial<Record<string, Exclude<keyof typeof copy.en, 'continents'>>>> = {
  'history:ww1': 'ww1EstimateScope',
  'history:ww2': 'ww2EstimateScope',
  'history:us-civil': 'usCivilEstimateScope',
  'history:korea': 'koreaEstimateScope',
};

export function historicEstimateScope(id: string, locale: Locale): string {
  return copy[locale][scopeKeys[id] ?? 'historicScope'];
}

export function formatPeriod(period: { from: number; to: number }): string {
  return period.from === period.to ? String(period.from) : `${period.from}–${period.to}`;
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US').format(value);
}

export function formatDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}
