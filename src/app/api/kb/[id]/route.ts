import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { query } from "@/lib/db"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const rows = await query(
    "SELECT id, title, slug, content_html, status, views, helpful_votes, created_at FROM kb_articles WHERE id = ?",
    [id]
  ) as any[]
  if (!rows.length) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 })
  return NextResponse.json(rows[0])
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const roles: string[] = session.role ? session.role.split(",").map((r: string) => r.trim()) : []
  if (!roles.some(r => ["admin", "agent"].includes(r)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { id } = await params
  const { title, content, status } = await req.json()
  if (!title?.trim()) return NextResponse.json({ error: "Titel erforderlich" }, { status: 400 })
  await query(
    "UPDATE kb_articles SET title = ?, content_html = ?, status = ? WHERE id = ?",
    [title.trim(), content || "", status || "draft", id]
  )
  return NextResponse.json({ success: true })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const roles: string[] = session.role ? session.role.split(",").map((r: string) => r.trim()) : []
  if (!roles.some(r => ["admin", "agent"].includes(r)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { id } = await params
  await query("DELETE FROM kb_articles WHERE id = ?", [id])
  return NextResponse.json({ success: true })
}
