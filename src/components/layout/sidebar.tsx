"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import {
  LayoutDashboard, Ticket, ShoppingCart, BookOpen, Users,
  Settings, MapPin, FileText, Package, Network, UserPlus,
  ChevronLeft, ChevronRight, Headphones, Puzzle, Truck, GitBranch, LayoutGrid,
  Monitor, Smartphone, Cpu, Clock,
  type LucideIcon
} from "lucide-react"
import * as LucideIcons from "lucide-react"
import { cn } from "@/lib/utils"

interface NavItem {
  href: string
  key: string
  label: string
  icon: LucideIcon
  children?: { href: string; label: string; emoji: string }[]
}

const coreNavItems: NavItem[] = [
  { key: "dashboard", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "my-devices", href: "/my-devices", label: "Meine Geräte", icon: Smartphone },
  { key: "tickets", href: "/tickets", label: "Tickets", icon: Ticket },
  { key: "orders", href: "/orders", label: "Bestellungen", icon: ShoppingCart },
  { key: "catalog", href: "/catalog", label: "Produktkatalog", icon: LayoutGrid },
  { key: "workflows", href: "/workflows", label: "Workflows", icon: GitBranch },
  { key: "sla", href: "/sla", label: "SLA", icon: Clock },
  {
    key: "assets", href: "/assets", label: "Assets", icon: Monitor,
    children: [
      { href: "/assets/windows", label: "Windows", emoji: "🪟" },
      { href: "/assets/ios", label: "iOS / iPadOS", emoji: "🍎" },
      { href: "/assets/android", label: "Android", emoji: "🤖" },
    ]
  },
  { key: "inventory", href: "/inventory", label: "Inventar", icon: Package },
  { key: "suppliers", href: "/suppliers", label: "Lieferanten", icon: Truck },
  { key: "kb", href: "/kb", label: "Wissensdatenbank", icon: BookOpen },
  { key: "locations", href: "/locations", label: "Standorte", icon: MapPin },
  { key: "templates", href: "/templates", label: "Vorlagen", icon: FileText },
  { key: "plugins", href: "/plugins", label: "Module & Add-ons", icon: Puzzle },
  { key: "users", href: "/users", label: "Benutzer", icon: Users },
  { key: "settings", href: "/settings", label: "Einstellungen", icon: Settings },
]

// Export for use in settings page
export const NAV_ITEMS_META = coreNavItems.map(i => ({ key: i.key, label: i.label }))

interface PluginNavItem {
  label: string
  href: string
  icon: string
  pluginId: string
}

