# Проверка выпуска

Базовый принятый интерфейс: `edb0db92d9e42ba5f916f68bf713b3086bdfae27`; финальный независимый review всей ветки на `e2a492fa82cc92ef6e74f880b2dbcc4229e209d5` — PASS, замечаний нет. Дата 22.10.2026. Репозиторий содержит только приложение и разрешённые источники. Настоящая rpi build/runtime и HTTPS проверены; см. [размещение и оговорку DNS](deployment.md).

| Требование | Проверка и доказательство |
|---|---|
| Полный источник, определения, суммы, null/0 и CSV | [Независимый аудит](data-audit.md); data/selectors unit tests; `npm run data:import`, `npm run data:check` |
| SSR на двух страницах, request isolation, bootstrap/hydration | 7 SSR/HTTP unit tests; `npm run test:server`; production browser suite |
| Все 1650 строк, bounded DOM, End/resize/keyboard, полный filtered CSV | `tests/browser/atlas.spec.ts`, actual Chrome; CSV сравнивается с полным независимым разбором source |
| Globe hover/tap/keyboard, совпавшие ID, pin/repeat/Escape | Принятый Task5: реальные canvas и группы 2/9 ID; production browser smoke |
| 360 px, reduced motion, WebGL/import failure, native navigation | Browser suite; принятые desktop/mobile снимки и ручная проверка контроллера сохранены в рабочем протоколе вне поставки |
| Границы распространения | `tests/public.test.ts`: allowlisted package PASS, 7 запрещённых путей FAIL, payload/key FAIL, удалённый historical Git файл FAIL; затем scanner GREEN |
| Tree, bundle, Git index и все исторические blobs | `npm run public:check`; sourcemaps/unknown data/архив/секреты запрещены; npm lock фиксирует third-party зависимости |
| Минимальный runtime | Multi-stage/default-deny; Compose config PASS; настоящая rpi image build, non-root allowlist/scan и runtime HTTP PASS |
| Private source и публичный healthy HTTPS | PRIVATE API + read-only deploy key; source SHA parity; live HTTPS/data/assets и 8 Chrome-проверок PASS с раскрытой временной DNS-оговоркой в [deployment](deployment.md) |

Автоматический scanner проверяет явные пути и известные сигнатуры payload/секретов; он дополняет проверку происхождения и exact diff, не доказывает отсутствие любого теоретически возможного секрета. Локальные node_modules и протоколы не отправляются; runtime-зависимости устанавливаются `npm ci --omit=dev` из lockfile. В bundle нет sourcemaps. Lazy 3D chunk около 2,07 MB (gzip 599 KB) даёт известное предупреждение Vite: загрузка отложена, текст/список доступны без WebGL. Скорость на каждом устройстве не аттестуется. Проверен установленный Chrome; другие браузеры отдельно не заявлены.

## Результаты Task6 до публикации

Свежие проверки: `npm test` — 71/71, 4 файла; `npm run typecheck` — exit 0; `npm run build` — client и SSR exit 0; `npm run test:server` — /, /data, /health, 404, assets, attribution и source exclusion PASS. `npm run data:import` оставил все data/src-data без diff; `npm run data:check` подтвердил SHA и manifest.

`npm run public:check` проверяет текущее дерево/dist, все достижимые Git file versions и index. Scanner сначала дал 9 ожидаемых провалов на запрещённых фикстурах, затем GREEN; отдельная direct CLI регрессия также проверена RED→GREEN. Старый тест повреждения rendering adapter сохранён: вызывает тот же экспортированный CLI runner явно, импорт scanner больше не имеет побочных эффектов.

Compiled Node server на 4173, actual Google Chrome: 8/8 production browser checks PASS (17,4 с), с нулём app page/console errors. Точная выборка:

```sh
npm run test:browser -- --grep 'globe unavailable|globe reduced motion|globe import rejection|globe late module|virtual table keeps|virtual table search|virtual table responds|native development navigation' --reporter=line
```

Проверены последний native ряд, ограниченный DOM, полный filtered CSV, resize/360 px, reduced motion, WebGL fallback, rejection/late-load hashed module и direct query/native Back/hydration. Перехват отказа модуля сначала провалился на production URL, затем после поддержки hashed asset прошёл; приложение не менялось. Полный development набор повторно не запускался: Task5 уже принят с отдельными canvas/cluster/pinning доказательствами, изменения Task6 не меняют UI.

Compose config PASS; локальный daemon отсутствует. После review настоящие rpi image build/runtime, private GitHub, read-only key и public HTTPS проверены по [протоколу размещения](deployment.md). Полный SSR payload обеих live страниц равен local verified JSON; все client assets совпали по SHA256. 8/8 actual hosted Chrome проверок PASS, 18,4 с, normal TLS; из-за локального upstream negative DNS cache использован только per-process lookup публичного DNS, без отключения certificate validation. Свежие live desktop1536/mobile360 снимки осмотрены; page overflow отсутствует. Подробные доказательства и независимые review сохранены в рабочем протоколе; исследовательский архив не изменён.
