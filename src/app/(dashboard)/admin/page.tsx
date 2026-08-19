"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Store, Users, Calendar, DollarSign, CheckCircle, XCircle,
  Clock, MoreHorizontal, Plus, Search, X, RefreshCw,
  Shield, AlertTriangle, TrendingUp, Eye, EyeOff, Ban, Link2, Copy, Lock, ArrowRight, ExternalLink, LogIn,
} from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { MetricCard } from "@/components/ui/MetricCard";

interface Shop {
  id: string; name: string; slug: string; city: string; region: string;
  address: string; phone: string; isActive: boolean; isVerified: boolean;
  createdAt: string;
  owner: { id: string; name: string; phone: string };
  _count: { bookings: number; barbers: number };
}
interface AdminStats {
  totalShops: number; activeShops: number; pendingVerification: number;
  totalUsers: number; totalBookings: number; totalRevenue: number;
  noShowRate: number; monthlyGrowth: number;
}
interface RegisterForm {
  ownerName: string; ownerPhone: string; ownerPassword: string;
  shopName: string; city: string; region: string; address: string; phone: string;
}

function mutationErrorMessage(error: unknown, fallback: string) {
  const response = (error as { response?: { data?: { error?: string; message?: string } } })?.response;
  return response?.data?.error ?? response?.data?.message ?? fallback;
}

const REGIONS = [
  "Greater Accra","Ashanti","Western","Central","Eastern","Volta",
  "Northern","Upper East","Upper West","Bono","Ahafo","Bono East",
  "Oti","North East","Savannah","Western North",
];

// StatCard removed — replaced by shared MetricCard from @/components/ui/MetricCard

