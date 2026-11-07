# Данные и анализ организованного насилия

В репозитории доступны три годовых набора UCDP 26.1. Их можно анализировать отдельно, сохраняя исходную единицу наблюдения. Для первого расчёта запустите из корня проекта `python starter/osv.py --check`. Команда проверит, что Python и SQL воспроизводят контрольную таблицу по годам и типам исполнителя. [Инструкция и пример SQL](../starter/README.md)

## Какие данные доступны

| Набор | Единица наблюдения | Годы | Строки |
| --- | --- | --- | ---: |
| [UCDP Battle-Related Deaths](../data/ucdp-conflict-year.csv) | Конфликт с участием государства за год | 1989–2025 | 1 650 |
| [UCDP Non-State Conflict](../data/ucdp-v26.1/NonState_v26_1.csv) | Конфликт между негосударственными группами за год | 1989–2025 | 1 821 |
| [UCDP One-sided Violence](../starter/data/OneSided_v26_1.csv) | Исполнитель преднамеренного насилия против гражданских за год | 1989–2025 | 1 408 |
| UCDP/PRIO Armed Conflict, отдельная загрузка | Вооружённый конфликт с участием государства за год | 1946–2025 | 2 816 |

Для первых двух наборов и UCDP/PRIO строку определяет пара `conflict_id, year`, для одностороннего насилия — `actor_id, year`. Нижняя, основная и верхняя оценки отражают расхождения между источниками UCDP. Суммируйте каждую оценку отдельно и считайте пропуски. Перед сравнением проверьте определения и охват. Число строк измеряет количество записей соответствующего типа, а выводы о мотивах участников требуют отдельных источников.

[Контрольная таблица One-sided Violence](results/osv-annual-totals.csv) содержит 37 годовых итогов из ранее проверенного расчёта. Чтобы сверить их, суммируйте показатели по типам исполнителя внутри каждого года в выводе стартового скрипта. Агрегация отражает только случаи, вошедшие в UCDP.

## Как получить дополнительный набор

[Реестр источников](sources.csv) содержит ссылки издателя, имена файлов в архивах и SHA-256 исходных CSV. Для UCDP/PRIO скачайте ZIP по ссылке из строки `ucdp-prio-acd`, извлеките указанный CSV по пути из реестра и сверьте размер и хеш перед расчётом. Если редакция поменялась, добавьте новую запись с её версией и хешем, сохранив прежнюю.

## Как добавить анализ

Укажите набор и версию, единицу наблюдения, ключ записи, фильтры и обработку пропусков. Сохраняйте исходный CSV побайтно, а исправления и производные таблицы оформляйте отдельно. Для нового источника сначала проверьте условия распространения и добавьте запись в реестр.

## Атрибуция

Наборы опубликованы Uppsala Conflict Data Program под CC BY 4.0. Входные CSV сохранены побайтно. Годовая таблица One-sided Violence — производный результат проекта на основе данных UCDP. [Центр загрузок UCDP и условия](https://ucdp.uu.se/downloads/) · [Лицензия CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

- Для всех четырёх наборов. Davies, S., Pettersson, T. и Öberg, M. (2026). *Organized violence 1989–2025, and violent political protests*. [Статья](https://doi.org/10.1093/jopres/xjag046)
- Battle-Related Deaths. [Описание полей v26.1](https://ucdp.uu.se/downloads/brd/ucdp-brd-codebook-261.pdf)
- Non-State Conflict. Sundberg, R., Eck, K. и Kreutz, J. (2012). *Introducing the UCDP Non-State Conflict Dataset*. [Статья](https://doi.org/10.1177/0022343311431598) · [Описание полей v26.1](https://ucdp.uu.se/downloads/nsos/ucdp-nonstate-261.pdf)
- One-sided Violence. Eck, K. и Hultman, L. (2007). *One-Sided Violence Against Civilians in War: Insights from New Fatality Data*. [Статья](https://doi.org/10.1177/0022343307075124) · [Описание полей v26.1](https://ucdp.uu.se/downloads/nsos/ucdp-onesided-261.pdf)
- UCDP/PRIO Armed Conflict. Gleditsch, N. P., Wallensteen, P., Eriksson, M., Sollenberg, M. и Strand, H. (2002). *Armed Conflict 1946–2001: A New Dataset*. [Статья](https://doi.org/10.1177/0022343302039005007) · [Описание полей v26.1](https://ucdp.uu.se/downloads/ucdpprio/ucdp-prio-acd-261.pdf)
