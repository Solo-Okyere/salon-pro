import { moolre } from "./moolre";

export const sms = {
  bookingConfirmation: (phone: string, customerName: string, shopName: string, date: string, time: string, barberName: string, ref: string, pendingDeposit = false) =>
    moolre.sendSms(
      phone,
      `Hi ${customerName}, your appointment at ${shopName} is ${pendingDeposit ? "reserved and awaiting your deposit" : "confirmed"} for ${date} at ${time} with ${barberName}. - SalonPro`,
      ref
    ),

  depositConfirmation: (phone: string, customerName: string, amount: string, ref: string) =>
    moolre.sendSms(
      phone,
      `Hi ${customerName}, we've received your deposit of GHS ${amount} (ref: ${ref}). Your booking is confirmed. - SalonPro`,
      ref
    ),

  otpCode: (phone: string, code: string) =>
    moolre.sendSms(phone, `Your SalonPro verification code is ${code}. It expires in 10 minutes.`),
};
