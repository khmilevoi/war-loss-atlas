# Источники атласа

UCDP Battle-Related Deaths Dataset 26.1, conflict-year, 1989–2025 — Uppsala Conflict Data Program, Uppsala University. [Официальная загрузка](https://ucdp.uu.se/downloads/). Лицензия [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); правообладатель не одобрял это приложение.

Цитирование именно BRD-раздела download center, проверено 22.10.2026: Shawn Davies, Therése Pettersson, Magnus Öberg (2026), *Organized violence 1989–2025, and violent political protests*, Journal of Peace Research, [DOI](https://doi.org/10.1093/jopres/xjag046). UCDP входит в DEMSCORE и финансируется Swedish Research Council, infrastructure grant 2021-00162.

CSV сохранён побайтно. Производный JSON сохраняет все 25 native полей: пустое → null, year и три оценки → числа; остальные значения, включая идентификаторы и списки dyad_id, → строки. По одному conflict_id суммируется каждое непустое значение уникального conflict_id:year ровно один раз. Все пропуски учитываются отдельно; wholly missing остаётся null. Нулей вместо пропусков нет. Результат охватывает наблюдаемый срок источника, не полный срок войны. Между первым и последним наблюдением могут быть пропущенные годы.

Это боевые потери в определении UCDP, не вся смертность от войн. Low/high — оценки источника, не доверительный интервал. Нативные field names и значения не заменены переводом. Авторские названия, агрегация и навигационная география отделены от исходных полей.

Реестр происхождения, проверки и контрольные суммы: data/manifest.json; источники: src/data/sources.json. Импорт: npm run data:import; проверка: npm run data:check. Исследовательский архив не требуется для воспроизведения — разрешённый CSV включён в приложение.

Made with [Natural Earth](https://www.naturalearthdata.com/). Суша и координаты подписей public domain, версия Git commit ca96624a56bd078437bca8184e78163e5039ad19; подробнее NATURAL-EARTH.txt. Исторические карточки имеют отдельные источники и определения, не прибавляются к UCDP; подробнее HISTORICAL-FACTS.md.

Шрифт заголовков [Alegreya](https://github.com/huertatipografica/Alegreya) используется по [SIL Open Font License 1.1](ALEGREYA-OFL.txt). Файлы WOFF2 для кириллицы и латиницы взяты из [Google Fonts](https://fonts.google.com/specimen/Alegreya).

Метки условны и служат навигации. Числа относятся к конфликтам целиком; распределение смертей по странам не показано. gwno_battle не используется для пространственного анализа или страновых итогов ([кодбук, физические страницы PDF 12–13](https://ucdp.uu.se/downloads/brd/ucdp-brd-codebook-261.pdf)). Декоративные точки суши не представляют людей или события.
