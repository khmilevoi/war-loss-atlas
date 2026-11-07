# Сгенерированные спрайты пиксельного атласа

В `originals/` лежат исходники встроенного ImageGen. Сборка использует версии `*-overhead.png` и исходник `generic-terrain.png`. Файлы `battle-topdown-*.png` собраны в ячейки 64 × 64 px. Порядок кадров слева направо, затем сверху вниз. [Стиль спрайтов](../../../docs/superpowers/specs/pixel-war-sprite-style.md) · [Таблица назначений](../../../docs/superpowers/specs/pixel-war-sprite-assignments.md).

| Файл | Сетка | Порядок кадров |
| --- | --- | --- |
| `battle-topdown-cold-war-units.png` | 3 × 2 | Оливковый стрелок, серо-синий стрелок, санитар, гусеничный бронетранспортёр, повреждённый бронетранспортёр, танк |
| `battle-topdown-contemporary-units.png` | 3 × 2 | Оливковый стрелок, серо-синий стрелок, санитар, колёсная машина, повреждённая колёсная машина, гусеничная машина поддержки |
| `battle-topdown-korea-units.png` | 3 × 2 | Пехотинец группы Смита, пехотинец Корейской народной армии, санитар, Т-34-85, повреждённый Т-34-85, 105-мм гаубица |
| `battle-topdown-generic-terrain.png` | 3 × 2 | Три варианта грунта, куст, камни, сухая трава |
| `battle-topdown-japan-terrain.png` | 2 × 2 | Грунт, жилой дом, грунт с мелким гравием, разрушенный дом |
| `battle-topdown-hiroshima-city.png` | 3 × 2 | Два типа деревянных домов и Выставочный зал. Во втором ряду те же здания после взрыва |
| `battle-topdown-nagasaki-city.png` | 3 × 2 | Жилые дома, промышленный цех и собор Ураками. Во втором ряду те же здания после взрыва |
| `battle-topdown-japan-civilians.png` | 3 × 2 | Житель в синем, жительница в бордовом, санитар, житель в охристом, житель со свёртком, житель в сером |
| `battle-topdown-japan-surfaces.png` | 4 × 2 | Грунт, склон, речная вода и дорога. Первый ряд до взрыва, второй после |

Стрелки смотрят вправо и отрисовываются в рамке 18 × 18 логических px. Ориентир для техники — 31 × 31. Тайлы и привязанные к ним природные детали выводятся в рамке 32 × 32. При упаковке убираем ореол порогом альфы 224 и приводим альфу к 0 или 255. Пехоту приводим к блокам 3 × 3 исходных px, палитре до девяти цветов и габаритам рабочих бойцов. Размеры кадров меняем ближайшим соседом. Непрозрачные тайлы получают общий цвет на границе.

