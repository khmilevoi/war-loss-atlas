# Размещение

Подготовлен выпуск проекта `war-atlas`: private GitHub `khmilevoi/war-loss-atlas`, ветка `main`, публичный адрес `https://war-atlas.iiskelo.com`. На этапе подготовки это конфигурация, а не утверждение об уже работающем сайте.

22.10.2026: локальный Docker client 29.6.2 и Compose v5.3.1 доступны. `docker compose config --format json` подтвердил service `web`, target `runtime`, expose 3000 и отсутствие fixed host ports. `docker build --progress plain -t war-loss-atlas:audit .` завершился до сборки: pipe Docker Desktop Linux Engine отсутствует. Docker Desktop не запускался. Поэтому сборка и runtime образа должны быть подтверждены настоящим rpi build после независимого review.

Следующий этап: проверить private visibility, push проверенного commit, `rpi deploy --server home`, read-only deploy key, точный развёрнутый SHA, healthy container и публичные HTTPS `/health`, `/`, `/data`, assets, CSV и мобильные/fallback взаимодействия. Фактический результат и SHA добавляются после выполнения; удалённые изменения пока не заявлены.