function getIcon(name: string): LucideIcon {
  return (LucideIcons as any)[name] ?? Package
}

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [pluginItems, setPluginItems] = useState<PluginNavItem[]>([])
  const [userRoles, setUserRoles] = useState<string[]>([])
  const [navVisibility, setNavVisibility] = useState<Record<string, string>>({})
  const [ready, setReady] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/plugins').then(r => r.ok ? r.json() : []),
      fetch('/api/auth/me').then(r => r.ok ? r.json() : null),
      fetch('/api/settings/nav').then(r => r.ok ? r.json() : {}),
    ]).then(([manifests, me, nav]) => {
      // Plugins
      const items: PluginNavItem[] = []
      for (const m of (manifests as any[])) {
        for (const n of m.navItems ?? []) {
          items.push({
            label: n.label,
            href: `/p/${m.id}${n.href === '/' ? '' : '/' + n.href.replace(/^\//, '')}`,
            icon: n.icon,
            pluginId: m.id,
          })
        }
      }
      setPluginItems(items)

      // User roles
      if (me?.role) {
        setUserRoles(me.role.split(",").map((r: string) => r.trim()))
      }

      // Nav visibility
      if (nav && typeof nav === "object") {
        setNavVisibility(nav as Record<string, string>)
      }
      setReady(true)
    }).catch(() => setReady(true))
  }, [])

  // Filter nav items based on visibility settings
  const isAdmin = userRoles.includes("admin")
  const isRoleAllowed = (key: string, defaultHidden?: boolean) => {
    if (isAdmin) return true
    const allowed = navVisibility[key]
    if (!allowed) return !defaultHidden // no config = visible (unless default hidden)
    const allowedRoles = allowed.split(",").map(r => r.trim())
    return userRoles.some(r => allowedRoles.includes(r))
  }

  const visibleNavItems = coreNavItems.filter(item => {
    if (item.key === "settings") return isRoleAllowed(item.key, true)
    return isRoleAllowed(item.key)
  })

  const visiblePluginItems = pluginItems.filter(item => {
    const key = `plugin_${item.pluginId}`
    return isRoleAllowed(key)
  })

  return (
    <aside className={cn(
      "relative flex flex-col border-r bg-card transition-all duration-300 ease-in-out",
      collapsed ? "w-16" : "w-60"
    )}>
      {/* Logo */}
      <div className="flex h-14 items-center border-b px-4">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
            <Headphones className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="font-semibold text-sm truncate">HelpDesk</span>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {!ready && (
          <div className="space-y-1 px-1">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="h-9 rounded-lg bg-muted/30 animate-pulse" />
            ))}
          </div>
        )}
        {ready && visibleNavItems.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href || pathname.startsWith(item.href + "/")
          const hasChildren = item.children && item.children.length > 0
          return (
            <div key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
              {hasChildren && !collapsed && active && (
                <div className="ml-5 pl-3 border-l-2 border-muted-foreground/15 space-y-0.5 mt-0.5 mb-1">
                  {item.children!.map(child => {
                    const childActive = pathname === child.href || pathname.startsWith(child.href + "/")
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] transition-all duration-150",
                          childActive
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                      >
                        <span className="text-sm leading-none">{child.emoji}</span>
                        <span className="truncate">{child.label}</span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {/* Plugin items grouped by plugin */}
        {ready && visiblePluginItems.length > 0 && (() => {
          // Group by pluginId
          const groups: Record<string, PluginNavItem[]> = {}
          for (const item of visiblePluginItems) {
            if (!groups[item.pluginId]) groups[item.pluginId] = []
            groups[item.pluginId].push(item)
          }
          const pluginIds = Object.keys(groups)

          if (collapsed) {
            return <>
              <div className="border-t my-2" />
              {visiblePluginItems.filter((_, i) => {
                // Only show first item per plugin in collapsed mode
                const g = groups[visiblePluginItems[i].pluginId]
                return g[0] === visiblePluginItems[i]
              }).map(item => {
                const Icon = getIcon(item.icon)
                const pluginActive = groups[item.pluginId].some(p => pathname === p.href || pathname.startsWith(p.href + "/"))
                return (
                  <Link key={item.href} href={item.href} title={item.label}
                    className={cn("flex items-center justify-center rounded-lg p-2 transition-all duration-150",
                      pluginActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
                    <Icon className="h-4 w-4" />
                  </Link>
                )
              })}
            </>
          }

          return <>
            {!collapsed && pluginIds.length > 0 && (
              <div className="pt-3 pb-1 px-3">
                <p className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-widest">Add-ons</p>
              </div>
            )}
            {pluginIds.map(pid => {
              const items = groups[pid]
              const main = items[0]
              const children = items.slice(1)
              const Icon = getIcon(main.icon)
              const pluginActive = items.some(p => pathname === p.href || pathname.startsWith(p.href + "/"))
              const mainActive = pathname === main.href || (pathname.startsWith(main.href + "/") && !children.some(c => pathname === c.href || pathname.startsWith(c.href + "/")))

              return (
                <div key={pid}>
                  <Link href={main.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                      pluginActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}>
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{main.label}</span>
                  </Link>
                  {children.length > 0 && pluginActive && (
                    <div className="ml-5 pl-3 border-l-2 border-muted-foreground/15 space-y-0.5 mt-0.5 mb-1">
                      {children.map(child => {
                        const ChildIcon = getIcon(child.icon)
                        const childActive = pathname === child.href || pathname.startsWith(child.href + "/")
                        return (
                          <Link key={child.href} href={child.href}
                            className={cn(
                              "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] transition-all duration-150",
                              childActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                            )}>
                            <ChildIcon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{child.label}</span>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        })()}
      </nav>

      {/* Collapse button */}
      <div className="border-t p-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  )
}
