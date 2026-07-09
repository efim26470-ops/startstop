# ReflexLab

Минималистичный PWA-тренажёр реакции для GitHub Pages. Работает полностью локально: рекорды, тема, звук и настройки хранятся в браузере через `localStorage`.

## Режимы

- **Tiles** — нажимай подсвеченную плитку.
- **Race** — стартовые огни, реакция на зелёный сигнал.
- **Aim** — быстрые попадания по появляющимся целям.
- **Memory** — повторяй световую последовательность.
- **Matrix** — нажимай числа по порядку.
- **Color** — тест Струпа: выбирай цвет текста, а не слово.

## Темы

Reflex Dark, Soft Light, Neon Pulse, Ember, Ocean, Sakura, Matrix.

## Публикация на GitHub Pages

1. Распакуй архив.
2. Загрузи файлы в корень репозитория.
3. Включи GitHub Pages: `Settings → Pages → Deploy from branch → main / root`.
4. Открой опубликованный URL.

## iPhone / PWA

Открой сайт через Safari → Поделиться → На экран Домой. Иконки и manifest уже добавлены.

## v2 mobile visual fix

- One-screen iPhone layout: body scrolling disabled on mobile, game is fitted into the visible viewport.
- Race mode reworked for compact vertical layout: lights, status text, and start button no longer overlap.
- All six modes fit in one row on narrow screens.
- HUD and timer card are reduced on iPhone Safari/PWA to avoid clipping.
- Bottom instruction is hidden in Race mode on mobile to remove duplicate text and save height.
- Theme styling stays enabled; records and PWA installation remain unchanged.
