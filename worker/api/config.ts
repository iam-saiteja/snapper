import { handler, HttpError } from '../lib/core'

// Public client configuration (Supabase URL + publishable key). The app loads it at startup, so no
// deployment's values are committed in the code: each Worker serves its own.
export const GET = handler(async (ctx) => {
  const supabaseUrl = ctx.env.SUPABASE_URL ?? ctx.env.NEXT_PUBLIC_SUPABASE_URL
  const supabasePublishableKey = ctx.env.SUPABASE_PUBLISHABLE_KEY
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new HttpError(500, 'server not configured: set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY on the Worker')
  }
  return { supabaseUrl, supabasePublishableKey }
})
