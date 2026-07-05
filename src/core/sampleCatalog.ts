import { tableNameFromFilename } from './sql'
import { EXAMPLE_QUERIES } from './exampleQueries'

export interface SampleFile { path: string; name: string } // path под BASE_URL; name задаёт имя таблицы
export interface SampleSeedTab { title: string; sql: string }
export interface Sample {
  id: 'cookbook' | 'penguins' | 'taxi' | 'titanic'
  title: string
  blurb: string
  sizeLabel: string
  files: SampleFile[]
  seedTabs: SampleSeedTab[]
  featured?: boolean
  credit?: string
}

/** Витрина демо-датасетов: cookbook (featured) + три классических сэмпла.
 *  Имена таблиц через demo_-префикс файла (решение M8). Seed-SQL написан
 *  VARCHAR-устойчиво (CAST) — работает и до применения типов. */
export const SAMPLES: Sample[] = [
  {
    id: 'cookbook',
    title: 'SQL 101: продуктовая аналитика',
    blurb: 'платежи и юзеры дейтинг-приложения из учебника — 2 готовых рецепта',
    sizeLabel: '~1.3 МБ',
    files: [
      { path: 'demo/payments.csv', name: 'demo_payments.csv' },
      { path: 'demo/users.parquet', name: 'demo_users.parquet' },
    ],
    seedTabs: EXAMPLE_QUERIES,
    featured: true,
    credit: '«SQL 101: Рецепты продуктового аналитика» · MIT',
  },
  {
    id: 'penguins',
    title: 'пингвины Палмера',
    blurb: 'три вида: клювы, ласты, масса — и честные NULL’ы для профиля',
    sizeLabel: '~13 КБ',
    files: [{ path: 'samples/penguins.csv', name: 'demo_penguins.csv' }],
    seedTabs: [
      {
        title: 'Пингвины по видам',
        sql: `SELECT species,
       count(*) AS birds,
       round(avg(CAST(body_mass_g AS DOUBLE))) AS avg_mass_g
FROM demo_penguins
GROUP BY species
ORDER BY birds DESC;`,
      },
    ],
    credit: 'palmerpenguins · CC0',
  },
  {
    id: 'taxi',
    title: 'такси Нью-Йорка',
    blurb: '20 тыс. поездок жёлтого такси, январь-2024: время, деньги, чаевые',
    sizeLabel: '~0.5 МБ',
    files: [{ path: 'samples/taxi.parquet', name: 'demo_taxi.parquet' }],
    seedTabs: [
      {
        title: 'Поездки по дням',
        sql: `SELECT strftime(CAST(tpep_pickup_datetime AS DATE), '%Y-%m-%d') AS day,
       count(*) AS trips,
       round(sum(total_amount), 2) AS revenue
FROM demo_taxi
GROUP BY day
ORDER BY day;`,
      },
    ],
    credit: 'NYC TLC · открытые данные',
  },
  {
    id: 'titanic',
    title: 'титаник',
    blurb: '891 пассажир: класс, пол, возраст — и кто выжил',
    sizeLabel: '~60 КБ',
    files: [{ path: 'samples/titanic.csv', name: 'demo_titanic.csv' }],
    seedTabs: [
      {
        title: 'Выживаемость по классам',
        sql: `SELECT Pclass AS class,
       count(*) AS passengers,
       round(100.0 * avg(CAST(Survived AS DOUBLE)), 1) AS survived_pct
FROM demo_titanic
GROUP BY Pclass
ORDER BY Pclass;`,
      },
    ],
    credit: 'классический датасет · public domain',
  },
]

/** Имена таблиц, которые даст загрузка файлов сэмпла. */
export function sampleTables(s: Sample): string[] {
  return s.files.map((f) => tableNameFromFilename(f.name))
}

/** Все таблицы сэмпла уже в сторе (регистронезависимо — как каталог DuckDB). */
export function sampleLoaded(s: Sample, loadedTables: string[]): boolean {
  const have = new Set(loadedTables.map((t) => t.toLowerCase()))
  return sampleTables(s).every((t) => have.has(t.toLowerCase()))
}
