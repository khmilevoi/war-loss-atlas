# Стартовый набор для анализа данных

На данных UCDP 26.1 можно воспроизвести годовые оценки числа погибших в результате преднамеренного насилия против гражданских за 1989–2025 годы. Одна запись исходного CSV описывает одного исполнителя за один год. Для запуска нужен Python 3.10 или новее. SQLite входит в стандартную библиотеку Python.

Из корня репозитория выполните:

```sh
python starter/osv.py
python starter/osv.py --check
```

Первая команда записывает таблицу в `starter/work/annual_by_actor_type.csv`. Вторая сверяет результаты Python и SQL с [контрольной таблицей](expected/ANNUAL_BY_ACTOR_TYPE.csv). В исходнике 1 408 записей, а в результате 111 строк — по три категории на каждый год. Нижняя, основная и верхняя оценки UCDP суммируются отдельно. Их диапазон не является статистическим доверительным интервалом. У пустых групп нулевая сумма, а при пропусках таблица показывает сумму доступных значений и число пропусков.

Для включения исполнителя в годовой ряд UCDP применяет порог в 25 погибших по основной оценке. Поле `location` указывает затронутые страны и не распределяет число погибших между ними. [Описание полей и охвата UCDP](https://ucdp.uu.se/downloads/nsos/ucdp-onesided-261.pdf)

## Первый вклад

1. Создайте ветку и запустите обе команды.
2. Добавьте свой SQL-запрос рядом с [примером](annual_by_actor_type.sql), например посчитайте пропуски в поле `best` по годам. Заголовок примера перечисляет поля временной таблицы `source`. Загрузчик проверяет уникальность пары `actor_id, year` при чтении CSV.
3. В запросе на слияние укажите, что проверили, на какой версии данных и какие строки результата изменились. Исправления к данным храните отдельно, с идентификатором строки, ссылкой на источник и объяснением. Файлы из `starter/work/` локальные.

Чтобы выполнить свой запрос, сохраните его как `starter/my_query.sql`, запустите `python` из корня проекта и введите:

```python
from pathlib import Path
from starter.osv import BUNDLED_INPUT, read_source, run_sql

rows = read_source(BUNDLED_INPUT)
print(run_sql(rows, Path("starter/my_query.sql")))
```

## Источник

[Исходный CSV](data/OneSided_v26_1.csv) скопирован побайтно из архива UCDP One-sided Violence Dataset 26.1. Версия, ссылка и SHA-256 записаны в [реестре входов](sources.csv). Для крупного набора добавьте запись с путём и условиями доступа. Набор можно получать у издателя либо из отдельной общей папки, если условия разрешают передачу. [Страница набора](https://ucdp.uu.se/downloads/#onesided) · [Описание полей](https://ucdp.uu.se/downloads/nsos/ucdp-onesided-261.pdf) · [Лицензия CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

- Davies, S., Pettersson, T. и Öberg, M. (2026). *Organized violence 1989–2025, and violent political protests*. [Journal of Peace Research](https://doi.org/10.1093/jopres/xjag046)
- Eck, K. и Hultman, L. (2007). *One-Sided Violence Against Civilians in War: Insights from New Fatality Data*. [Journal of Peace Research](https://doi.org/10.1177/0022343307075124)
