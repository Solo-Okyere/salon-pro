"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Clock, Scissors, Loader2, Trophy, Phone, User, Star, CheckCircle,
} from "lucide-react";
import { queueAPI } from "@/lib/api";
import { useAuthStore } from "@/store/slices/authSlice";
import { useQueueEvents } from "@/hooks/useQueueEvents";
import { cn } from "@/lib/utils";
import type { QueueEntry } from "@/types";

// ── Types ─────────────────────────────────────────────────────────────────────
interface BarberStat {
  id: string;
  name: string;
  avatar: string | null;
  rating: number;
  waiting: number;
  inService: boolean;
  estimatedWaitMinutes: number;
}

interface QueueStatus {
  shop: { id: string; name: string };
  entries: QueueEntry[];
  barbers: BarberStat[];
  totalWaiting: number;
  currentlyServing: QueueEntry | null;
}

// ── Wait ring ─────────────────────────────────────────────────────────────────
function WaitRing({ minutes }: { minutes: number }) {
  const r = 16;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(minutes / 120, 1);
  const dash = circ * (1 - pct);
  const color = minutes > 60 ? "#ef4444" : minutes > 30 ? "#f59e0b" : "#22c55e";
  return (
    <svg width="40" height="40" className="-rotate-90 shrink-0">
      <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
      <circle
        cx="20" cy="20" r={r} fill="none"
        stroke={color} strokeWidth="3"
        strokeDasharray={circ} strokeDashoffset={dash}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
      />
      <text
        x="20" y="20" textAnchor="middle" dominantBaseline="central"
        className="fill-foreground"
        style={{ fontSize: "8px", fontWeight: 700, transform: "rotate(90deg)", transformOrigin: "20px 20px" }}
      >
        {minutes}m
      </text>
    </svg>
  );
}

