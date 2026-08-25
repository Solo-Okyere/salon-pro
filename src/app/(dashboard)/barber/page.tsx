"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Scissors, Clock, CheckCircle, DollarSign, Users,
  ChevronRight, Loader2, Phone, Star, Calendar,
  ToggleLeft, ToggleRight, Bell, BellOff,
} from "lucide-react";
import api from "@/lib/api";
import { formatCurrency, formatTime, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { MetricCard } from "@/components/ui/MetricCard";
import { useQueueEvents } from "@/hooks/useQueueEvents";
import { playChime, primeAudio, isSoundEnabled, setSoundEnabled } from "@/lib/sound";

interface BarberDashData {
  barber: {
    id: string; name: string; rating: number; isAvailable: boolean;
    shop: { id: string; name: string; slug: string };
  };
  today: { bookings: Booking[]; completedCount: number; revenue: number; queueCount: number };
  queue: QueueEntry[];
  upcoming: Booking[];
}

interface Booking {
  id: string;
  scheduledAt: string;
  status: string;
  totalAmount: number;
  customer: { id: string; name: string; phone: string; avatar: string | null };
  service: { name: string; durationMinutes: number };
}

interface QueueEntry {
  id: string;
  queueNumber: number;
  status: string;
  isPremium: boolean;
  estimatedWaitMinutes: number;
  customer: { id: string; name: string; phone: string };
  service: { name: string } | null;
}

const bookingStatusColor: Record<string, string> = {
  CONFIRMED:   "text-blue-500 bg-blue-500/10",
  IN_PROGRESS: "text-primary bg-primary/10",
  COMPLETED:   "text-green-500 bg-green-500/10",
  PENDING:     "text-yellow-500 bg-yellow-500/10",
};

// ── Avatar chip ───────────────────────────────────────────────────────────────
function Avatar({ name, size = 9 }: { name: string; size?: number }) {
  return (
    <div
      className={cn(
        "rounded-xl flex items-center justify-center text-xs font-bold text-black shrink-0",
        `w-${size} h-${size}`
      )}
      style={{ background: "linear-gradient(135deg, #d4a017, #f5c842)" }}
    >
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

// ── Wait ring ─────────────────────────────────────────────────────────────────
function WaitRing({ minutes, maxMinutes = 120 }: { minutes: number; maxMinutes?: number }) {
  const pct = Math.min(minutes / maxMinutes, 1);
  const r = 14;
  const circ = 2 * Math.PI * r;
  const dash = circ * (1 - pct);
  return (
    <svg width="36" height="36" className="shrink-0 -rotate-90">
      <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
      <circle
        cx="18" cy="18" r={r} fill="none"
        stroke={minutes > 60 ? "#ef4444" : minutes > 30 ? "#f59e0b" : "#22c55e"}
        strokeWidth="3"
        strokeDasharray={circ}
        strokeDashoffset={dash}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
      />
      <text
        x="18" y="18"
        textAnchor="middle" dominantBaseline="central"
        className="fill-foreground"
        style={{ fontSize: "8px", fontWeight: 700, transform: "rotate(90deg)", transformOrigin: "18px 18px" }}
      >
        {minutes}m
      </text>
    </svg>
  );
}

export default function BarberDashboard() {
  const queryClient = useQueryClient();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [newEntryId, setNewEntryId] = useState<string | null>(null);
  const [queuePollingStopped, setQueuePollingStopped] = useState(false);

  // Initialise sound state from localStorage after mount
  useEffect(() => {
    setSoundOn(isSoundEnabled());
  }, []);

  // Auto-prime AudioContext on the barber's first interaction anywhere on the page
  useEffect(() => {
    const handler = () => primeAudio();
    document.addEventListener("pointerdown", handler, { once: true });
    return () => document.removeEventListener("pointerdown", handler);
  }, []);

  const { data, isLoading } = useQuery<{ data: BarberDashData }>({
    queryKey: ["barber-dashboard"],
    queryFn: () => api.get("/api/dashboard/barber").then((r) => r.data),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (available === null && data?.data.barber.isAvailable !== undefined) {
      setAvailable(data.data.barber.isAvailable);
    }
  }, [data, available]);

  const shopId = data?.data?.barber?.shop?.id ?? null;

  // ── SSE: real-time queue events ──────────────────────────────────────────────
  const handleJoin = useCallback(
    (evt: import("@/hooks/useQueueEvents").QueueEvent) => {
      const name = (evt.entry?.customer as { name?: string })?.name ?? "A customer";
      queryClient.invalidateQueries({ queryKey: ["barber-dashboard"] });
      toast.success(`🔔 ${name} joined the queue`);
      if (isSoundEnabled()) playChime();
      // Flash the new entry card
      const entryId = (evt.entry?.id as string) ?? null;
      if (entryId) {
        setNewEntryId(entryId);
        setTimeout(() => setNewEntryId(null), 2500);
      }
    },
    [queryClient]
  );

  const handleUpdate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["barber-dashboard"] });
  }, [queryClient]);

  useQueueEvents(shopId, {
    onJoin: handleJoin,
    onUpdate: handleUpdate,
    onStopped: () => setQueuePollingStopped(true),
  });

  // ── Mutations ────────────────────────────────────────────────────────────────
  const availabilityMutation = useMutation({
    mutationFn: (isAvailable: boolean) => api.patch("/api/barber/availability", { isAvailable }),
    onSuccess: (_, isAvailable) => {
      setAvailable(isAvailable);
      toast.success(isAvailable ? "You are now accepting customers" : "You are now set to unavailable");
      queryClient.invalidateQueries({ queryKey: ["barber-dashboard"] });
    },
    onError: () => toast.error("Failed to update availability"),
  });

  const callMutation = useMutation({
    mutationFn: (entryId: string) => api.patch(`/api/queue/${entryId}`, { action: "call" }),
    onSuccess: () => { toast.success("Customer called"); queryClient.invalidateQueries({ queryKey: ["barber-dashboard"] }); },
  });

  const startMutation = useMutation({
    mutationFn: (entryId: string) => api.patch(`/api/queue/${entryId}`, { action: "start" }),
    onSuccess: () => { toast.success("Service started"); queryClient.invalidateQueries({ queryKey: ["barber-dashboard"] }); },
  });

  const completeMutation = useMutation({
    mutationFn: (entryId: string) => api.patch(`/api/queue/${entryId}`, { action: "complete" }),
    onSuccess: () => { toast.success("Service completed ✓"); queryClient.invalidateQueries({ queryKey: ["barber-dashboard"] }); },
  });

  const completeBookingMutation = useMutation({
    mutationFn: (bookingId: string) => api.patch(`/api/bookings/${bookingId}`, { status: "COMPLETED" }),
    onSuccess: () => { toast.success("Booking marked complete"); queryClient.invalidateQueries({ queryKey: ["barber-dashboard"] }); },
  });

  const d: BarberDashData | undefined = data?.data;
  const isAvailable = available ?? d?.barber.isAvailable ?? true;

  function toggleSound() {
    primeAudio(); // ensure AudioContext is unlocked on every toggle gesture
    if (!soundOn) {
      setSoundEnabled(true);
      setSoundOn(true);
      toast.success("Queue alerts enabled 🔔");
    } else {
      setSoundEnabled(false);
      setSoundOn(false);
      toast("Queue alerts muted");
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Hey, {d?.barber.name} ✂️</h1>
          <p className="text-white/60 text-sm">{d?.barber.shop.name}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">

          {/* Sound alerts toggle */}
          <button
            onClick={toggleSound}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-semibold transition-all",
              soundOn
                ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                : "border-white/10 bg-secondary text-white/50 hover:bg-secondary/80"
            )}
            title={soundOn ? "Mute queue alerts" : "Enable queue alerts (tap once to allow sound)"}
          >
            {soundOn ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            {soundOn ? "Alerts on" : "Alerts off"}
          </button>

          {/* Availability toggle */}
          <button
            onClick={() => availabilityMutation.mutate(!isAvailable)}
            disabled={availabilityMutation.isPending}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-semibold transition-all",
              isAvailable
                ? "border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/20"
                : "border-white/10 bg-secondary text-white/50 hover:bg-secondary/80"
            )}
          >
            {isAvailable ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            {isAvailable ? "Available" : "Unavailable"}
          </button>

          <div className="flex items-center gap-1.5 text-sm font-semibold text-primary">
            <Star className="w-4 h-4 fill-primary" />
            {d?.barber.rating.toFixed(1)}
          </div>
        </div>
      </div>

      {/* Today Stats — using shared MetricCard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricCard label="Bookings"  rawValue={d?.today.bookings.length ?? 0}  icon={Calendar}    iconBg="bg-blue-500/10"   iconColor="#3b82f6"  delay={0} />
        <MetricCard label="Completed" rawValue={d?.today.completedCount ?? 0}   icon={CheckCircle} iconBg="bg-green-500/10"  iconColor="#22c55e"  delay={0.05} />
        <MetricCard label="Revenue"   rawValue={d?.today.revenue ?? 0}          icon={DollarSign}  iconBg="bg-primary/10"   iconColor="#d4a017"  prefix="₵"  delay={0.1} />
        <MetricCard label="Queue"     rawValue={d?.today.queueCount ?? 0}       icon={Users}       iconBg="bg-orange-500/10" iconColor="#f97316" delay={0.15} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">

        {/* Live Queue */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Live Queue
              {shopId && (
                <span className="text-[10px] font-normal text-white/60 border border-green-500/30 px-1.5 py-0.5 rounded-full bg-green-500/5">
                  LIVE
                </span>
              )}
            </h2>
            <span className="text-xs text-white/60">{d?.queue.length ?? 0} waiting</span>
          </div>

          <div className="space-y-2">
            {queuePollingStopped && (
              <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
                Queue updates paused because the queue service is unavailable. The dashboard will continue its slower refresh.
              </div>
            )}
            <AnimatePresence initial={false}>
              {d?.queue.map((entry) => {
                const isNew = entry.id === newEntryId;
                const borderCls =
                  entry.status === "IN_SERVICE" ? "border-primary/50 bg-primary/5" :
                  entry.status === "CALLED"     ? "border-green-500/50 bg-green-500/5" :
                  isNew                         ? "border-yellow-500/60 bg-yellow-500/5" :
                  "border-border";

                return (
                  <motion.div
                    key={entry.id}
                    layout
                    initial={{ opacity: 0, x: -16, scale: 0.97 }}
                    animate={{
                      opacity: 1, x: 0, scale: 1,
                      boxShadow: isNew ? "0 0 0 2px rgba(234,179,8,0.4)" : "none",
                    }}
                    exit={{ opacity: 0, x: 16, scale: 0.97 }}
                    transition={{ duration: 0.25 }}
                    className={cn("p-3 rounded-xl border transition-colors", borderCls)}
                  >
                    <div className="flex items-center gap-3">
                      {/* Position chip */}
                      <div className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 relative",
                        entry.isPremium
                          ? "text-black shadow-lg"
                          : "bg-secondary text-foreground"
                      )}
                        style={entry.isPremium ? { background: "linear-gradient(135deg,#d4a017,#f5c842)", boxShadow: "0 4px 12px rgba(212,160,23,0.4)" } : {}}
                      >
                        #{entry.queueNumber}
                        {entry.isPremium && (
                          <span className="absolute -top-1 -right-1 text-[8px] bg-yellow-500 text-black rounded-full px-1 font-black">★</span>
                        )}
                      </div>

                      {/* Customer info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{entry.customer.name}</p>
                        <p className="text-xs text-white/60 truncate">
                          {entry.service?.name ?? "General"}
                        </p>
                      </div>

                      {/* Wait ring */}
                      {entry.estimatedWaitMinutes > 0 && (
                        <WaitRing minutes={entry.estimatedWaitMinutes} />
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {entry.status === "WAITING" && (
                          <button
                            onClick={() => callMutation.mutate(entry.id)}
                            disabled={callMutation.isPending}
                            className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all disabled:opacity-60"
                          >
                            Call
                          </button>
                        )}
                        {entry.status === "CALLED" && (
                          <button
                            onClick={() => startMutation.mutate(entry.id)}
                            disabled={startMutation.isPending}
                            className="text-xs px-3 py-1.5 rounded-lg bg-green-500 text-white font-semibold hover:bg-green-600 transition-all disabled:opacity-60"
                          >
                            Start ✂️
                          </button>
                        )}
                        {entry.status === "IN_SERVICE" && (
                          <button
                            onClick={() => completeMutation.mutate(entry.id)}
                            disabled={completeMutation.isPending}
                            className="text-xs px-3 py-1.5 rounded-lg bg-green-500 text-white font-semibold hover:bg-green-600 transition-all disabled:opacity-60"
                          >
                            Done ✓
                          </button>
                        )}
                        <a
                          href={`tel:${entry.customer.phone}`}
                          className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                          title="Call customer"
                        >
                          <Phone className="w-3.5 h-3.5 text-white/60" />
                        </a>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {(!d?.queue || d.queue.length === 0) && (
              <div className="text-center py-10">
                <Scissors className="w-8 h-8 mx-auto mb-2 text-border" />
                <p className="text-white/60 text-sm">Queue is empty</p>
              </div>
            )}
          </div>
        </div>

        {/* Today's Bookings */}
        <div className="glass-card p-5">
          <h2 className="font-bold flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-primary" /> Today&apos;s Bookings
          </h2>
          <div className="space-y-2">
            {d?.today.bookings.map((booking) => (
              <motion.div
                key={booking.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Avatar name={booking.customer.name} size={9} />
                  <div>
                    <p className="text-sm font-medium">{booking.customer.name}</p>
                    <p className="text-xs text-white/60">
                      {booking.service.name} · {formatTime(booking.scheduledAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", bookingStatusColor[booking.status] ?? "bg-secondary text-foreground")}>
                    {booking.status.replace("_", " ")}
                  </span>
                  {booking.status === "CONFIRMED" && (
                    <button
                      onClick={() => completeBookingMutation.mutate(booking.id)}
                      disabled={completeBookingMutation.isPending}
                      className="p-1 rounded-lg hover:bg-green-500/10 transition-colors"
                      title="Mark complete"
                    >
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
            {(!d?.today.bookings || d.today.bookings.length === 0) && (
                <p className="text-center text-white/60 text-sm py-8">No bookings today</p>
            )}
          </div>
        </div>
      </div>

      {/* Upcoming Bookings */}
      {d?.upcoming && d.upcoming.length > 0 && (
        <div className="mt-6 glass-card p-5">
          <h2 className="font-bold flex items-center gap-2 mb-4">
            <ChevronRight className="w-4 h-4 text-primary" /> Upcoming
          </h2>
          <div className="space-y-2">
            {d.upcoming.map((b) => (
              <div key={b.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-secondary/50 transition-colors">
                <div className="flex items-center gap-3">
                  <Avatar name={b.customer.name} size={9} />
                  <div>
                    <p className="text-sm font-medium">{b.customer.name}</p>
                    <p className="text-xs text-white/60">{b.service.name} · {b.service.durationMinutes}min</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatTime(b.scheduledAt)}</p>
                  <p className="text-xs text-white/60">{formatDate(b.scheduledAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
