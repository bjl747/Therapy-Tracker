// Run from the Studio repo (it reads node_modules/lucide-react):
//   npx tsx scripts/build-elements.mts "$PWD/legacy/canvix" <a checkout of github.com/resolvetosavelives/healthicons> "$PWD/public/studio"
// then copy public/studio into the hub's public/studio.
// Builds Studio's element files from (a) the MIT Canva clone kept in the Studio repo (stickers, illustrations, the Lucide
// icon pack) and (b) the Health Icons SVGs (CC0), into <hub>/public/studio/. Data only: nothing here is run from those sources.
import fs from 'node:fs'; import path from 'node:path'
const [legacy, health, out] = process.argv.slice(2)
const { STICKER_PACKS } = await import(path.join(legacy, 'src/lib/stickers/index.ts'))
const { ICONS } = await import(path.join(legacy, 'src/lib/assets/icon-pack.ts'))
const { ILLUSTRATIONS, ILLUSTRATION_PACKS } = await import(path.join(legacy, 'src/lib/assets/illustrations.ts'))
const mk = (d: string) => fs.mkdirSync(d, { recursive: true })
const sized = (svg: string, px: number) => svg.replace('<svg ', `<svg width="${px}" height="${px}" `)
const safe = (svg: string) => { const m = /<script|\son[a-z]+\s*=|href\s*=|url\((?!#)|<foreignObject|<image|<use|<style|<iframe|javascript:/i.exec(svg); if (m) throw new Error('unexpected content in an SVG: ' + m[0]); return svg }

// stickers: one .svg each + an index
mk(path.join(out, 'stickers'))
const stickers: unknown[] = []
for (const p of STICKER_PACKS) for (const s of p.stickers) {
  fs.writeFileSync(path.join(out, 'stickers', `${s.id}.svg`), sized(safe(s.svg), 480))
  stickers.push({ id: s.id, name: s.name, pack: p.name, tags: s.keywords })
}
for (const il of ILLUSTRATIONS) {
  const id = `illus-${il.id}`.replace(/[^a-z0-9-]/gi, '-')
  fs.writeFileSync(path.join(out, 'stickers', `${id}.svg`), sized(safe(il.svg), 600))
  stickers.push({ id, name: il.name, pack: `Illustrations · ${ILLUSTRATION_PACKS.find((x: { id: string }) => x.id === il.pack)?.label ?? il.pack}`, tags: il.tags })
}
fs.writeFileSync(path.join(out, 'stickers', 'index.json'), JSON.stringify(stickers))

// icons: line icons (Lucide, one stroked path in a 100 box) and Health Icons (filled paths in a 48 box, several per icon,
// each with its own fill rule: "E:" marks an even-odd part, "|" joins parts)
mk(path.join(out, 'icons'))
const title = (s: string) => s.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
// Line icons come straight from the installed lucide-react (ISC), one file per icon, read as text. Each drawing piece
// (path, circle, rect, line, polyline, polygon, ellipse) becomes its own path part in Lucide's 24 box, joined with "|":
// joining them into one path (as the Canvix pack does) breaks every icon whose second piece starts with a relative move.
const lucideDir = path.join(process.cwd(), 'node_modules/lucide-react/dist/esm/icons')
const n = (v: string | undefined) => Number(v ?? 0)
const r2 = (v: number) => String(Math.round(v * 1000) / 1000)
function piece(tag: string, a: Record<string, string>): string {
  if (tag === 'path') return a.d
  if (tag === 'circle' || tag === 'ellipse') {
    const rx = n(a.rx ?? a.r), ry = n(a.ry ?? a.r), cx = n(a.cx), cy = n(a.cy)
    return `M${r2(cx - rx)} ${r2(cy)}a${r2(rx)} ${r2(ry)} 0 1 0 ${r2(rx * 2)} 0a${r2(rx)} ${r2(ry)} 0 1 0 ${r2(-rx * 2)} 0Z`
  }
  if (tag === 'line') return `M${a.x1} ${a.y1}L${a.x2} ${a.y2}`
  if (tag === 'polyline' || tag === 'polygon') {
    const p = a.points.trim().split(/[\s,]+/).map(Number)
    if (p.length < 4 || p.length % 2 || p.some((v) => !Number.isFinite(v))) throw new Error('unexpected points')
    let d = ''
    for (let i = 0; i < p.length; i += 2) d += `${i ? 'L' : 'M'}${p[i]} ${p[i + 1]}`
    return d + (tag === 'polygon' ? 'Z' : '')
  }
  if (tag === 'rect') {
    const x = n(a.x), y = n(a.y), w = n(a.width), h = n(a.height)
    const rx = Math.min(n(a.rx ?? a.ry), w / 2), ry = Math.min(n(a.ry ?? a.rx), h / 2)
    if (!rx && !ry) return `M${r2(x)} ${r2(y)}h${r2(w)}v${r2(h)}h${r2(-w)}Z`
    return `M${r2(x + rx)} ${r2(y)}h${r2(w - 2 * rx)}a${r2(rx)} ${r2(ry)} 0 0 1 ${r2(rx)} ${r2(ry)}v${r2(h - 2 * ry)}a${r2(rx)} ${r2(ry)} 0 0 1 ${r2(-rx)} ${r2(ry)}h${r2(-(w - 2 * rx))}a${r2(rx)} ${r2(ry)} 0 0 1 ${r2(-rx)} ${r2(-ry)}v${r2(-(h - 2 * ry))}a${r2(rx)} ${r2(ry)} 0 0 1 ${r2(rx)} ${r2(-ry)}Z`
  }
  throw new Error('unexpected shape ' + tag)
}
const curated: string[] = ICONS.map((i: { id: string }) => i.id)
const line: { id: string; name: string; tags: string[]; d: string }[] = []
for (const f of fs.readdirSync(lucideDir).sort()) {
  if (!f.endsWith('.js')) continue
  const src = fs.readFileSync(path.join(lucideDir, f), 'utf8')
  const body = /createLucideIcon\("\w+",\s*\[([\s\S]*?)\]\s*\);/.exec(src)?.[1]
  if (body == null) continue // an alias file: it re-exports another icon
  const parts = [...body.matchAll(/\[\s*"(\w+)",\s*\{([^}]*)\}\s*\]/g)].map((m) => {
    const attrs: Record<string, string> = {}
    for (const kv of m[2].matchAll(/(\w+):\s*"([^"]*)"/g)) attrs[kv[1]] = kv[2]
    const d = piece(m[1], attrs)
    if (!/^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/.test(d)) throw new Error('unexpected path data ' + f)
    return d
  })
  if (!parts.length) throw new Error('no drawing in ' + f)
  const id = f.replace(/\.js$/, '')
  line.push({ id, name: title(id), tags: id.split('-'), d: parts.join('|') })
}
// the Canvix pack's picks lead (home, buildings, stars, weather…), the rest follow A–Z
const rank = (id: string) => { const i = curated.indexOf(id); return i < 0 ? curated.length : i }
line.sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id))
fs.writeFileSync(path.join(out, 'icons', 'line.json'), JSON.stringify(line))
console.log('line icons', line.length)
for (const style of ['filled', 'outline']) {
  const list: unknown[] = []
  const root = path.join(health, 'public/icons/svg', style)
  for (const cat of fs.readdirSync(root).sort()) {
    const dir = path.join(root, cat); if (!fs.statSync(dir).isDirectory()) continue
    for (const f of fs.readdirSync(dir).sort()) {
      if (!f.endsWith('.svg')) continue
      const svg = fs.readFileSync(path.join(dir, f), 'utf8')
      if (!/viewBox="0 0 48 48"/.test(svg)) throw new Error('unexpected viewBox ' + f)
      const parts = [...svg.matchAll(/<path\b([^>]*)>/g)].map((m) => { const d = /\bd="([^"]*)"/.exec(m[1])?.[1] ?? ''; if (!/^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/.test(d)) throw new Error('unexpected path data ' + f); return (/fill-rule="evenodd"/.test(m[1]) ? 'E:' : '') + d.replace(/\s+/g, ' ').trim() }).filter(Boolean)
      if (!parts.length) continue
      const name = f.replace(/\.svg$/, '')
      // "blood-a_n" reads "Blood type A−"; the PPE folder keeps its capitals
      const blood = /^blood[-_](a|b|ab|o|rh)_(n|p)$/.exec(name)
      const label = blood ? `Blood type ${blood[1] === 'rh' ? 'Rh' : blood[1].toUpperCase()}${blood[2] === 'n' ? '−' : '+'}` : title(name)
      const tags = [...new Set([...name.split(/[-_]/), cat, ...(blood ? ['type', blood[2] === 'n' ? 'negative' : 'positive'] : [])])]
      list.push({ id: `${cat}/${name}`, name: label, cat: cat === 'ppe' ? 'PPE' : title(cat), tags, d: parts.join('|') })
    }
  }
  fs.writeFileSync(path.join(out, 'icons', `health-${style}.json`), JSON.stringify(list))
  console.log('health', style, list.length)
}
fs.writeFileSync(path.join(out, 'LICENSES.md'), `# Studio element files

| Files | What | Licence | Source |
|---|---|---|---|
| \`stickers/*.svg\` (ids not starting \`illus-\`) | ${STICKER_PACKS.reduce((n: number, p: { stickers: unknown[] }) => n + p.stickers.length, 0)} vector stickers | MIT, © 2026 Ashiq Hussain Mir (Canvix) | the open-source Canva clone kept in the Studio repo, \`legacy/canvix/src/lib/stickers\` |
| \`stickers/illus-*.svg\` | ${ILLUSTRATIONS.length} flat illustrations | MIT, © 2026 Ashiq Hussain Mir (Canvix) | \`legacy/canvix/src/lib/assets/illustrations.ts\` |
| \`icons/line.json\` | ${line.length} line icons | ISC, © Lucide contributors (parts © Cole Bemis, Feather, MIT) | Lucide (https://lucide.dev), read from the installed \`lucide-react\` package; the order of the first ${curated.length} follows Canvix's pick |
| \`icons/health-filled.json\`, \`icons/health-outline.json\` | Health Icons, 776 icons in two styles | CC0 1.0 (public domain) | https://github.com/resolvetosavelives/healthicons, \`public/icons/svg\` (its LICENSE file: icons CC0, website code MIT) |

MIT and ISC ask that the copyright notice travels with copies: this file is that notice.
`)
console.log('stickers', stickers.length)
