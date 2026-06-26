-- quackbook M1 — сценарий приёмки
-- 1) Брось в dropzone оба файла: fixtures/events.csv и fixtures/metrics.parquet.
-- 2) Запускай запросы по одному (Ctrl/Cmd+Enter или кнопкой ▶).
--    «в табе источника» = кликни источник в рейле (откроется его таб);
--    для произвольных запросов жми «+» (пустой таб).

-- [1] Parquet хранит РОДНЫЕ типы. Кликни «metrics» в рейле:
--     схема = country VARCHAR · day DATE · signups INTEGER · revenue DOUBLE
--     (у events.csv все колонки VARCHAR — типизация будет в M2). Грид:
SELECT * FROM metrics;

-- [2] Pruning-подсветка. В табе источника «metrics» замени запрос на этот —
--     рейл подсветит только country и revenue (2 / 4), остальные притухнут:
SELECT country, revenue FROM metrics;

-- [3] Агрегат → BAR-чарт (есть числовая колонка n). Тогл «график»:
SELECT country, count(*) AS n FROM events GROUP BY 1 ORDER BY n DESC;

-- [4] DATE по X → LINE-чарт (а не bar). Тогл «график»:
SELECT day, sum(revenue) AS revenue FROM metrics GROUP BY day ORDER BY day;

-- [5] JOIN CSV × Parquet в одной in-memory DuckDB:
SELECT e.country, count(*) AS events, max(m.revenue) AS peak_revenue
FROM events e
JOIN metrics m ON e.country = m.country
GROUP BY e.country
ORDER BY events DESC;

-- [6] UNION между файлами. Числовой колонки НЕТ → тогл «график» выключен (ожидаемо):
SELECT country, 'event' AS kind FROM events
UNION ALL
SELECT country, 'metric' AS kind FROM metrics;

-- Ещё руками: «+» → пустой «Запрос N»; × закрывает таб; Reset чистит всё;
-- hard-reload (Ctrl+Shift+R) → пусто (данные живут только в памяти вкладки).
