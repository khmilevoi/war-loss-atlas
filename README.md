# Пиксельный атлас войн

Двуязычная карта с историческими справками, оценками потерь и пиксельными сценами. Атлас использует Reatom Core для состояния и навигации и `@reatom/jsx` для интерфейса. [Русская версия](https://wars.iiskelo.com/ru/) · [English version](https://wars.iiskelo.com/en/) · [Концепт и спецификация](../docs/superpowers/concepts/pixel-war-atlas/README.md).

## Запуск и проверка

Нужны Node.js 24 и npm. Выполните команды из каталога `web-atlas/`.

```sh
npm ci
npm --prefix pixel ci
npm --prefix pixel run dev
```

Откройте `/ru/` или `/en/` по адресу, который выведет Vite.

```sh
npm test
npm run typecheck
npm --prefix pixel test
npm --prefix pixel run build
npm run public:check
npm --prefix pixel run test:browser
```

Статическая сборка находится в `dist/pixel/`. Браузерные тесты используют Google Chrome и проверяют эту сборку.

## Данные

Общий каталог содержит 1650 строк «конфликт–год» UCDP 26.1 за 1989–2025 годы, 202 конфликта и четыре исторические оценки с отдельными определениями. Доступные оценки относятся к периодам и типам потерь, указанным в карточках. Пропуск отличается от нулевой оценки.

`npm run data:import` воспроизводит каталог из включённых CSV и геоданных. `npm run data:check` сверяет данные и файлы поставки. `npm run public:check` также проверяет Git-индекс и всю достижимую историю. [Манифест и контрольные суммы](data/manifest.json) · [Атрибуция UCDP](public/licenses/ATTRIBUTION.md) · [Условия Natural Earth](public/licenses/NATURAL-EARTH.txt) · [Источники исторических оценок](public/licenses/HISTORICAL-FACTS.md).

## Развёртывание

`docker compose -f docker-compose.pixel.yml config` проверяет конфигурацию. Статический сервер Nginx слушает порт 8080, `/health` возвращает 200. Опубликованное окружение RPi — `war-atlas--pixel` (`--env pixel`). [Протокол выпуска](../docs/superpowers/plans/2026-11-07-pixel-war-atlas-release.md).
