"use client";

import { Suspense, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Scissors, User, Calendar, Clock, CreditCard, CheckCircle,
  ChevronLeft, ChevronRight, AlertCircle, Phone, Users,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/slices/authSlice";

const STEPS = ["Shop", "Service", "Barber", "Date & Time", "Payment", "Confirm"];

interface Shop { id: string; name: string; address: string; city: string; slug: string }
interface Service { id: string; name: string; price: number; durationMinutes: number; depositAmount: number }
interface Barber { id: string; user: { name: string }; rating: number; specialties: string[] }
interface Slot { time: string; available: boolean }

const fade = { hidden: { opacity: 0, x: 20 }, show: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -20 } };

function slotToIso(date: string, time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})\s(AM|PM)$/i);
  if (!match) throw new Error("Select a valid appointment time");

  const [, hourValue, minuteValue, meridiem] = match;
  let hours = Number(hourValue) % 12;
  if (meridiem.toUpperCase() === "PM") hours += 12;

  const scheduledAt = new Date(`${date}T00:00:00`);
  scheduledAt.setHours(hours, Number(minuteValue), 0, 0);
  return scheduledAt.toISOString();
}

function normalizeBookingPhone(phone: string) {
  return phone.replace(/[\s-]+/g, "");
}

function BookingFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const requestedShopId = searchParams.get("shop");

  const [step, setStep] = useState(() => requestedShopId ? 1 : 0);
  const [selected, setSelected] = useState<{
    shop?: Shop; service?: Service; barber?: Barber;
    date?: string; time?: string; provider?: string; phone?: string;
  }>({});

  // Guest contact details — only used when not logged in
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

  // Success state — shown instead of redirect (guests have no dashboard)
  const [confirmedBooking, setConfirmedBooking] = useState<{
    id: string; shopName: string; serviceName: string;
    barberName: string; scheduledAt: string;
  } | null>(null);

  const { data: shops } = useQuery<Shop[]>({
    queryKey: ["shops"],
    queryFn: () => api.get("/api/shops").then((r) => r.data.data),
  });

  const requestedShop = shops?.find((shop) => shop.id === requestedShopId);
  const activeShop = selected.shop ?? requestedShop;

  const { data: shopData, isLoading: isShopLoading, isError: isShopError } = useQuery({
    queryKey: ["shop", activeShop?.slug],
    queryFn: () => api.get(`/api/shops/${activeShop!.slug}`).then((r) => r.data.data),
    enabled: !!activeShop?.slug,
  });

  const { data: slots } = useQuery<Slot[]>({
    queryKey: ["slots", activeShop?.id, selected.barber?.id, selected.date],
    queryFn: () => api.get("/api/bookings/available-slots", {
      params: { shopId: activeShop?.id, barberId: selected.barber?.id, date: selected.date }
    }).then((r) => r.data.data),
    enabled: !!(activeShop?.id && selected.barber?.id && selected.date),
  });

  const bookMutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        shopId: activeShop?.id,
        serviceId: selected.service?.id,
        barberId: selected.barber?.id,
        scheduledAt: slotToIso(selected.date ?? "", selected.time ?? ""),
      };
      // The server treats an expired token as a guest. Always include the best
      // available contact details so a persisted but expired session can still
      // create a guest booking instead of failing validation.
      payload.customerName = guestName.trim() || user?.name?.trim();
      payload.customerPhone = normalizeBookingPhone(guestPhone || user?.phone || "");
      return api.post("/api/bookings", payload);
    },
    onSuccess: async (res) => {
      const booking = res.data.data;
      const bookingId = booking.id;

      // Initiate deposit payment if required
      if (selected.service?.depositAmount && selected.provider && selected.phone) {
        try {
          await api.post("/api/payments/initiate", {
            bookingId,
            amount: selected.service.depositAmount,
            provider: selected.provider,
            phoneNumber: selected.phone,
          });
        } catch {
          toast.error("Booking saved but payment initiation failed.");
        }
      }

      setConfirmedBooking({
        id: bookingId,
        shopName: activeShop?.name ?? "",
        serviceName: selected.service?.name ?? "",
        barberName: selected.barber?.user.name ?? "",
        scheduledAt: `${selected.date}T${selected.time}`,
      });
    },
    onError: (err: unknown) => {
      const response = (err as { response?: { data?: { message?: string; errors?: Record<string, string[] | undefined> } } })?.response?.data;
      const validationError = response?.errors ? Object.values(response.errors).flat().find(Boolean) : undefined;
      const msg = validationError ?? response?.message
        ?? "Booking failed. Please try again.";
      toast.error(msg);
    },
  });

  const isGuest = !(isAuthenticated && accessToken);

  const canProceed = () => {
    if (step === 0) return !!activeShop;
    if (step === 1) return !!selected.service;
    if (step === 2) return !!selected.barber;
    if (step === 3) return !!(selected.date && selected.time);
    if (step === 4) return true;
    // Confirm step: guests must provide name + phone
    if (step === 5 && isGuest) return guestName.trim().length >= 2 && guestPhone.trim().length >= 9;
    return true;
  };

  const next7Days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });

  // ── In-page success screen ─────────────────────────────────────────────────
  if (confirmedBooking) {
    const dt = new Date(confirmedBooking.scheduledAt);
    return (
      <div className="min-h-screen bg-[#080808] text-white flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-[#111] border border-white/10 rounded-2xl p-8 text-center"
        >
          <div className="w-16 h-16 bg-green-500/10 border border-green-500/20 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Booking Confirmed!</h2>
          <p className="text-white/50 text-sm mb-6">We&apos;ll see you at {confirmedBooking.shopName}.</p>

          <div className="text-left space-y-3 mb-8">
            {[
              { label: "Service", value: confirmedBooking.serviceName },
              { label: "Barber", value: confirmedBooking.barberName },
              { label: "Date", value: dt.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" }) },
              { label: "Time", value: dt.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" }) },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-white/60 text-sm">{label}</span>
                <span className="font-medium text-sm">{value}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => router.push(`/queue?shopId=${activeShop?.id}`)}
              className="w-full py-3 bg-[#d4a017] hover:bg-[#b8860b] text-black font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <Users className="w-4 h-4" /> View Live Queue
            </button>
            <button
              onClick={() => {
                setConfirmedBooking(null);
                setStep(0);
                setSelected({});
                setGuestName("");
                setGuestPhone("");
              }}
              className="w-full py-3 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-xl transition-colors"
            >
              Book Another
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => step > 0 ? setStep(s => s - 1) : router.back()} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">Book Appointment</h1>
            <p className="text-sm text-white/60">{STEPS[step]}</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="flex gap-1 mb-8">
          {STEPS.map((_, i) => (
            <div key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i <= step ? "bg-[#d4a017]" : "bg-white/10")} />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* Step 0: Choose Shop */}
          {step === 0 && (
            <motion.div key="shop" variants={fade} initial="hidden" animate="show" exit="exit">
              <h2 className="text-lg font-semibold mb-4">Choose a Shop</h2>
              <div className="space-y-3">
                {shops?.map((shop) => (
                  <button key={shop.id} onClick={() => setSelected({ shop })}
                    className={cn("w-full text-left bg-[#111] border rounded-xl p-4 transition-all",
                      activeShop?.id === shop.id ? "border-[#d4a017] bg-[#d4a017]/5" : "border-white/10 hover:border-white/30")}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#d4a017]/10 rounded-xl flex items-center justify-center">
                        <Scissors className="w-5 h-5 text-[#d4a017]" />
                      </div>
                      <div>
                        <p className="font-semibold">{shop.name}</p>
                        <p className="text-sm text-white/60">{shop.address}, {shop.city}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 1: Choose Service */}
          {step === 1 && (
            <motion.div key="service" variants={fade} initial="hidden" animate="show" exit="exit">
              <h2 className="text-lg font-semibold mb-4">Choose a Service</h2>
              <div className="space-y-3">
                {isShopLoading ? (
                  <div className="space-y-3" aria-label="Loading services">
                    {[0, 1, 2].map((index) => <div key={index} className="h-20 rounded-xl bg-white/5 animate-pulse" />)}
                  </div>
                ) : isShopError || !activeShop ? (
                  <div className="rounded-2xl border border-red-400/20 bg-red-400/5 px-5 py-8 text-center">
                    <p className="font-medium text-red-200">We couldn&apos;t load this shop&apos;s services.</p>
                    <button type="button" onClick={() => setStep(0)} className="mt-3 text-sm text-primary hover:underline">Choose another shop</button>
                  </div>
                ) : !(shopData?.services?.length) ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-10 text-center">
                    <Scissors className="mx-auto mb-3 size-7 text-white/30" />
                    <p className="font-medium">No services available yet</p>
                    <p className="mt-1 text-sm text-white/60">This shop has not added bookable services yet.</p>
                    <button type="button" onClick={() => setStep(0)} className="mt-4 text-sm text-primary hover:underline">Choose another shop</button>
                  </div>
                ) : shopData.services.map((s: Service) => (
                  <button key={s.id} onClick={() => setSelected(prev => ({ ...prev, service: s }))}
                    className={cn("w-full text-left bg-[#111] border rounded-xl p-4 transition-all",
                      selected.service?.id === s.id ? "border-[#d4a017] bg-[#d4a017]/5" : "border-white/10 hover:border-white/30")}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{s.name}</p>
                        <p className="text-sm text-white/60">{s.durationMinutes} min</p>
                        {s.depositAmount > 0 && (
                          <p className="text-xs text-[#d4a017] mt-1">Deposit: {formatCurrency(s.depositAmount)}</p>
                        )}
                      </div>
                      <p className="text-lg font-bold text-[#d4a017]">{formatCurrency(s.price)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 2: Choose Barber */}
          {step === 2 && (
            <motion.div key="barber" variants={fade} initial="hidden" animate="show" exit="exit">
              <h2 className="text-lg font-semibold mb-4">Choose a Barber</h2>
              <div className="space-y-3">
                {(shopData?.barbers ?? []).filter((b: Barber & { isAvailable: boolean }) => b.isAvailable).map((b: Barber) => (
                  <button key={b.id} onClick={() => setSelected(prev => ({ ...prev, barber: b }))}
                    className={cn("w-full text-left bg-[#111] border rounded-xl p-4 transition-all",
                      selected.barber?.id === b.id ? "border-[#d4a017] bg-[#d4a017]/5" : "border-white/10 hover:border-white/30")}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#d4a017]/10 rounded-xl flex items-center justify-center">
                        <User className="w-5 h-5 text-[#d4a017]" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold">{b.user.name}</p>
                          <p className="text-sm text-white/60">★ {b.rating.toFixed(1)}</p>
                        {b.specialties.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {b.specialties.slice(0, 3).map((sp) => (
                              <span key={sp} className="text-xs bg-white/5 px-2 py-0.5 rounded-full">{sp}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 3: Date & Time */}
          {step === 3 && (
            <motion.div key="datetime" variants={fade} initial="hidden" animate="show" exit="exit">
              <h2 className="text-lg font-semibold mb-4">Pick a Date & Time</h2>

              {/* Date Picker */}
              <div className="mb-6">
                <p className="text-sm text-white/50 mb-2">Select Date</p>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {next7Days.map((date) => {
                    const d = new Date(date);
                    return (
                      <button key={date} onClick={() => setSelected(prev => ({ ...prev, date, time: undefined }))}
                        className={cn("flex-shrink-0 flex flex-col items-center p-3 rounded-xl border w-16 transition-all",
                          selected.date === date ? "border-[#d4a017] bg-[#d4a017]/10" : "border-white/10 hover:border-white/30")}>
                        <span className="text-xs text-white/50">{d.toLocaleDateString("en", { weekday: "short" })}</span>
                        <span className="text-xl font-bold">{d.getDate()}</span>
                        <span className="text-xs text-white/50">{d.toLocaleDateString("en", { month: "short" })}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time Slots */}
              {selected.date && (
                <div>
                  <p className="text-sm text-white/50 mb-2">Available Times</p>
                  {!slots ? (
                    <div className="grid grid-cols-4 gap-2">
                      {[...Array(8)].map((_, i) => <div key={i} className="h-10 bg-white/5 rounded-lg animate-pulse" />)}
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {slots.map((slot) => (
                        <button key={slot.time} disabled={!slot.available}
                          onClick={() => setSelected(prev => ({ ...prev, time: slot.time }))}
                          className={cn("py-2 px-3 rounded-lg text-sm font-medium transition-all",
                            !slot.available && "opacity-30 cursor-not-allowed bg-white/5",
                            slot.available && selected.time === slot.time && "bg-[#d4a017] text-black",
                            slot.available && selected.time !== slot.time && "bg-white/5 hover:bg-white/10 border border-white/10")}>
                          {slot.time}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* Step 4: Payment */}
          {step === 4 && (
            <motion.div key="payment" variants={fade} initial="hidden" animate="show" exit="exit">
              <h2 className="text-lg font-semibold mb-4">Payment</h2>

              {selected.service?.depositAmount ? (
                <>
                  <div className="bg-[#111] border border-white/10 rounded-xl p-4 mb-6">
                    <div className="flex items-center gap-2 text-[#d4a017] mb-2">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-sm font-semibold">Deposit Required</span>
                    </div>
                    <p className="text-white/60 text-sm">A deposit of <strong className="text-white">{formatCurrency(selected.service.depositAmount)}</strong> is required to confirm this booking. Pay the remaining {formatCurrency(selected.service.price - selected.service.depositAmount)} at the shop.</p>
                  </div>

                  <div className="space-y-3 mb-4">
                    <p className="text-sm text-white/50">Choose Payment Method</p>
                    {["MTN_MOMO", "TELECEL_CASH", "AT_MONEY"].map((p) => (
                      <button key={p} onClick={() => setSelected(prev => ({ ...prev, provider: p }))}
                        className={cn("w-full text-left bg-[#111] border rounded-xl p-4 transition-all",
                          selected.provider === p ? "border-[#d4a017] bg-[#d4a017]/5" : "border-white/10 hover:border-white/30")}>
                        <p className="font-semibold">{p.replace("_", " ")}</p>
                      </button>
                    ))}
                  </div>

                  {selected.provider && (
                    <div>
                      <p className="text-sm text-white/50 mb-2">MoMo Phone Number</p>
                      <input type="tel" placeholder="0XX XXX XXXX"
                        value={selected.phone ?? ""}
                        onChange={(e) => setSelected(prev => ({ ...prev, phone: e.target.value }))}
                        className="w-full bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#d4a017] transition-colors" />
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  <div>
                    <p className="font-semibold text-green-400">Pay at Shop</p>
                    <p className="text-sm text-white/50">No deposit required — just show up!</p>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Step 5: Confirmation */}
          {step === 5 && (
            <motion.div key="confirm" variants={fade} initial="hidden" animate="show" exit="exit">
              <h2 className="text-lg font-semibold mb-6">Review & Confirm</h2>
              <div className="bg-[#111] border border-white/10 rounded-2xl overflow-hidden mb-6">
                {[
                  { icon: Scissors, label: "Service", value: selected.service?.name },
                  { icon: User, label: "Barber", value: selected.barber?.user.name },
                  { icon: Calendar, label: "Date", value: selected.date ? new Date(selected.date).toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" }) : "" },
                  { icon: Clock, label: "Time", value: selected.time },
                  { icon: CreditCard, label: "Total", value: selected.service ? formatCurrency(selected.service.price) : "" },
                ].map(({ icon: Icon, label, value }, i) => (
                  <div key={label} className={cn("flex items-center gap-4 p-4", i > 0 && "border-t border-white/5")}>
                    <Icon className="w-5 h-5 text-[#d4a017]" />
                    <div>
                      <p className="text-xs text-white/60">{label}</p>
                      <p className="font-medium">{value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Guest contact details — only shown when not logged in */}
              {isGuest && (
                <div className="bg-[#111] border border-white/10 rounded-2xl p-5 mb-6 space-y-4">
                  <p className="text-sm font-semibold text-white/70">Your contact details</p>
                  <p className="text-xs text-white/60">We&apos;ll use this to track your booking. No account needed.</p>
                  <div>
                    <label className="text-xs text-white/60 block mb-1.5">Full name *</label>
                    <input
                      type="text"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Kofi Mensah"
                      className="w-full bg-[#080808] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-[#d4a017] transition-colors text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 block mb-1.5 flex items-center gap-1.5">
                      <Phone className="w-3 h-3" /> Phone number *
                    </label>
                    <input
                      type="tel"
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      placeholder="024 000 0000"
                      className="w-full bg-[#080808] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-[#d4a017] transition-colors text-sm"
                    />
                  </div>
                </div>
              )}

              {selected.service?.depositAmount && (
                <p className="text-sm text-[#d4a017] text-center mb-4">
                  Deposit: {formatCurrency(selected.service.depositAmount)} will be charged via {selected.provider?.replace("_", " ")}
                </p>
              )}

              <button onClick={() => bookMutation.mutate()} disabled={bookMutation.isPending || !canProceed()}
                className="w-full bg-[#d4a017] hover:bg-[#b8860b] disabled:opacity-50 text-black font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2">
                {bookMutation.isPending ? (
                  <span className="animate-spin rounded-full border-2 border-black border-t-transparent w-5 h-5" />
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Confirm Booking
                  </>
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Next Button */}
        {step < 5 && (
          <motion.div className="mt-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <button onClick={() => setStep(s => s + 1)} disabled={!canProceed()}
              className="w-full bg-[#d4a017] hover:bg-[#b8860b] disabled:opacity-30 disabled:cursor-not-allowed text-black font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2">
              Continue <ChevronRight className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}

export default function BookingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#080808]" />}>
      <BookingFlow />
    </Suspense>
  );
}

