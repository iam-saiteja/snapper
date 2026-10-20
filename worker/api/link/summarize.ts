import { z } from 'zod'
import { aiJson } from '../../lib/ai'
import { body, handler, requireUser } from '../../lib/core'

const Summary = z.object({ title: z.string(), summary: z.string() })
const SYSTEM =
  'Summarise saved content so the user remembers why they saved it. ' +
  'Return JSON: {"title":"short title","summary":"2-4 sentences: what it is and the key takeaway"}'

const META_RE =
  /<meta[^>]+(?:property|name)=["'](og:title|og:description|description|twitter:title|twitter:description)["'][^>]*content=["']([^"']*)["']/gi

export const POST = handler(async (ctx) => {
  await requireUser(ctx)
  const { url } = await body(ctx, z.object({ url: z.url() }))

  // Gemini can watch public YouTube videos directly.
  if (/^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(url)) {
    return aiJson(ctx.env, SYSTEM, [{ file_data: { file_uri: url } }, { text: 'Summarise this video.' }], Summary)
  }
  // Everything else (Instagram needs a login): best effort from the page's public meta tags.
  const meta = await pageMeta(url)
  if (!meta) return { title: url, summary: '' }
  return aiJson(ctx.env, SYSTEM, `URL: ${url}\nPage metadata:\n${meta}`, Summary)
})

async function pageMeta(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; SnapperBot/1.0)' } })
    const html = (await res.text()).slice(0, 200_000)
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]
    const lines = [...(title ? [`title: ${title}`] : []), ...[...html.matchAll(META_RE)].map((m) => `${m[1]}: ${m[2]}`)]
    return lines.length ? lines.join('\n') : null
  } catch {
    return null
  }
}
