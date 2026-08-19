// Moolre API client - payment collections, disbursements, and SMS. https://docs.moolre.com/
const BASE_URL = (process.env.MOOLRE_BASE_URL || "https://sandbox.moolre.com").replace(/\/$/, "");

type ApiCredentials = {
  apiUser: string;
  apiKey: string;
  accountNumber: string;
};

const collectionCredentials: ApiCredentials = {
  apiUser: process.env.MOOLRE_COLLECTION_API_USER || process.env.MOOLRE_API_USER || "",
  apiKey: process.env.MOOLRE_COLLECTION_API_KEY || process.env.MOOLRE_API_KEY || "",
  accountNumber: process.env.MOOLRE_COLLECTION_ACCOUNT_NUMBER || process.env.MOOLRE_ACCOUNT_NUMBER || "",
};

const disbursementCredentials: ApiCredentials = {
  apiUser: process.env.MOOLRE_DISBURSEMENT_API_USER || process.env.MOOLRE_API_USER || "",
  apiKey: process.env.MOOLRE_DISBURSEMENT_API_KEY || process.env.MOOLRE_API_KEY || "",
  accountNumber: process.env.MOOLRE_DISBURSEMENT_ACCOUNT_NUMBER || process.env.MOOLRE_ACCOUNT_NUMBER || "",
};

const smsCredentials = {
  vasKey: process.env.MOOLRE_SMS_VAS_KEY || process.env.MOOLRE_VAS_KEY || "",
  senderId: process.env.MOOLRE_SMS_SENDER_ID || process.env.MOOLRE_SENDER_ID || "",
};

const CHANNEL_CODES: Record<string, string> = {
  MTN_MOMO: "13",
  TELECEL_CASH: "6",
  AT_MONEY: "7",
};

const DISBURSEMENT_CHANNEL_CODES: Record<string, string> = {
  MTN: "1",
  TELECEL: "6",
  AT: "7",
};

type MoolreResponse<T> = {
  status: number | string;
  code: string;
  message: string | string[] | null;
  data: T;
};

type TransferStatusData = {
  txstatus: number;
  txtype: number;
  accountnumber: string;
  payee: string;
  amount: string;
  transactionid: string;
  externalref: string;
  ts: string;
};

type PaymentStatusData = TransferStatusData;

type AccountStatusData = {
  balance: number | string;
  accountname?: string;
  callback?: string;
};

type ValidationNameData = string | { name?: string; receiverName?: string; receiver?: string };

type TransferData = {
  txstatus?: number;
  txtype?: number;
  accountnumber?: string;
  payee?: string;
  amount?: string;
  transactionid?: string;
  externalref?: string;
  receivername?: string;
  receiver?: string;
};

function normalizePhone(phone: string) {
  return phone.replace(/^\+/, "").replace(/\s+/g, "");
}

function requireValue(value: string, envName: string, feature: string) {
  if (!value) {
    throw new Error(`Missing ${envName}. Add it to .env before using Moolre ${feature}.`);
  }
  return value;
}

function apiHeaders(credentials: ApiCredentials, feature: string) {
  return {
    "X-API-USER": requireValue(credentials.apiUser, "MOOLRE_API_USER", feature),
    "X-API-KEY": requireValue(credentials.apiKey, "MOOLRE_API_KEY", feature),
  };
}

function accountNumber(credentials: ApiCredentials, feature: string) {
  return requireValue(credentials.accountNumber, "MOOLRE_ACCOUNT_NUMBER", feature);
}

function smsHeaders() {
  return {
    "X-Api-VasKey": requireValue(smsCredentials.vasKey, "MOOLRE_VAS_KEY", "SMS"),
  };
}

function smsSenderId() {
  return requireValue(smsCredentials.senderId, "MOOLRE_SENDER_ID", "SMS");
}

function responseMessage(message: MoolreResponse<unknown>["message"]) {
  if (Array.isArray(message)) return message.join("; ");
  return message || "Unknown error";
}