// ── Register modal ────────────────────────────────────────────────────────────
function RegisterModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<RegisterForm>({
    ownerName: "", ownerPhone: "", ownerPassword: "",
    shopName: "", city: "", region: "", address: "", phone: "",
  });
  const [step, setStep] = useState<1 | 2>(1);
  const [showPw, setShowPw] = useState(false);

  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [createdOwner, setCreatedOwner] = useState<{ phone: string; name: string } | null>(null);

  const create = useMutation({
    mutationFn: (d: RegisterForm) => api.post("/api/admin/shops", d).then(r => r.data),
    onSuccess: (res) => {
      const slug = res?.data?.slug;
      setCreatedSlug(slug ?? null);
      setCreatedOwner({ phone: form.ownerPhone, name: form.ownerName });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      qc.invalidateQueries({ queryKey: ["admin-shops"] });
    },
    onError: (e: unknown) => toast.error(mutationErrorMessage(e, "Failed to register shop")),
  });

  const set = (k: keyof RegisterForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18 }}
        className="relative glass rounded-2xl shadow-dropdown w-full max-w-lg overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-foreground">Register new shop</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Step {step} of 2</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="h-1 bg-secondary">
          <motion.div className="h-full bg-primary" animate={{ width: step === 1 ? "50%" : "100%" }} transition={{ duration: 0.3 }} />
        </div>

        <form
          onSubmit={e => { e.preventDefault(); if (step === 1) { setStep(2); return; } create.mutate(form); }}
          className="p-6 space-y-4"
        >
          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.div key="s1" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} className="space-y-4">
                <p className="text-sm font-semibold text-foreground">Owner details</p>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Full name *</label>
                  <input value={form.ownerName} onChange={set("ownerName")} required placeholder="Kofi Mensah"
                    className="input-base w-full px-3 py-2.5 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Phone number *</label>
                  <div className="flex">
                    <span className="px-3 py-2.5 bg-secondary border border-border border-r-0 rounded-l-lg text-sm text-muted-foreground font-medium">+233</span>
                    <input value={form.ownerPhone} onChange={set("ownerPhone")} required placeholder="024 000 0000"
                      className="input-base flex-1 px-3 py-2.5 rounded-r-lg rounded-l-none text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Login password * <span className="font-normal text-muted-foreground">(owner uses this at /login)</span></label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <input type={showPw ? "text" : "password"} value={form.ownerPassword} onChange={set("ownerPassword")} required minLength={6}
                      placeholder="Min 6 characters"
                      className="input-base w-full pl-9 pr-9 py-2.5 rounded-lg text-sm" />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div key="s2" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="space-y-4">
                <p className="text-sm font-semibold text-foreground">Shop details</p>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Shop name *</label>
                  <input value={form.shopName} onChange={set("shopName")} required placeholder="Kofi's Barbershop"
                    className="input-base w-full px-3 py-2.5 rounded-lg text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">City *</label>
                    <input value={form.city} onChange={set("city")} required placeholder="Accra"
                      className="input-base w-full px-3 py-2.5 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Region *</label>
                    <select value={form.region} onChange={set("region")} required
                      className="select-base w-full px-3 py-2.5 rounded-lg text-sm bg-white text-gray-900 dark:bg-[#111827] dark:text-white">
                      <option value="" className="text-gray-500">Select…</option>
                      {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Address *</label>
                  <input value={form.address} onChange={set("address")} required placeholder="45 Oxford St, Osu"
                    className="input-base w-full px-3 py-2.5 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Shop phone</label>
                  <input value={form.phone} onChange={set("phone")} placeholder="+233 24 000 0000"
                    className="input-base w-full px-3 py-2.5 rounded-lg text-sm" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex gap-2 pt-2">
            {step === 2 && (
              <button type="button" onClick={() => setStep(1)}
                className="btn-outline flex-1 py-2.5 rounded-lg text-sm font-medium">
                ← Back
              </button>
            )}
            <button type="submit" disabled={create.isPending}
              className="btn-primary flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60">
              {create.isPending ? "Registering…" : step === 1 ? "Next →" : "Register shop"}
            </button>
          </div>
        </form>

        {/* Success state — show shop URL + owner credentials */}
        <AnimatePresence>
          {createdSlug && createdOwner && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute inset-0 glass rounded-2xl flex flex-col items-center justify-center p-8 text-center overflow-y-auto"
            >
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.2)" }}>
                <CheckCircle className="w-7 h-7 text-emerald-400" />
              </div>
              <h3 className="font-bold text-foreground text-lg mb-1">Shop registered!</h3>
              <p className="text-sm text-muted-foreground mb-4">Share these login details with {createdOwner.name}:</p>

              {/* Owner login credentials */}
              <div className="w-full bg-secondary rounded-xl px-4 py-3 mb-3 text-left space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Owner login</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Phone</span>
                  <span className="text-sm font-mono text-foreground">+233{createdOwner.phone.replace(/^(\+233|0)/, "")}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Password</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-foreground">{form.ownerPassword}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(form.ownerPassword);
                        toast.success("Password copied!");
                      }}
                      className="p-1 rounded hover:bg-border transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Open owner login button */}
              <a
                href="/login"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl mb-3 text-sm font-semibold transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #d4a017, #f5c842)", color: "#000" }}
              >
                Open owner login <ArrowRight className="w-4 h-4" />
              </a>

              {/* Shop URL */}
              <div className="w-full bg-secondary rounded-xl px-4 py-3 flex items-center gap-2 mb-5">
                <Link2 className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-mono text-foreground flex-1 break-all">
                  {typeof window !== "undefined" ? window.location.origin : ""}/shops/{createdSlug}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/shops/${createdSlug}`);
                    toast.success("Link copied!");
                  }}
                  className="shrink-0 p-1 rounded hover:bg-border transition-colors"
                >
                  <Copy className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              <button onClick={onClose} className="btn-primary px-6 py-2.5 rounded-lg text-sm font-semibold">
                Done
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AdminConsole() {
  const qc = useQueryClient();
  const [showRegister, setShowRegister] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all"|"active"|"pending"|"inactive">("all");
  const [menu, setMenu] = useState<string | null>(null);

  const { data: sd, isLoading: sl } = useQuery<{ data: AdminStats }>({
    queryKey: ["admin-stats"],
    queryFn: () => api.get("/api/admin/stats").then(r => r.data),
    refetchInterval: 30_000,
  });

  const { data: shopsRes, isLoading: shopsl, refetch } = useQuery<{ data: Shop[] }>({
    queryKey: ["admin-shops"],
    queryFn: () => api.get("/api/admin/shops").then(r => r.data),
    refetchInterval: 30_000,
  });

  const verify = useMutation({
    mutationFn: (id: string) => api.patch(`/api/admin/shops/${id}/verify`, {}),
    onSuccess: () => { toast.success("Shop verified ✓"); qc.invalidateQueries({ queryKey: ["admin-shops"] }); qc.invalidateQueries({ queryKey: ["admin-stats"] }); },
    onError: () => toast.error("Failed to verify"),
  });

  const suspend = useMutation({
    mutationFn: (id: string) => api.patch(`/api/admin/shops/${id}/suspend`, {}),
    onSuccess: () => { toast.success("Shop suspended"); qc.invalidateQueries({ queryKey: ["admin-shops"] }); },
    onError: () => toast.error("Failed to suspend"),
  });

  const s = sd?.data;
  const shops: Shop[] = shopsRes?.data ?? [];

  const filtered = shops.filter(shop => {
    const q = search.toLowerCase();
    const matchQ = !q || shop.name.toLowerCase().includes(q) || shop.city.toLowerCase().includes(q) || shop.owner.name.toLowerCase().includes(q);
    const matchF =
      filter === "all"      ? true :
      filter === "active"   ? (shop.isActive && shop.isVerified) :
      filter === "pending"  ? !shop.isVerified :
      !shop.isActive;
    return matchQ && matchF;
  });

  const statItems = s ? [
    { label: "Total shops", rawValue: s.totalShops,            iconBg: "bg-blue-500/15",    iconColor: "#60a5fa", icon: Store,          trendSub: `${s.activeShops} active` },
    { label: "Users",       rawValue: s.totalUsers,            iconBg: "bg-violet-500/15",  iconColor: "#a78bfa", icon: Users },
    { label: "Pending",     rawValue: s.pendingVerification,   iconBg: s.pendingVerification ? "bg-amber-500/15" : "bg-emerald-500/15", iconColor: s.pendingVerification ? "#f59e0b" : "#34d399", icon: s.pendingVerification ? AlertTriangle : CheckCircle },
    { label: "Bookings",    rawValue: s.totalBookings,         iconBg: "bg-emerald-500/15",   iconColor: "#34d399", icon: Calendar,       trendSub: `${s.noShowRate.toFixed(1)}% no-show` },
    { label: "Revenue",     rawValue: Math.round(s.totalRevenue / 1000), iconBg: "bg-amber-500/15", iconColor: "#f59e0b", icon: DollarSign, prefix: "GHS ", suffix: "k" },
    { label: "Growth",      rawValue: s.monthlyGrowth,         iconBg: "bg-emerald-500/15", iconColor: "#34d399", icon: TrendingUp,     suffix: "%", trend: `+${s.monthlyGrowth}%`, trendUp: s.monthlyGrowth >= 0, trendSub: "this month" },
  ] : [];

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" /> Admin Console
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Platform management · {shops.length} shops registered</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="btn-outline flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setShowRegister(true)} className="btn-primary flex items-center gap-2 px-4 py-2 rounded-lg text-sm">
            <Plus className="w-4 h-4" /> Register shop
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {sl
          ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="metric-card"><div className="skeleton h-16 w-full" /></div>)
          : statItems.map((item, i) => <MetricCard key={item.label} {...item} delay={i * 0.05} />)
        }
      </div>

      {/* Shops */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass-card overflow-hidden"
      >
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground shrink-0">
            Shops <span className="text-sm font-normal text-muted-foreground">({filtered.length})</span>
          </h2>
          <div className="flex-1 flex items-center gap-2 sm:justify-end flex-wrap">
            <div className="relative flex-1 sm:flex-none sm:w-60">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search shops, owners, cities…"
                className="input-base w-full pl-9 pr-3 py-2 rounded-lg text-sm" />
            </div>
            <div className="flex rounded-lg border border-white/[0.08] overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
              {(["all","active","pending","inactive"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={cn("px-3 py-2 text-xs font-medium capitalize transition-colors",
                    filter === f ? "bg-primary text-black" : "text-muted-foreground hover:bg-secondary")}>
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {shopsl ? (
          <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Shop</th>
                  <th>Owner</th>
                  <th>City</th>
                  <th>Barbers</th>
                  <th>Bookings</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((shop, i) => (
                  <motion.tr key={shop.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 + 0.25 }}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0 text-xs font-bold text-muted-foreground">
                          {shop.name.slice(0,2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{shop.name}</p>
                          <p className="text-xs text-muted-foreground">{shop.address}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <p className="font-medium text-sm">{shop.owner.name}</p>
                      <p className="text-xs text-muted-foreground">{shop.owner.phone}</p>
                    </td>
                    <td className="text-muted-foreground">{shop.city}</td>
                    <td className="font-medium text-center">{shop._count.barbers}</td>
                    <td className="font-medium text-center">{shop._count.bookings}</td>
                    <td>
                      {!shop.isVerified
                        ? <span className="badge badge-yellow"><Clock className="w-3 h-3" /> Pending</span>
                        : shop.isActive
                        ? <span className="badge badge-green"><CheckCircle className="w-3 h-3" /> Active</span>
                        : <span className="badge badge-red"><XCircle className="w-3 h-3" /> Suspended</span>
                      }
                    </td>
                    <td className="text-muted-foreground text-xs whitespace-nowrap">
                      {new Date(shop.createdAt).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}
                    </td>
                    <td className="text-right">
                      <div className="relative inline-block">
                        <button onClick={() => setMenu(menu === shop.id ? null : shop.id)}
                          className="p-1.5 rounded-md hover:bg-secondary transition-colors">
                          <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <AnimatePresence>
                          {menu === shop.id && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: -4 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ duration: 0.1 }}
                              className="absolute right-0 top-full mt-1 w-44 glass rounded-xl shadow-dropdown py-1 z-20"
                              onMouseLeave={() => setMenu(null)}
                            >
                              <a
                                href={`/shops/${shop.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:bg-white/[0.06] hover:text-white transition-colors"
                              >
                                <ExternalLink className="w-4 h-4 text-muted-foreground" /> View shop page
                              </a>
                              <a
                                href="/login"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:bg-white/[0.06] hover:text-white transition-colors"
                              >
                                <LogIn className="w-4 h-4 text-muted-foreground" /> Owner login
                              </a>
                              {!shop.isVerified && (
                                <button onClick={() => { verify.mutate(shop.id); setMenu(null); }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-500/10 transition-colors">
                                  <CheckCircle className="w-4 h-4" /> Verify shop
                                </button>
                              )}
                              {shop.isActive && shop.isVerified && (
                                <button onClick={() => { suspend.mutate(shop.id); setMenu(null); }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                                  <Ban className="w-4 h-4" /> Suspend
                                </button>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </td>
                  </motion.tr>
                ))}
                {!filtered.length && (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-muted-foreground">
                      <Store className="w-10 h-10 mx-auto mb-3 text-border" />
                      <p className="font-medium">No shops found</p>
                      <p className="text-sm mt-1">{search ? "Try a different search" : "Register the first shop to get started"}</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {showRegister && <RegisterModal onClose={() => setShowRegister(false)} />}
      </AnimatePresence>
    </div>
  );
}