В нейтральных сценах пехота и техника появляются вместе. Кадры повреждений заменяют целые машины после их уничтожения. Нейтральные силуэты не привязаны к армиям или конкретным моделям техники. У Осана используется отдельный комплект 1950 года. Японский лист изображает условный жилой квартал. Состояния домов основаны на опубликованных описаниях и фотографиях городской застройки до и после бомбардировки. [Архив города Нагасаки](https://nagasakipeace.jp/en/search/record/photo/part_2_01.html) · [История Хиросимы](https://www.city.hiroshima.lg.jp/english/overview/1029882/1009928.html).

## Сборка из сохранённых исходников

```powershell
python web-atlas/scripts/prepare-generated-sprites.py
python web-atlas/scripts/build-scene-sprites.py
```

Контрольные суммы SHA-256 исходников и листов с кадрами.

```text
a7ccc77f038ccdc44ee831995359bdbdcd6dd4580419aff76f13c64116612a91 cold-war-units-overhead.png
b29339627708c5d4e90d197ba608acdf6064a5886e68776368d7030c1fafee0b contemporary-units-overhead.png
ce40110060f0d1413aedf2341551b35a4486a5281c38865f99e1db280e76d132 generic-terrain.png
21689deed04291804eaff3ffce2c4e39e4940f7cc876c19a67952fd4e40a4e6a japan-terrain-overhead.png
9cf0e1532880083b722549d7cc1b4d5c3646d64e56a2f7602fc898b6e6c544db korea-units-overhead.png
3a49eb8f4e2f34ba42271d88e2b5e2774515418908e574311ae6bf63f574df4a battle-topdown-cold-war-units.png
9aa420e7d86aa6390f49cf0a4f08623d599c824d5a64fb72855dcef3d3c9e2b6 battle-topdown-contemporary-units.png
16d955ca2e9473caa61788cdb2e12ad47df59991efa58901defe63282ec48076 battle-topdown-generic-terrain.png
db98e36d53c19725baa30559945275b826364c216146d77e4b8babfdfe0f02f1 battle-topdown-japan-terrain.png
0dfc17f744e075821e90f5e55af97c56fec3d68ad5bcde0e49fc6881c43f5f4c battle-topdown-korea-units.png
a18391c65ef3dcff6cbc4219dc821acb5efda2f89a6547d6431000aa0afee68d legacy-pose-template.png
ede69c03407da8365b004508040216d60d18cd4ca3f49e0ff371732f59b53283 hiroshima-city-overhead.png
7e548f61a34952356822a1e7388a32dd3585b589fdeb82ac3d18c03fe84d3aef nagasaki-city-overhead.png
6fa5ec75ad3e27b9beec5e68f4c0aebdae45472e51d0c3fa10ddd924dab72431 japan-civilians-overhead.png
8385a8a999a3f8178a42cbb89ef24771922554fc7c85f829def7674248b40f8f battle-topdown-hiroshima-city.png
e3241e6b5a046b2ebf5b73f6e9393227765f2a7fafb6c6fc3e4fb10a8df46f78 battle-topdown-nagasaki-city.png
c13bcd678a82aed4f9fac5583c9416912f867fb7d608b15b7e13a5c5ffad225a battle-topdown-japan-civilians.png
```

## Хиросима и Нагасаки

Три листа созданы встроенным ImageGen. Для зданий эталоном служил [рабочий лист местности](../battle-preview/battle-topdown-terrain.png), для горожан — [шаблон поз](legacy-pose-template.png). В финальном кадре используется последний кадр [готового листа обгоревшего экипажа](../battle-preview/battle-topdown-tank-crew.png). [Снимки Хиросимы до и после](https://www.city.hiroshima.lg.jp/tourism-culture/history/1003068/1027532/1027533/1008360.html) · [Довоенные снимки Выставочного зала](https://www.city.hiroshima.lg.jp/tourism-culture/history/1003068/1027528/1027530/1032139/1032141.html) · [Коллекция Музея атомной бомбардировки Нагасаки](https://artsandculture.google.com/story/atomic-bombing-in-nagasaki-and-the-urakami-cathedral-nagasaki-atomic-bomb-museum/uwXRRfqvSwUA8A?hl=en).

Промпты задавали строго вертикальный вид сверху, жёсткие квадратные пиксели, прозрачность и сетку 3 × 2. Для Хиросимы запрошены два типа деревянных домов с черепицей и Выставочный зал с медным куполом, во втором ряду — те же пятна застройки с обломками и каркасом купола. Для Нагасаки запрошены черепичные жилые дома, цех с рёбрами металлической кровли и кирпичный собор с двумя башнями, во втором ряду — те же пятна застройки после обрушения. Для горожан запрошены шесть невооружённых фигур 1945 года с рабочими куртками, головными уборами и простыми свёртками. В кадре видны макушка, плечи и руки.

## Цветовая доводка Хиросимы и Нагасаки

Сборка использует исходники `*-overhead-polished.png`. Встроенный ImageGen переработал цвета крыш, кладки, руин и одежды с опорой на предыдущие листы. Три контрольные суммы `battle-topdown-*` для этих наборов в списке выше относятся к предыдущей версии.

```text
7dad708c685605483d3edd8ba097529ab27237294aa9a4828d506bbace12364e hiroshima-city-overhead-polished.png
97af29f85b467a99e9ac7a6e27bf4edad83a6dcb918d17015d9ac81629f25f3f nagasaki-city-overhead-polished.png
345cc8afaf13018eca483a18d4c65da48b2e2641ed3b1cf96b926d1d0234755c japan-civilians-overhead-polished.png
dc6339103306e4572a9864efd6d195d15374a2c1c5c2326afc0ed09bb3f058ec battle-topdown-hiroshima-city.png
d3685bd9dca5cf0a97515c92186c31f2b116ad796b7f5229a8468d56809b5594 battle-topdown-nagasaki-city.png
e6eeb680cb3a68eaebda9fe832ef380f11a9c34f1c4c43f01fe1e59e39cc288d battle-topdown-japan-civilians.png
```

Общая часть промпта для трёх листов.

```text
Edit the attached 3-column x 2-row sprite sheet for a historical top-down pixel atlas. This is a focused art polish. The original is too muddy and dark. Preserve the original sprite identity, cell order, horizontal orientation, strict perpendicular 90-degree overhead camera, flat pixel-art silhouettes, and similar footprints. Export exactly six separate centered sprites in an exact 3x2 grid of equally sized square cells. Fully transparent outside the shapes, spacious empty transparent gutters, no background checker, labels or framing. Hard-edged deliberately chunky console-era pixel art, strong silhouettes, clear dark plum or blue outlines, discrete 3-5 shade material ramps with brighter clearly visible accents, no anti-aliasing, soft lighting or realistic texture. Use top left light, with bright broad bands of highlight and substantial dark shadow bands, as visually rich as premium 16-bit adventure tile art. Prioritize shapes and contrast surviving in tiny 16–32px display. Art should feel handmade and historically grounded.
```

Дополнения для каждого листа.

```text
hiroshima-city
Top row, from left: twin timber homes with contrasting clay russet red Japanese tile roof and deep indigo-gray roof, clear tile bands and cream ridge; slender shop house with sapphire slate blue tile roof and a small brown extension; cream and warm-brown brick Hiroshima Exhibition Hall roof wings and a highly legible broad turquoise verdigris circular copper dome with pale highlights and dark teal geometry. Bottom row is exact same footprints after bomb damage: timber frames of warm chestnut-charcoal and ochre fragments with silver-blue broken tiles, no fires; then dark timber beams and subtle slate blue tile fragments; then the civic hall's unmistakable rust-copper open iron ring and pale broken masonry. Ruins have high silhouette contrast over dark ash but with restrained color, no fire and no visual special effects. Keep existing geometry particularly the dome, no facade visible.

nagasaki-city
Nagasaki's Urakami valley. Top row, from left: twin narrow 1945 Japanese homes with distinctive richly colored charcoal-blue and warm terracotta gable tiled roofs, cinnamon ridges and small ivory tile reflections; sawtooth industrial roof seen from straight above with alternating rich cool muted jade gray corrugated and pale warm zinc bands and distinct rectangular footprint; Urakami brick cathedral with bold warm red terracotta nave roof, cream stone ridges and two obvious square dark slate-blue tower caps together on left end. Bottom row: same footprints, open dark fractured wood and broken blue ceramic tile; torn parallel industrial gray-green ribs with clear highlight and dark cavities; ruined red-brown cathedral masonry perimeter with pale broken interior edges and two partly collapsed towers. No flames. Restrained ruin color but clear separation over dark gray ash.

japan-civilians
Six tiny compact civilians, no weapons or helmets. From directly overhead, show the TOP of the head offset slightly toward the east/right, bright broad fabric shoulders and small hands beside the head, hair highlights, only visible surface shapes, no faces and no visible legs. Strong dark perimeter with very legible large blocks of color on clothing (not dark ovals surrounded by a thin rim). Row 1 left to right: indigo work jacket and pale tan folded cloth, warm brick red jacket and dark hair bun, olive-khaki orderly with cream satchel. Row 2 left to right: golden ochre jacket and blue fabric cap, warm jade teal workwear with pale wrapped bundle, light slate-blue worker jacket and dark hair. Each civilian should visibly read as a person and retain identity when downsampled to 14 pixels. One main fabric color, a generous highlight covering the upper shoulders, dark hair, and very few isolated accent pixels.
```

Второй проход для Нагасаки уточнил вид кровель строго сверху.

```text
Edit ONLY perspective errors in this finished sprite sheet. Retain exact grid, outer shape, scale, silhouettes, colors, hard pixels, alpha, and subjects. Use EXACT strict straight-down 90-degree orthographic roof plans for an existing top-down atlas. In upper-left houses replace the small front-facing window and doorway bands at the bottom edges with the last visible horizontal roof tile row and wide overhanging eave. Upper right cathedral, replace small front-facing side wall/window band under the lower eave with an extension of the stepped red tile roof plan and narrow ivory edges. In ruined cathedral, replace front-facing window openings on near and far walls with mottled rubble breaks in the outline, top surfaces of brick wall only. Preserve jade factory and other ruin shapes exactly. All surfaces are overhead as in a top-down tile map. Identical 3x2 equal square cells. Transparent background and interior holes remain clear. No gradients, blur, glow, text or border. Maintain the exact lovely bold navy and terracotta roofs and warm material highlights.
```

## Поверхности Хиросимы и Нагасаки

Лист из встроенного ImageGen опирается на [прежний набор грунта](battle-topdown-generic-terrain.png) и кадр Нагасаки из браузера. Каждая колонка содержит один материал. Верхний ряд показывает поверхность до взрыва, нижний — после. Сборка сводит противоположные кромки каждого тайла, чтобы фактура повторялась по всему полю без рамок.

```text
5e12dce8585389056abc8f924c0b0cd054cd85aebdbc27e2aca53682271258e6 japan-surfaces-overhead.png
c1753056c3179953a9606923f691245a1818f14f1b8715a01db8da62370124e7 battle-topdown-japan-surfaces.png
```

Промпт для листа.

```text
Create a NEW production texture atlas for the same Japanese 1945 pixel-art scenes as the provided game screenshot. Use the other image only as scale reference for the ground pixels. Focus exclusively on surfaces. Exact grid 4 columns by 2 rows; 8 equally sized tile regions, with NO gutters, labels, margins, separators or decorative borders. Output wide landscape aspect ratio 2:1 if possible. Tile interiors filled completely to each cell's edges, fully opaque. Draw strictly straight down from 90 degrees as a 16-bit adventure-game world tile. Each cell will tile independently. Vary texture at two scales: cohesive organic patches that fill one-sixth to one-third of the cell and sparse hand-placed pixel clusters inside them. At 64 pixels downsampled, all texture details are deliberate chunky hard pixels, not soft realistic noise or fine grain. Surface contrast moderately strong. No buildings, figures, corpses, UI, paths or roads inside grass cells, horizons, or volumetric effects.
TOP ROW, before the explosion, left to right:
(1) Low grassy ground between urban lots. Layer meadow green, yellow olive, and patches of warm dry packed earth; broad asymmetrical organic grass islands and small tufts, pebble groups and a few tiny clover highlights. Green grass dominant.
(2) Dense slope vegetation for Nagasaki valley. Dark pine and moss base with irregular overlapping jade and fern-green low shrub clusters, olive sunlit tops, sparse exposed sandstone. Distinct shades and readable shapes, foliage from strictly above.
(3) Teal river water with long slim softly jagged vertical current striations of deep jade, mid turquoise, sea green and sparse short pale green broken surface highlights. Reflections aligned mostly with the vertical current, quieter and darker overall than grass. No shores or objects. Legible when clipped to a 12–16 pixel-wide vertical river.
(4) Warm golden gray compacted sandy road texture with subtly mottled stone chips, sandstone/ochre patches and little tight clusters of worn rounded gravel. Flat surface. No striping, markings, curbs or directional edges.
BOTTOM ROW, after the explosion, corresponding surfaces left to right:
(1) Ash and scorched dirt in irregular charcoal, gray-taupe and umber patches, with restrained terracotta chips, pale dust clusters and scattered debris fragments. Soot and ash distinct, with no fire, craters or large objects.
(2) Hillside foliage scorched in patches, desaturated deep pine and olive-gray shrubs with smoky brown and slate clusters, warmer dust and sparse dry ochre vegetation.
(3) Darker river with teal-slate and jade-gray streaks of current, short pale gray broken reflections and sparse ochre silt. No objects, banks, waves or reflection of fire.
(4) Dark scorched road surface, ash-gray and warm smoky taupe with small cracks, charcoal and fine light gravel. Understated rubble chips. Same surface scale as top row. No marking or borders.
Make every cell distinct and suitable as a pure repeat tile. Never render scenery into this sheet.
```

## Промпты исправленной версии

Для юнитов использован [шаблон поз](legacy-pose-template.png) из исходных ячеек пехоты 14, 12 и 16, техники 9 и 6 и листа повреждений 2. Нумерация начинается с нуля. Ячейки собраны в 3 × 2 и увеличены ближайшим соседом в восемь раз. Для дома использован [рабочий лист местности](../battle-preview/battle-topdown-terrain.png). Контекст Осана сверён по [свидетельству участника боя](https://achh.army.mil/history/book-korea-taskforcesmith-burke/) и [материалу армии США](https://www.army.mil/article/83003/).

### cold-war-units-overhead

```text
Use the supplied 3-by-2 atlas as the exact geometry reference. Create a revised 3-by-2 sprite sheet, keeping the exact straight-down orthographic projection and positions. Transparent RGBA and wide clear gutters. East is right. First row three compact standing humans seen from DIRECTLY OVER the crown of the head, a flattened roughly circular footprint: visible top of headwear in the center, two shoulder pads on either side, tiny backpack sliver to the left and a horizontal rifle and just the top of small hands to the right. Full face, torso front, waist and legs are completely hidden below the shoulders. Aim for the silhouette in the template, which looks like a small rounded shape with a short bar sticking out, not a vertically elongated person. One very dark hard-edged outer contour, large opaque hard-square color clusters, exactly 7–10 flat colors per infantry sprite, no outlines between patches of the same equipment, no long visible chest rig. Strong muted olive/blue-gray/tan separation and lighter shoulder accents as in the existing Hotline Miami-style atlas. Infantry must read clearly in a 64px frame drawn at 18px. Second row vehicles are roof plans viewed perpendicular to the ground, with equally visible narrow tread strips on the top and bottom of the cell and no visible sidewalls or circles representing road wheels. 31px on field. The damaged vehicle keeps the same orientation and hull center as the intact vehicle. Only local square color clusters and clear outlines. No perspective, isometric, shadows, halo, labels, backgrounds, patches, decorative cell borders or checkerboard. Output a clean 1536x1024 equivalent of the exact six equal square cells in reference. Row 1 left to right: late Cold War olive steel-helmet rifleman; slate-blue soft-cap rifleman; khaki unarmed aid worker holding a pale medical satchel where the reference has the satchel. Row 2: roof of olive tracked APC, the same APC with a broken tread and dark hatch, and late Cold War generic medium tank roof with short right-pointing barrel. Generic period designs without faction symbols.
```

### contemporary-units-overhead

```text
Use the supplied 3-by-2 atlas as the exact geometry reference. Create a revised 3-by-2 sprite sheet, keeping the exact straight-down orthographic projection and positions. Transparent RGBA and wide clear gutters. East is right. First row three compact standing humans seen from DIRECTLY OVER the crown of the head, a flattened roughly circular footprint: visible top of headwear in the center, two shoulder pads on either side, tiny backpack sliver to the left and a horizontal rifle and just the top of small hands to the right. Full face, torso front, waist and legs are completely hidden below the shoulders. Aim for the silhouette in the template, which looks like a small rounded shape with a short bar sticking out, not a vertically elongated person. One very dark hard-edged outer contour, large opaque hard-square color clusters, exactly 7–10 flat colors per infantry sprite, no outlines between patches of the same equipment, no long visible chest rig. Strong muted olive/blue-gray/tan separation and lighter shoulder accents as in the existing Hotline Miami-style atlas. Infantry must read clearly in a 64px frame drawn at 18px. Second row vehicles are roof plans viewed perpendicular to the ground, with equally visible narrow tread strips on the top and bottom of the cell and no visible sidewalls or circles representing road wheels. 31px on field. The damaged vehicle keeps the same orientation and hull center as the intact vehicle. Only local square color clusters and clear outlines. No perspective, isometric, shadows, halo, labels, backgrounds, patches, decorative cell borders or checkerboard. Output a clean 1536x1024 equivalent of the exact six equal square cells in reference. Row 1: olive modern rifleman with blocky ballistic helmet top; slate-blue rifleman with low soft cap and plain webbing; muted tan unarmed medic carrying a pale satchel, no red helmet. Row 2: roof plan of a generic four-wheel utility car with only narrow black tires visible equally along both edges, the same car with a damaged hood, and an infantry support vehicle roof with narrow symmetrical treads. Generic period designs without faction symbols.
```

### korea-units-overhead

```text
Use the supplied 3-by-2 atlas as the exact geometry reference. Create a revised 3-by-2 sprite sheet, keeping the exact straight-down orthographic projection and positions. Transparent RGBA and wide clear gutters. East is right. First row three compact standing humans seen from DIRECTLY OVER the crown of the head, a flattened roughly circular footprint: visible top of headwear in the center, two shoulder pads on either side, tiny backpack sliver to the left and a horizontal rifle and just the top of small hands to the right. Full face, torso front, waist and legs are completely hidden below the shoulders. Aim for the silhouette in the template, which looks like a small rounded shape with a short bar sticking out, not a vertically elongated person. One very dark hard-edged outer contour, large opaque hard-square color clusters, exactly 7–10 flat colors per infantry sprite, no outlines between patches of the same equipment, no long visible chest rig. Strong muted olive/blue-gray/tan separation and lighter shoulder accents as in the existing Hotline Miami-style atlas. Infantry must read clearly in a 64px frame drawn at 18px. Second row vehicles are roof plans viewed perpendicular to the ground, with equally visible narrow tread strips on the top and bottom of the cell and no visible sidewalls or circles representing road wheels. 31px on field. The damaged vehicle keeps the same orientation and hull center as the intact vehicle. Only local square color clusters and clear outlines. No perspective, isometric, shadows, halo, labels, backgrounds, patches, decorative cell borders or checkerboard. Output a clean 1536x1024 equivalent of the exact six equal square cells in reference. Row 1: 1950 US infantryman with olive round steel helmet crown and simple wooden-stock rifle, 1950 North Korean infantryman with khaki cloth-cap crown and a wooden-stock rifle, US medical orderly with muted olive helmet and pale satchel. Row 2: top plan of a North Korean T-34-85 with rounded turret and long barrel, the exact same tank with blackened turret and broken track, and a simple US 105mm field howitzer with two wheels equally visible in the plan and split trail behind. For an illustrative scene of the engagement near Osan in July 1950. No insignia, no modern gear.
```

### japan-terrain-overhead

```text
Sprite sheet for strict vertical overhead game environment, directly matching the supplied working terrain and settlement reference. Exact grid of 2 columns x 2 rows of square tiles. Every tile has identical understated warm grey/beige packed dirt all the way to each edge, with sparse hard square pixels as in the old atlas; no gutters. Upper left bare dirt, upper right centered compact roof plan of a Japanese wooden house with simple charcoal ceramic tiles and ridge, lower left the same dirt with sparse small pebbles, lower right footprint of that same house after collapse with flat broken grey tiles and dark cross-bracing. The camera is EXACTLY at 90 degrees. Only the roof plan is visible in the intact tile; no front or side facade, no gable triangle or windows, no doors, no porch, no wall lip, no vertical planes, no neighboring shrubs, no lighting gradients or shadows, no visible horizon. Roof edges form a rectangle parallel to the tile edges, roof ridge centered, slopes shown as flat discrete two-tone bands with equally sized top and bottom edges. Simple 1945 residential building silhouette, no landmark and no modern details. Keep each house and rubble footprint within middle 60% of the cell. Authentic chunky hard pixels that survive at logical 32 px; match actual tile scale of the reference, not the more elaborate concept art.
```

## Промпты первого прохода

Три исходника первого прохода сохранены для истории. Универсальная местность из этого прохода остаётся в сборке.

```text
df0471b02f892066e5654501deb80a4422e972273b28a0063f2b64d71e6df4b7 cold-war-units.png
6bdbb0b431bccd15b5359a523989652b75e14faba7a37addec9242b15073b246 contemporary-units.png
8b9d0e499095ed863ccab53d463f51c90b76f4a7795faae5e18092e80c4b4008 japan-terrain.png
```

Для двух листов юнитов использованы исходные листы пехоты и техники. Для универсальной местности использовался показанный в чате лист местности. Для японского набора приложен исходный лист местности. [Референсы предпросмотра](../battle-preview/README.md).

### cold-war-units

```text
Create a strict straight-down 90 degree pixel art sprite sheet, following the supplied image for viewing angle, silhouette and proportions. Camera sees only the top of the circular helmet, shoulders spread above and below it, backpack to the west, both arms and the rifle pointing east. The overhead soldier is a small squat HORIZONTAL silhouette, wider east-west than north-south. Feet, face, legs and body height are hidden underneath the helmet and shoulders. Exactly three columns and two rows of equally spaced centered sprites on fully transparent RGBA with wide gutters. Top row late Cold War olive steel-helmet rifleman; slate soft-cap rifleman; khaki medic with pale satchel. Bottom row olive tracked APC; same exact APC damaged with broken track; generic short-barrel tank. On vehicles only roof, turret and upper tread strips are visible; treads visible symmetrically on BOTH upper and lower edges. No side faces or visible road wheel sidewalls. East points right for all objects. Muted block colors and darkest 1-pixel outer contour, sparse details, consistent true hard-edged pixels matching the reference. Production 64px cells, sheet can be rendered at nearest-neighbor integer enlargement. No shadows, haze, text, outlines around cells, insignia, gradient or surrounding texture.
```

### contemporary-units

```text
Create a strict straight-down 90 degree pixel art sprite sheet, following the supplied image for viewing angle, silhouette and proportions. Camera sees only the top of the circular helmet, shoulders spread above and below it, backpack to the west, both arms and the rifle pointing east. The overhead soldier is a small squat HORIZONTAL silhouette, wider east-west than north-south. Feet, face, legs and body height are hidden underneath the helmet and shoulders. Exactly three columns and two rows of equally spaced centered sprites on fully transparent RGBA with wide gutters. Top row modern neutral green ballistic-helmet rifleman with visible squared body armor; opposing slate soft-cap rifleman with vest; sandy medic with pale satchel. Bottom row neutral olive military 4-wheel utility vehicle; same exact vehicle with damaged hood; modern infantry support vehicle with short-barrel turret. Only the roof and upper tire or tread surfaces visible symmetrically on BOTH upper and lower edges, never any side faces or visible wheel sidewalls. East points right for all objects. Muted block colors and darkest 1-pixel outer contour, sparse details, consistent true hard-edged pixels matching the reference. Production 64px cells, sheet can be rendered at nearest-neighbor integer enlargement. No shadows, haze, text, outlines around cells, insignia, gradient or surrounding texture.
```

### generic-terrain

```text
Use case: stylized-concept. Production pixel art tiles and props for Pixel War Atlas. Strict 90-degree orthographic overhead like the terrain reference shown previously, with muted dusty soil, grey-olive vegetation, no implied region, season, architecture or named location. One sheet exactly 3 columns by 2 rows, equal square cells, no labels or lines. Top row three opaque seamless 64x64 intended ground tiles, filling each cell edge to edge: subdued dusty olive dirt, lightly pebbled variant, light worn dirt variant. Same medium neutral olive-brown tone at all tile boundaries, extremely subtle texture, no visual edges and no objects. Bottom row three separate small centered transparent props in their individual cells: small low scrub cluster, low rock pile, sparse patch of dry grass. Leave transparent gutters in bottom row. True low-resolution pixel art with hard square pixels and muted discrete shades, subtle flat shadows, no perspective, anti-aliasing or glow. Ground must be legible on repeat at logical size 32px. Transparent RGBA for props.
```

### japan-terrain

```text
Pixel War Atlas production sprite sheet for a symbolic Japanese residential district in 1945. Use supplied atlas sheet only for strict straight-down orthographic angle, restrained pixel texture, footprints and proportions. Four square cells arranged exactly in a 2 by 2 grid, no writing or gutters between cells. Every tile has the SAME flat unobtrusive desaturated grey-beige dirt ground to all edges, so the tiles can intermix. Upper left: empty packed earth. Upper right: one small ordinary wooden dwelling with dark charcoal ceramic gable roof directly seen from above. Lower left: empty packed earth with very faint fine gravel. Lower right: same dwelling footprint collapsed after blast, low rectangle of broken wood and grey tile fragments, subdued ash. Compact centered footprint leaving at least 20% clear at each cell edge. Clearly readable at 32 logical px. True sparse discrete 16-bit era pixel art, no visible walls, no isometric tilt, no modern street furniture, no text, no fire or people. Period inspiration from Nagasaki municipal pre-bombing and aftermath photographs, no named landmark or specific building reconstruction.
```
