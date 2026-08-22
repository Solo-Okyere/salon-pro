"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, User, Star, Calendar, Trash2, X, ChevronDown, ChevronUp, Eye, EyeOff, Search } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface StaffMember {
  id: string;
  bio: string | null;
  specialties: string[];
  rating: number;
  totalReviews: number;
  isAvailable: boolean;
  user: { id: string; name: string; phone: string };
  staffSchedules: Array<{ dayOfWeek: number; startTime: string; endTime: string; isWorking: boolean }>;
  performance: Array<{ date: string; bookingsCount: number; completedCount: number; totalRevenue: number; avgRating: number | null }>;
}
interface ServiceOption { id: string; name: string; durationMinutes: number; price: number; }
interface ShopSettings { id: string; }

const defaultSchedule = DAYS.map((_, i) => ({
  dayOfWeek: i,
  startTime: "09:00",
  endTime: "18:00",
  isWorking: i !== 0,
}));

export default function StaffPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", password: "", bio: "", specialties: [] as string[], schedule: defaultSchedule });
  const [showPw, setShowPw] = useState(false);
  const [serviceSearch, setServiceSearch] = useState("");
  const [servicePickerOpen, setServicePickerOpen] = useState(false);

  const { data: staff, isLoading } = useQuery<StaffMember[]>({
    queryKey: ["staff"],
    queryFn: () => api.get("/api/staff").then((r) => r.data.data),
  });
  const { data: shop } = useQuery<ShopSettings>({
    queryKey: ["shop-settings"],
    queryFn: () => api.get("/api/shops/settings").then((r) => r.data.data),
  });
  const { data: services = [], isLoading: servicesLoading } = useQuery<ServiceOption[]>({
    queryKey: ["services", shop?.id],
    queryFn: () => api.get(`/api/services?shopId=${shop!.id}`).then((r) => r.data.data),
    enabled: Boolean(shop?.id),
  });
  const filteredServices = services.filter((service) => service.name.toLowerCase().includes(serviceSearch.toLowerCase()));

  const addMutation = useMutation({
    mutationFn: () => api.post("/api/staff", {
      name: form.name,
      phone: form.phone,
      password: form.password,
      bio: form.bio,
      specialties: form.specialties,
      schedule: form.schedule,
    }),
    onSuccess: () => {
      toast.success("Staff member added!");
      qc.invalidateQueries({ queryKey: ["staff"] });
      setShowAdd(false);
      setForm({ name: "", phone: "", password: "", bio: "", specialties: [], schedule: defaultSchedule });
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to add staff"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      api.patch(`/api/staff/${id}`, { isAvailable }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/staff/${id}`),
    onSuccess: () => {
      toast.success("Staff deactivated");
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
  });

  const updateSchedule = (i: number, field: string, value: string | boolean) => {
    setForm((f) => {
      const s = [...f.schedule];
      s[i] = { ...s[i], [field]: value };
      return { ...f, schedule: s };
    });
  };
  const toggleService = (name: string) => setForm((current) => ({
    ...current,
    specialties: current.specialties.includes(name)
      ? current.specialties.filter((service) => service !== name)
      : [...current.specialties, name],
  }));

  return (
    <div className="min-h-screen bg-[#080808] text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Staff Management</h1>
            <p className="text-white/60 text-sm mt-1">{staff?.length ?? 0} barbers</p>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-[#d4a017] hover:bg-[#b8860b] text-black font-semibold px-4 py-2 rounded-xl transition-colors text-sm">
            <Plus className="w-4 h-4" /> Add Barber
          </button>
        </div>

        {/* Staff List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-white/5 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-3">
            {(staff ?? []).map((s) => {
              const last7 = s.performance.slice(0, 7);
              const totalRev = last7.reduce((a, p) => a + p.totalRevenue, 0);
              const totalCompleted = last7.reduce((a, p) => a + p.completedCount, 0);

              return (
                <motion.div key={s.id} layout className="bg-[#111] border border-white/10 rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between p-4 cursor-pointer"
                    onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-[#d4a017]/10 rounded-xl flex items-center justify-center">
                        <User className="w-6 h-6 text-[#d4a017]" />
                      </div>
                      <div>
                        <p className="font-semibold">{s.user.name}</p>
                        <p className="text-sm text-white/60">{s.user.phone}</p>
                        {s.specialties.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {s.specialties.slice(0, 3).map((sp) => (
                              <span key={sp} className="text-xs bg-white/5 px-2 py-0.5 rounded-full">{sp}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right hidden md:block">
                        <div className="flex items-center gap-1 text-sm">
                          <Star className="w-4 h-4 text-[#d4a017]" />
                          <span className="font-semibold">{s.rating.toFixed(1)}</span>
                            <span className="text-white/60">({s.totalReviews})</span>
                        </div>
                        <p className="text-xs text-white/60">7d: GHS {totalRev.toFixed(0)} · {totalCompleted} cuts</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleMutation.mutate({ id: s.id, isAvailable: !s.isAvailable }); }}
                        className={cn("px-3 py-1 rounded-full text-xs font-medium transition-colors",
                          s.isAvailable ? "bg-green-500/20 text-green-400 hover:bg-green-500/30" : "bg-red-500/20 text-red-400 hover:bg-red-500/30")}>
                        {s.isAvailable ? "Available" : "Unavailable"}
                      </button>
                      {expanded === s.id ? <ChevronUp className="w-4 h-4 text-white/50" /> : <ChevronDown className="w-4 h-4 text-white/50" />}
                    </div>
                  </div>

                  <AnimatePresence>
                    {expanded === s.id && (
                      <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                        className="overflow-hidden border-t border-white/10">
                        <div className="p-4 space-y-4">
                          {s.bio && <p className="text-sm text-white/60">{s.bio}</p>}

                          {/* Schedule */}
                          <div>
                            <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-[#d4a017]" /> Weekly Schedule
                            </p>
                            <div className="grid grid-cols-7 gap-1">
                              {DAYS.map((day, i) => {
                                const sched = s.staffSchedules.find((sc) => sc.dayOfWeek === i);
                                return (
                                    <div key={day} className={cn("text-center p-2 rounded-lg text-xs", sched?.isWorking ? "bg-[#d4a017]/10 border border-[#d4a017]/20" : "bg-white/5 text-white/50")}>
                                    <p className="font-semibold">{day}</p>
                                    {sched?.isWorking ? (
                                      <>
                                        <p className="text-white/50">{sched.startTime}</p>
                                        <p className="text-white/50">{sched.endTime}</p>
                                      </>
                                    ) : <p className="text-white/50">Off</p>}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* 7-day performance */}
                          {last7.length > 0 && (
                            <div>
                              <p className="text-sm font-semibold mb-2">Last 7 Days Performance</p>
                              <div className="grid grid-cols-3 gap-3">
                                {[
                                  { label: "Cuts Done", value: totalCompleted },
                                  { label: "Revenue", value: `GHS ${totalRev.toFixed(0)}` },
                                  { label: "Avg Rating", value: last7.filter((p) => p.avgRating).length > 0 ? (last7.reduce((a, p) => a + (p.avgRating ?? 0), 0) / last7.filter((p) => p.avgRating).length).toFixed(1) : "N/A" },
                                ].map((m) => (
                                  <div key={m.label} className="bg-white/5 rounded-lg p-3 text-center">
                                    <p className="text-lg font-bold">{m.value}</p>
                                    <p className="text-xs text-white/60">{m.label}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="flex justify-end">
                            <button onClick={() => { if (confirm("Deactivate this barber?")) deleteMutation.mutate(s.id); }}
                              className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors">
                              <Trash2 className="w-4 h-4" /> Deactivate
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Add Barber Modal */}
        <AnimatePresence>
          {showAdd && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center justify-center p-4">
              <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
                className="bg-[#111] border border-white/10 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold">Add New Barber</h2>
                  <button onClick={() => setShowAdd(false)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-white/50 block mb-1">Full Name *</label>
                    <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Kwame Mensah"
                      className="w-full bg-[#080808] border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-[#d4a017] transition-colors" />
                  </div>
                  <div>
                    <label className="text-sm text-white/50 block mb-1">Phone Number *</label>
                    <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="0XX XXX XXXX"
                      className="w-full bg-[#080808] border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-[#d4a017] transition-colors" />
                  </div>
                  <div>
                    <label className="text-sm text-white/60 block mb-1">Login Password * <span className="text-white/50 font-normal">(barber uses this to sign in)</span></label>
                    <div className="relative">
                      <input type={showPw ? "text" : "password"} value={form.password}
                        onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                        placeholder="Min 6 characters"
                        className="w-full bg-[#080808] border border-white/10 rounded-xl px-4 py-3 pr-11 focus:outline-none focus:border-[#d4a017] transition-colors" />
                      <button type="button" onClick={() => setShowPw(v => !v)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80 transition-colors">
                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-white/50 block mb-1">Bio</label>
                    <textarea value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                      placeholder="Short bio..."
                      rows={2}
                      className="w-full bg-[#080808] border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-[#d4a017] transition-colors resize-none" />
                  </div>
                  <div>
                    <label htmlFor="barber-services" className="text-sm text-white/50 block mb-1">Services</label>
                    <div className="rounded-xl border border-white/10 bg-[#080808] p-2">
                      {form.specialties.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {form.specialties.map((service) => (
                            <button key={service} type="button" onClick={() => toggleService(service)} className="inline-flex items-center gap-1 rounded-lg bg-[#d4a017]/15 px-2 py-1 text-xs font-medium text-[#f5c842] hover:bg-[#d4a017]/25">
                              {service}<X className="size-3" aria-hidden="true" />
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-white/35" />
                        <input id="barber-services" value={serviceSearch} onFocus={() => setServicePickerOpen(true)} onChange={(e) => { setServiceSearch(e.target.value); setServicePickerOpen(true); }}
                          placeholder="Search services…" aria-expanded={servicePickerOpen} aria-controls="barber-service-list"
                          className="w-full border-0 bg-transparent py-2 pl-8 pr-2 text-sm text-white placeholder:text-white/35 focus:outline-none" />
                      </div>
                    </div>
                    {servicePickerOpen && (
                      <div id="barber-service-list" className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-[#111] p-1" role="listbox" aria-label="Available services">
                        {servicesLoading ? <p className="px-3 py-4 text-sm text-white/50">Loading services…</p> : filteredServices.length ? filteredServices.map((service) => (
                          <label key={service.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-white/5">
                            <input type="checkbox" checked={form.specialties.includes(service.name)} onChange={() => toggleService(service.name)} className="accent-[#d4a017]" />
                            <span className="flex-1">{service.name}</span>
                            <span className="text-xs text-white/45">{service.durationMinutes} min · GHS {service.price}</span>
                          </label>
                        )) : <p className="px-3 py-4 text-sm text-white/50">No matching services.</p>}
                      </div>
                    )}
                  </div>

                  {/* Schedule */}
                  <div>
                    <label className="text-sm text-white/50 block mb-2">Weekly Schedule</label>
                    <div className="space-y-2">
                      {DAYS.map((day, i) => (
                        <div key={day} className="flex items-center gap-3">
                          <input type="checkbox" checked={form.schedule[i].isWorking}
                            onChange={(e) => updateSchedule(i, "isWorking", e.target.checked)}
                            className="accent-[#d4a017]" />
                          <span className="text-sm w-8">{day}</span>
                          {form.schedule[i].isWorking && (
                            <>
                              <input type="time" value={form.schedule[i].startTime}
                                onChange={(e) => updateSchedule(i, "startTime", e.target.value)}
                                className="bg-[#080808] border border-white/10 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-[#d4a017]" />
                              <span className="text-white/50">—</span>
                              <input type="time" value={form.schedule[i].endTime}
                                onChange={(e) => updateSchedule(i, "endTime", e.target.value)}
                                className="bg-[#080808] border border-white/10 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-[#d4a017]" />
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <button onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !form.name || !form.phone || form.password.length < 6}
                    className="w-full bg-[#d4a017] hover:bg-[#b8860b] disabled:opacity-40 text-black font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                    {addMutation.isPending ? <span className="animate-spin rounded-full border-2 border-black border-t-transparent w-5 h-5" /> : "Add Barber"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