// ── Barber selection card ─────────────────────────────────────────────────────
function BarberCard({
  barber,
  selected,
  isBest,
  onClick,
}: {
  barber: BarberStat;
  selected: boolean;
  isBest: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      className={cn(
        "relative w-full text-left p-4 rounded-2xl border transition-all",
        selected
          ? "border-primary bg-primary/8 shadow-lg shadow-primary/10"
          : "border-border bg-card hover:border-border/80 hover:bg-card/80"
      )}
    >
      {/* "Shortest wait" badge */}
      {isBest && (
        <span className="absolute -top-2.5 left-4 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
          style={{ background: "linear-gradient(135deg,#d4a017,#f5c842)", color: "#000" }}>
          Shortest wait ★
        </span>
      )}

      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black text-black shrink-0"
          style={{ background: "linear-gradient(135deg,#d4a017,#f5c842)" }}
        >
          {barber.name.slice(0, 2).toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{barber.name}</p>
          <div className="flex items-center gap-1.5 text-xs text-white/60 mt-0.5">
            {barber.rating > 0 && (
              <span className="flex items-center gap-0.5">
                <Star className="w-3 h-3 fill-[#d4a017] text-[#d4a017]" />
                {barber.rating.toFixed(1)}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {barber.waiting} waiting
            </span>
          </div>
        </div>

        {/* Right side: wait time + status dot */}
        <div className="text-right shrink-0">
          <p className="text-sm font-bold">~{barber.estimatedWaitMinutes}min</p>
          <span className={cn(
            "inline-flex items-center gap-1 text-[10px] font-semibold mt-0.5",
            barber.inService ? "text-primary" : barber.waiting === 0 ? "text-green-500" : "text-white/50"
          )}>
            <span className={cn(
              "w-1.5 h-1.5 rounded-full",
              barber.inService ? "bg-primary animate-pulse" :
              barber.waiting === 0 ? "bg-green-500" : "bg-muted-foreground"
            )} />
            {barber.inService ? "Busy" : barber.waiting === 0 ? "Free" : "Queued"}
          </span>
        </div>
      </div>

      {/* Selected ring */}
      {selected && (
        <span className="absolute top-3 right-3">
          <CheckCircle className="w-4 h-4 text-primary" />
        </span>
      )}
    </motion.button>
  );
}

// ── Main queue board ──────────────────────────────────────────────────────────
function QueueBoard() {
  const searchParams = useSearchParams();
  const shopId = searchParams.get("shopId") ?? "";
  const user = useAuthStore((s) => s.user);

  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  // Barber selection
  const [selectedBarberId, setSelectedBarberId] = useState<string | null>(null);

  // Guest state
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestCustomerId, setGuestCustomerId] = useState<string | null>(null);
  const [showGuestForm, setShowGuestForm] = useState(false);

  // New-entry highlight
  const [newEntryId, setNewEntryId] = useState<string | null>(null);
  const [queuePollingStopped, setQueuePollingStopped] = useState(false);

  // Restore guest customerId from localStorage on mount
  useEffect(() => {
    if (!shopId || user) return;
    const stored = localStorage.getItem(`guest_queue_${shopId}`);
    if (stored) setGuestCustomerId(stored);
  }, [shopId, user]);

  const fetchStatus = useCallback(async () => {
    if (!shopId) return;
    try {
      const { data } = await queueAPI.status(shopId);
      const nextStatus: QueueStatus = data.data;
      setStatus(nextStatus);
      // Auto-select the least-busy barber on first load (if none chosen yet)
      setSelectedBarberId(prev => {
        if (prev) return prev; // keep user's choice
        return nextStatus.barbers?.[0]?.id ?? null; // already sorted least-busy first
      });
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000); // slow fallback; SSE handles live
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // ── SSE live updates ──────────────────────────────────────────────────────
  const handleJoin = useCallback(
    (evt: import("@/hooks/useQueueEvents").QueueEvent) => {
      fetchStatus();
      const entryId = (evt.entry?.id as string) ?? null;
      if (entryId) {
        setNewEntryId(entryId);
        setTimeout(() => setNewEntryId(null), 2500);
      }
    },
    [fetchStatus]
  );

  const handleUpdate = useCallback(() => { fetchStatus(); }, [fetchStatus]);

  useQueueEvents(shopId || null, {
    onJoin: handleJoin,
    onUpdate: handleUpdate,
    onStopped: () => setQueuePollingStopped(true),
    enabled: !!shopId,
  });

  // ── Join queue ────────────────────────────────────────────────────────────
  async function joinQueue(isPremium = false) {
    if (!shopId) return;
    setJoining(true);
    try {
      const payload: Record<string, unknown> = { shopId, isPremium };
      if (selectedBarberId) payload.barberId = selectedBarberId;
      if (!user) {
        payload.customerName = guestName.trim();
        payload.customerPhone = guestPhone.trim();
      }
      const res = await queueAPI.join(payload);
      const entry = res.data?.data;
      if (!user && entry?.customerId) {
        localStorage.setItem(`guest_queue_${shopId}`, entry.customerId);
        setGuestCustomerId(entry.customerId);
      }
      setShowGuestForm(false);
      await fetchStatus();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? "Could not join queue. Please try again.";
      alert(msg);
    } finally {
      setJoining(false);
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const activeCustomerId = user?.id ?? guestCustomerId;
  // Filter queue to the selected barber's entries
  const barberEntries = status?.entries.filter(e =>
    selectedBarberId ? (e as unknown as { barberId: string | null }).barberId === selectedBarberId : true
  ) ?? [];
  const waitingEntries = barberEntries.filter(e => e.status === "WAITING");
  const myEntry = barberEntries.find(e => e.customer.id === activeCustomerId);
  const myPosition = myEntry ? waitingEntries.indexOf(myEntry) + 1 : null;
  const guestFormValid = guestName.trim().length >= 2 && guestPhone.trim().length >= 9;

  const selectedBarber = status?.barbers.find(b => b.id === selectedBarberId) ?? null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white/60">
        Shop not found
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 max-w-2xl mx-auto pb-36">

      {/* Header */}
        <div className="flex items-center justify-between mb-6 pt-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{status.shop.name}</h1>
            <p className="text-white/60 text-sm flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Live Queue
              {queuePollingStopped && <span className="text-[10px] font-normal text-yellow-200 border border-yellow-500/30 px-1.5 py-0.5 rounded-full">UPDATES PAUSED</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-semibold">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            Live
          </div>
        </div>

        {/* Shop-wide stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-2xl border border-border bg-card">
            <div className="flex items-center gap-2 text-white/60 text-xs mb-2">
              <Users className="w-3.5 h-3.5" /> Total waiting
            </div>
            <div className="text-3xl font-extrabold">{status.totalWaiting}</div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="p-4 rounded-2xl border border-border bg-card">
            <div className="flex items-center gap-2 text-white/60 text-xs mb-2">
              <Scissors className="w-3.5 h-3.5" /> Barbers
            </div>
            <div className="text-3xl font-extrabold">{status.barbers.length}</div>
          </motion.div>
        </div>

      {/* ── Choose your barber ─────────────────────────────────────────────── */}
      {status.barbers.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-white/60 mb-3 uppercase tracking-wider">
            Choose your barber
          </h2>
          <div className="space-y-3">
            {status.barbers.map((b, idx) => (
              <BarberCard
                key={b.id}
                barber={b}
                selected={selectedBarberId === b.id}
                isBest={idx === 0}
                onClick={() => setSelectedBarberId(b.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* My Position (scoped to selected barber) */}
      <AnimatePresence>
        {myEntry && myPosition !== null && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
            className="p-5 rounded-2xl border-2 border-primary bg-primary/5 mb-6"
          >
            <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/60 mb-1">
                    Your position{selectedBarber ? ` with ${selectedBarber.name}` : ""}
                  </p>
                  <div className="text-5xl font-extrabold text-primary">#{myPosition}</div>
                  <p className="text-sm text-white/60 mt-1">
                    ~{(myPosition - 1) * 30} min wait
                  </p>
                </div>
              <div className={cn(
                "px-3 py-1.5 rounded-full text-xs font-bold uppercase",
                myEntry.status === "CALLED"     ? "bg-green-500/15 text-green-500" :
                myEntry.status === "IN_SERVICE" ? "bg-primary/15 text-primary" :
                "bg-secondary text-foreground"
              )}>
                {myEntry.status === "CALLED"     ? "🔔 Your turn!" :
                 myEntry.status === "IN_SERVICE" ? "✂️ Being served" : "Waiting"}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Currently Serving (selected barber) */}
      {status.currentlyServing &&
        (selectedBarberId == null ||
          (status.currentlyServing as unknown as { barberId?: string }).barberId === selectedBarberId
        ) && (
        <div className="p-4 rounded-2xl bg-secondary/50 border border-border mb-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            <Scissors className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-xs text-white/60">
              Currently serving{selectedBarber ? ` (${selectedBarber.name})` : ""}
            </p>
            <p className="text-sm font-semibold">
              #{status.currentlyServing.queueNumber} — {status.currentlyServing.customer?.name}
            </p>
          </div>
        </div>
      )}

      {/* Queue List (scoped to selected barber) */}
      <div className="space-y-2 mb-8">
        <h2 className="text-sm font-semibold text-white/60 mb-3 uppercase tracking-wider">
          Queue
        </h2>
        <AnimatePresence initial={false}>
          {waitingEntries.map((entry, idx) => {
            const isMe  = entry.customer.id === activeCustomerId;
            const isNew = entry.id === newEntryId;
            return (
              <motion.div
                key={entry.id}
                layout
                initial={{ opacity: 0, x: -16 }}
                animate={{
                  opacity: 1, x: 0,
                  boxShadow: isNew ? "0 0 0 2px rgba(234,179,8,0.4)" : "none",
                }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ delay: idx * 0.04 }}
                className={cn(
                  "flex items-center justify-between p-4 rounded-xl border transition-colors",
                  isMe   ? "border-primary/40 bg-primary/5" :
                  isNew  ? "border-yellow-500/40 bg-yellow-500/5" :
                  "border-border bg-card"
                )}
              >
                <div className="flex items-center gap-3">
                  {/* Position / premium chip */}
                  <div
                    className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0",
                      entry.isPremium ? "text-black shadow-lg" : "bg-secondary text-foreground"
                    )}
                    style={entry.isPremium
                      ? { background: "linear-gradient(135deg,#d4a017,#f5c842)", boxShadow: "0 4px 12px rgba(212,160,23,0.4)" }
                      : {}}
                  >
                    {entry.isPremium ? <Trophy className="w-4 h-4" /> : `#${entry.queueNumber}`}
                  </div>

                  <div>
                    <p className="text-sm font-medium">
                      {isMe ? "You" : `Customer #${entry.queueNumber}`}
                    </p>
                    <p className="text-xs text-white/60">~{idx * 30} min wait</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {entry.isPremium && (
                    <span className="text-xs font-semibold text-primary px-2 py-0.5 rounded-full bg-primary/10">
                      Premium
                    </span>
                  )}
                  {idx > 0 && <WaitRing minutes={idx * 30} />}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {waitingEntries.length === 0 && (
          <div className="text-center py-12 text-white/60 text-sm">
            {selectedBarber
              ? `${selectedBarber.name} has no one waiting — go right in!`
              : "Queue is empty — walk right in!"}
          </div>
        )}
      </div>

      {/* ── Join Queue CTA ──────────────────────────────────────────────────── */}

      {/* Must have a barber selected to join */}
      {!myEntry && selectedBarberId && (
        <>
          {/* Logged-in: direct join */}
          {user && (
            <div className="fixed bottom-6 left-4 right-4 max-w-2xl mx-auto flex gap-3">
              <button
                onClick={() => joinQueue(false)}
                disabled={joining}
                className="flex-1 py-4 rounded-2xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all shadow-lg shadow-primary/30 disabled:opacity-60"
              >
                {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                Join {selectedBarber ? selectedBarber.name : "Queue"}
              </button>
              <button
                onClick={() => joinQueue(true)}
                disabled={joining}
                className="px-5 py-4 rounded-2xl border-2 border-primary bg-background font-bold text-primary flex items-center justify-center gap-2 hover:bg-primary/5 transition-all disabled:opacity-60"
              >
                <Trophy className="w-4 h-4" /> Premium
              </button>
            </div>
          )}

          {/* Guest: name+phone form */}
          {!user && (
            <div className="fixed bottom-6 left-4 right-4 max-w-2xl mx-auto">
              <AnimatePresence mode="wait">
                {!showGuestForm ? (
                  <motion.button
                    key="open-form"
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                    onClick={() => setShowGuestForm(true)}
                    className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all shadow-lg"
                  >
                    <Users className="w-4 h-4" />
                    Join {selectedBarber ? selectedBarber.name : "Queue"}
                  </motion.button>
                ) : (
                  <motion.div
                    key="guest-form"
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
                    className="bg-card border border-border rounded-2xl p-5 shadow-2xl space-y-3"
                  >
                    <p className="text-sm font-semibold text-foreground">
                      Enter your details to join{selectedBarber ? ` ${selectedBarber.name}'s queue` : ""}
                    </p>
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-white/60 shrink-0" />
                      <input
                        type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)}
                        placeholder="Full name"
                        className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-white/60 shrink-0" />
                      <input
                        type="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)}
                        placeholder="024 000 0000"
                        className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowGuestForm(false)}
                        className="flex-1 py-3 rounded-xl border border-border text-white/60 text-sm font-medium hover:bg-secondary transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => joinQueue(false)}
                        disabled={joining || !guestFormValid}
                        className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-all disabled:opacity-50"
                      >
                        {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : "Join Queue"}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </>
      )}

      {/* Prompt to pick a barber if none are available yet */}
      {!myEntry && !selectedBarberId && status.barbers.length === 0 && (
        <div className="text-center py-8 text-white/60 text-sm">
          No barbers available right now. Please check back soon.
        </div>
      )}
    </div>
  );
}

export default function QueuePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <QueueBoard />
    </Suspense>
  );
}
