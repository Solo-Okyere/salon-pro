"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import {
  LayoutDashboard, Calendar, Users, Package, Scissors,
  Sparkles, LogOut, Menu, X, Shield, Bell,
  ChevronDown, Settings, Store,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/slices/authSlice";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";

const NAV = [
  { href: "/owner",     icon: LayoutDashboard, label: "Overview",      roles: ["OWNER"],    group: "workspace" },
  { href: "/staff",     icon: Users,            label: "Staff",         roles: ["OWNER"],    group: "workspace" },
  { href: "/services",  icon: Scissors,         label: "Services",      roles: ["OWNER"],    group: "workspace" },
  { href: "/inventory", icon: Package,          label: "Inventory",     roles: ["OWNER"],    group: "workspace" },
  { href: "/ai",        icon: Sparkles,         label: "AI Insights",   roles: ["OWNER"],    group: "workspace" },
  { href: "/barber",    icon: Scissors,         label: "My Day",        roles: ["BARBER"],   group: "workspace" },
  { href: "/customer",  icon: Calendar,         label: "My Bookings",   roles: ["CUSTOMER"], group: "workspace" },
  { href: "/admin",     icon: Shield,           label: "Admin Console", roles: ["ADMIN"],    group: "workspace" },
];

const ROLE_COLOR: Record<string, string> = {
  OWNER:    "text-[#d4a017]",
  BARBER:   "text-blue-400",
  CUSTOMER: "text-emerald-400",
  ADMIN:    "text-red-400",
};
const ROLE_BG: Record<string, string> = {
  OWNER:    "rgba(212,160,23,0.12)",
  BARBER:   "rgba(96,165,250,0.12)",
  CUSTOMER: "rgba(52,211,153,0.12)",
  ADMIN:    "rgba(239,68,68,0.12)",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname  = usePathname();
  const router    = useRouter();
  const { user, clearAuth } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const role    = user?.role ?? "CUSTOMER";
  const items   = NAV.filter(n => n.roles.includes(role));
  const initials = user?.name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() ?? "?";

  // Fetch shop slug for the "View Shop" sidebar link and shop-aware logout (OWNER + BARBER)
  const { data: shopData } = useQuery<{ success: boolean; data: { slug: string } }>({
    queryKey: ["dashboard-shop-slug", role],
    queryFn: () => {
      if (role === "OWNER") {
        return api.get("/api/dashboard/owner?period=day").then(r => ({
          success: true,
          data: { slug: r.data?.data?.shop?.slug ?? "" },
        }));
      }
      // BARBER
      return api.get("/api/dashboard/barber").then(r => ({
        success: true,
        data: { slug: r.data?.data?.barber?.shop?.slug ?? "" },
      }));
    },
    enabled: role === "OWNER" || role === "BARBER",
    staleTime: 300_000,
  });
  const shopSlug = shopData?.data?.slug ?? "";

  async function logout() {
    try { await api.post("/api/auth/logout"); } catch {}
    clearAuth();
    // Owner and barber stay on their shop's public page; everyone else goes to the global landing
    if ((role === "OWNER" || role === "BARBER") && shopSlug) {
      router.push(`/shops/${shopSlug}`);
    } else {
      router.push("/");
    }
    toast.success("Signed out");
  }

  const Sidebar = () => (
    <div className="flex flex-col h-full glass-dark border-r border-white/[0.06]" style={{ background: "rgba(6,6,10,0.75)" }}>

      {/* Ambient photo tint at top of sidebar */}
      <div className="absolute top-0 left-0 right-0 h-56 pointer-events-none overflow-hidden opacity-35" style={{ zIndex: 0 }}>
        <Image src="/images/barbershop-2.jpg" alt="" fill sizes="224px" className="object-cover object-top" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-[#060608]" />
      </div>

      {/* Logo */}
      <div className="relative z-10 h-14 flex items-center px-4 border-b border-white/[0.06] shrink-0">
        <Link href="/" className="flex items-center gap-2 select-none">
          <div className="w-7 h-7 rounded-lg btn-gold flex items-center justify-center shrink-0">
            <Scissors className="w-3.5 h-3.5 text-black" />
          </div>
          <span className="font-bold text-[15px] text-white tracking-tight">SalonPro</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40 px-2 mb-2">
          {role === "ADMIN" ? "Platform" : role === "CUSTOMER" ? "My Account" : "Workspace"}
        </p>
        {items.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn("nav-item", active && "active")}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}

        <div className="pt-4 mt-4 border-t border-white/[0.06]">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40 px-2 mb-2">General</p>
          <Link href={(role === "OWNER" || role === "BARBER") && shopSlug ? `/shops/${shopSlug}` : "/shops"} className="nav-item">
            <Store className="w-4 h-4 shrink-0" />
            View Shop
          </Link>
          {role === "OWNER" && (
            <Link href="/settings" onClick={() => setMobileOpen(false)} className={cn("nav-item", pathname.startsWith("/settings") && "active")}>
              <Settings className="w-4 h-4 shrink-0" />
              Settings
            </Link>
          )}
        </div>
      </nav>

      {/* User */}
      <div className="relative z-10 border-t border-white/[0.06] p-3 shrink-0">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors text-left group"
        >
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-black shrink-0"
            style={{ background: "linear-gradient(135deg, #d4a017, #f5c842)" }}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white/80 truncate">{user?.name ?? "Guest"}</p>
            <span className={cn("text-[10px] font-medium", ROLE_COLOR[role] ?? ROLE_COLOR.CUSTOMER)}>
              {role}
            </span>
          </div>
          <LogOut className="w-4 h-4 text-white/40 group-hover:text-white/60 shrink-0" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#060608] flex relative">

      {/* Fixed photo ambient behind whole layout */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <Image src="/images/barbershop-5.jpg" alt="" fill sizes="100vw" className="object-cover opacity-20" />
        <div className="absolute inset-0 bg-[#060608]/60" />
        {/* Gold ambient glow — top-right */}
        <div className="absolute top-0 right-0 w-[600px] h-[400px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(ellipse at top right, rgba(212,160,23,0.07) 0%, transparent 65%)" }} />
        {/* Purple ambient — bottom-left */}
        <div className="absolute bottom-0 left-0 w-[500px] h-[400px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(ellipse at bottom left, rgba(80,103,138,0.06) 0%, transparent 65%)" }} />
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 fixed inset-y-0 left-0 z-30 relative overflow-hidden">
        <Sidebar />
      </aside>

      {/* Mobile sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 md:hidden backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -224 }} animate={{ x: 0 }} exit={{ x: -224 }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              className="fixed inset-y-0 left-0 z-50 w-56 md:hidden relative overflow-hidden"
            >
              <Sidebar />
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-white/[0.06]"
              >
                <X className="w-4 h-4 text-white/50" />
              </button>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="flex-1 md:ml-56 flex flex-col min-h-screen relative z-10">

        {/* Top bar */}
        <header className="page-header shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-1.5 rounded-md hover:bg-white/[0.06]"
            >
              <Menu className="w-5 h-5 text-white/50" />
            </button>
            {/* Role indicator */}
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: ROLE_BG[role], color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <span className={cn("w-1.5 h-1.5 rounded-full", {
                "bg-[#d4a017]": role === "OWNER",
                "bg-blue-400": role === "BARBER",
                "bg-emerald-400": role === "CUSTOMER",
                "bg-red-400": role === "ADMIN",
              })} />
              {role}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotificationsOpen(open => !open)}
                aria-expanded={notificationsOpen}
                aria-controls="notification-panel"
                aria-label="Open notifications"
                className="relative rounded-md p-1.5 transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Bell className="w-4 h-4 text-white/50" />
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#d4a017]" />
              </button>
              <AnimatePresence>
                {notificationsOpen && (
                  <motion.section
                    id="notification-panel"
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.16 }}
                    className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-white/10 bg-[#11111e] p-4 shadow-dropdown"
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-white">Notifications</h2>
                      <span className="text-xs text-white/45">All caught up</span>
                    </div>
                    <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-6 text-center">
                      <Bell className="mx-auto size-5 text-white/35" />
                      <p className="mt-2 text-sm font-medium text-white/80">No new notifications</p>
                      <p className="mt-1 text-xs leading-5 text-white/50">Booking and shop updates will appear here.</p>
                    </div>
                  </motion.section>
                )}
              </AnimatePresence>
            </div>

            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.06] transition-colors"
              >
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-black"
                  style={{ background: "linear-gradient(135deg, #d4a017, #f5c842)" }}>
                  {initials}
                </div>
                <span className="hidden sm:block text-sm font-medium text-white/70">{user?.name?.split(" ")[0] ?? "User"}</span>
                <ChevronDown className="w-3.5 h-3.5 text-white/40" />
              </button>

              <AnimatePresence>
                {userMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.12 }}
                    className="absolute right-0 top-full mt-1 w-52 glass rounded-xl shadow-dropdown py-1 z-50"
                    onMouseLeave={() => setUserMenuOpen(false)}
                  >
                    <div className="px-3 py-2 border-b border-white/[0.06]">
                      <p className="text-sm font-semibold text-white/80">{user?.name}</p>
                      <p className="text-xs text-white/40">{user?.phone}</p>
                    </div>
                    {role === "OWNER" && (
                      <Link href="/settings" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm text-white/60 hover:bg-white/[0.06] hover:text-white transition-colors">
                        <Settings className="w-4 h-4" /> Settings
                      </Link>
                    )}
                    <button
                      onClick={logout}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <LogOut className="w-4 h-4" /> Sign out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