async function moolreRequest<T>(path: string, headers: Record<string, string>, body: unknown): Promise<MoolreResponse<T>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }

  const parsed = json as Partial<MoolreResponse<T>>;
  const success = res.ok && (parsed.status === 1 || parsed.status === "1");
  if (!success) {
    throw new Error(`Moolre request failed [${parsed.code ?? res.status}]: ${responseMessage(parsed.message ?? null)}`);
  }

  return parsed as MoolreResponse<T>;
}

export async function initiatePayment(
  provider: "MTN_MOMO" | "TELECEL_CASH" | "AT_MONEY",
  amount: number,
  phone: string,
  reference: string
) {
  const channel = CHANNEL_CODES[provider];
  if (!channel) throw new Error(`Unsupported payment provider: ${provider}`);

  return moolreRequest<string>(
    "/open/transact/payment",
    apiHeaders(collectionCredentials, "payment collection"),
    {
      type: 1,
      channel,
      currency: "GHS",
      payer: normalizePhone(phone),
      amount: amount.toString(),
      externalref: reference,
      accountnumber: accountNumber(collectionCredentials, "payment collection"),
    }
  );
}

export async function checkAccountStatus() {
  return moolreRequest<AccountStatusData>(
    "/open/account/status",
    apiHeaders(disbursementCredentials, "disbursement"),
    {
      type: 1,
      accountnumber: accountNumber(disbursementCredentials, "disbursement"),
    }
  );
}

export async function validateRecipientName(receiver: string, channel: "MTN" | "TELECEL" | "AT", currency = "GHS") {
  const mappedChannel = DISBURSEMENT_CHANNEL_CODES[channel];
  if (!mappedChannel) throw new Error(`Unsupported disbursement channel: ${channel}`);

  return moolreRequest<ValidationNameData>(
    "/open/transact/validate",
    apiHeaders(disbursementCredentials, "disbursement"),
    {
      type: 1,
      receiver: normalizePhone(receiver),
      channel: mappedChannel,
      sublistid: "",
      currency,
      accountnumber: accountNumber(disbursementCredentials, "disbursement"),
    }
  );
}

export async function initiateTransfer(
  amount: number,
  phone: string,
  reference: string,
  channel: "MTN" | "TELECEL" | "AT",
  description = "SalonPro payout"
) {
  const mappedChannel = DISBURSEMENT_CHANNEL_CODES[channel];
  if (!mappedChannel) throw new Error(`Unsupported disbursement channel: ${channel}`);

  return moolreRequest<TransferData>(
    "/open/transact/transfer",
    apiHeaders(disbursementCredentials, "disbursement"),
    {
      type: 1,
      channel: mappedChannel,
      currency: "GHS",
      amount: amount.toString(),
      receiver: normalizePhone(phone),
      sublistid: "",
      externalref: reference,
      reference: description,
      accountnumber: accountNumber(disbursementCredentials, "disbursement"),
    }
  );
}

export async function checkPaymentStatus(reference: string) {
  return moolreRequest<PaymentStatusData>(
    "/open/transact/status",
    apiHeaders(collectionCredentials, "payment collection"),
    {
      type: 1,
      idtype: "externalref",
      id: reference,
      accountnumber: accountNumber(collectionCredentials, "payment collection"),
    }
  );
}

export async function checkTransferStatus(reference: string) {
  return moolreRequest<TransferStatusData>(
    "/open/transact/status",
    apiHeaders(disbursementCredentials, "disbursement"),
    {
      type: 1,
      idtype: "externalref",
      id: reference,
      accountnumber: accountNumber(disbursementCredentials, "disbursement"),
    }
  );
}

export async function sendSms(to: string, message: string, ref?: string) {
  const recipient = normalizePhone(to).replace(/^\+/, "").replace(/\s/g, "");
  return moolreRequest<null>(
    "/open/sms/send",
    smsHeaders(),
    {
      type: 1,
      senderid: smsSenderId(),
      messages: [{ recipient, message, ...(ref ? { ref } : {}) }],
    }
  );
}

export const moolre = {
  initiatePayment,
  checkAccountStatus,
  validateRecipientName,
  initiateTransfer,
  checkPaymentStatus,
  checkTransferStatus,
  sendSms,
};
