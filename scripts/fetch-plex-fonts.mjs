// Одноразовый скрипт: скачивает woff2-сабсеты IBM Plex Mono (400/500/600) и
// IBM Plex Serif (500/600), latin + cyrillic, из Google Fonts в public/fonts/.
// Документирует происхождение self-hosted бинарей; в сборку приложения не входит.
// Запуск: node scripts/fetch-plex-fonts.mjs
import { writeFile } from 'node:fs/promises'

const CSS_URL =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Serif:wght@500;600&display=swap'
// Chrome-UA => Google отдаёт woff2 с по-сабсетными unicode-range блоками.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const css = await (await fetch(CSS_URL, { headers: { 'User-Agent': UA } })).text()
// Ответ — повторяющиеся блоки "/* subset */ @font-face { ... }".
const parts = css.split(/\/\*\s*([a-z-]+)\s*\*\//).slice(1)
let saved = 0
for (let i = 0; i < parts.length; i += 2) {
  const subset = parts[i]
  const block = parts[i + 1]
  if (subset !== 'latin' && subset !== 'cyrillic') continue
  const fam = block.includes('IBM Plex Mono') ? 'ibm-plex-mono' : 'ibm-plex-serif'
  const weight = block.match(/font-weight:\s*(\d+)/)?.[1]
  const url = block.match(/src:\s*url\(([^)]+)\)/)?.[1]
  if (!weight || !url) throw new Error(`bad block for ${subset}`)
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
  const name = `${fam}-${weight}-${subset}.woff2`
  await writeFile(new URL(`../public/fonts/${name}`, import.meta.url), buf)
  console.log(`${name}  ${(buf.length / 1024).toFixed(1)} KB`)
  saved++
}
if (saved !== 10) throw new Error(`expected 10 files, saved ${saved}`)
console.log('done')
