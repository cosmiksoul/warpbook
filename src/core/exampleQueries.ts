// 2 product-analytics recipes from the cookbook, ported BigQuery -> DuckDB, over
// the demo tables `demo_users` (parquet, typed) + `demo_payments` (csv). payments
// columns are cast explicitly (CAST(... AS DATE/DOUBLE/BIGINT)) so a recipe runs
// whether or not the table has been typed: those casts accept both the typed
// column and its all-VARCHAR form. `day` is formatted as an ISO date STRING
// (strftime) so it reads as a date in the grid — and ISO strings still sort
// chronologically, keeping the cumulative window / ORDER BY correct.
export const EXAMPLE_QUERIES: { title: string; sql: string }[] = [
  {
    title: 'Выручка по дням (накопительно)',
    sql: `SELECT day,
       sum(daily_revenue) OVER (ORDER BY day) AS cumulative_revenue,
       daily_revenue
FROM (
  SELECT strftime(CAST(DateUTC AS DATE), '%Y-%m-%d') AS day,
         sum(CAST(RevenueUSD AS DOUBLE)) AS daily_revenue
  FROM demo_payments
  GROUP BY 1
)
ORDER BY day;`,
  },
  {
    title: 'A/B-uplift: конверсия в оплату',
    sql: `SELECT u.ControlOrTest AS variant,
       count(DISTINCT u.UserID) AS users,
       count(DISTINCT p.UserID) AS payers,
       round(100.0 * count(DISTINCT p.UserID) / count(DISTINCT u.UserID), 2) AS conversion_pct
FROM demo_users u
LEFT JOIN demo_payments p ON CAST(p.UserID AS BIGINT) = u.UserID
GROUP BY 1
ORDER BY 1;`,
  },
]
