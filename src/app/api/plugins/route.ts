import { NextResponse } from 'next/server'
import { plugins } from '@/plugins/registry'
import { getSession } from '@/lib/auth'

const CORE_PLUGINS = ['assets', 'ticket-analytics', 'system-maintenance', 'mobile-contracts', 'onboarding']

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(plugins.map(p => ({
    ...p.manifest,
    isCore: CORE_PLUGINS.includes(p.manifest.id),
  })))
}
