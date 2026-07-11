export interface OtpAuthSource {
  type: string | number;
  issuer?: string;
  account?: string;
  secret: string | null;
  counter?: number;
  period?: number;
  digits?: number;
  algorithm?: string | number;
}

export interface ParsedOtpAuthUri {
  type: "totp" | "hotp" | "hex" | "hhex";
  issuer: string;
  account: string;
  secret: string;
  counter?: number;
  period?: number;
  digits?: number;
  algorithm?: string;
}

const NUMERIC_ALGORITHMS: Record<number, string> = {
  1: "SHA1",
  2: "SHA256",
  3: "SHA512",
  4: "GOST3411_2012_256",
  5: "GOST3411_2012_512",
};

export function buildOtpAuthUri(source: OtpAuthSource): string | null {
  const type = getStandardOtpType(source.type);
  const secret = normalizeSecret(source.secret || "");
  if (!type || !secret) {
    return null;
  }

  const issuer = getDisplayIssuer(source.issuer || "");
  const account = (source.account || "").trim();
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(account);
  const label = issuer
    ? `${encodedIssuer}:${encodedAccount}`
    : encodedAccount || "Authenticator";
  const parameters = [`secret=${encodeURIComponent(secret)}`];

  if (issuer) {
    parameters.push(`issuer=${encodedIssuer}`);
  }
  if (type === "hotp") {
    parameters.push(`counter=${normalizeCounter(source.counter)}`);
  } else {
    const period = normalizePeriod(source.period);
    if (period && period !== 30) {
      parameters.push(`period=${period}`);
    }
  }

  const digits = normalizeDigits(source.digits);
  if (digits && digits !== 6) {
    parameters.push(`digits=${digits}`);
  }

  const algorithm = normalizeAlgorithm(source.algorithm);
  if (algorithm && algorithm !== "SHA1") {
    parameters.push(`algorithm=${encodeURIComponent(algorithm)}`);
  }

  return `otpauth://${type}/${label}?${parameters.join("&")}`;
}

export function parseOtpAuthUri(uri: string): ParsedOtpAuthUri | null {
  const match = /^otpauth:\/\/(totp|hotp)\/([^?]*)(?:\?(.*))?$/i.exec(
    uri.trim()
  );
  if (!match) {
    return null;
  }

  const standardType = match[1].toLowerCase() as "totp" | "hotp";
  const searchParams = new URLSearchParams(match[3] || "");

  const secret = normalizeSecret(searchParams.get("secret") || "");
  if (!isSupportedSecret(secret)) {
    return null;
  }

  const rawLabel = match[2].replace(/^\/+/, "");
  const labelParts = splitOtpLabel(rawLabel);
  const queryIssuer = (searchParams.get("issuer") || "").trim();
  const issuer = queryIssuer || labelParts.issuer;
  const account = labelParts.account;
  const isHexSecret =
    /^[0-9a-f]+$/i.test(secret) && !/^[a-z2-7]+=*$/i.test(secret);
  const type = isHexSecret
    ? standardType === "hotp"
      ? "hhex"
      : "hex"
    : standardType;
  const result: ParsedOtpAuthUri = {
    type,
    issuer,
    account,
    secret,
  };

  if (standardType === "hotp") {
    result.counter = normalizeCounter(Number(searchParams.get("counter")));
  } else {
    const period = normalizePeriod(Number(searchParams.get("period")));
    if (period) {
      result.period = period;
    }
  }

  const digits = normalizeDigits(Number(searchParams.get("digits")));
  if (digits) {
    result.digits = digits;
  }

  const algorithm = normalizeAlgorithm(
    searchParams.get("algorithm") || undefined
  );
  if (algorithm) {
    result.algorithm = algorithm;
  }

  return result;
}

export function getDisplayIssuer(issuer: string) {
  return issuer.split("::")[0].trim();
}

function getStandardOtpType(type: string | number) {
  if (type === 1 || type === 5 || type === "totp" || type === "hex") {
    return "totp";
  }
  if (type === 2 || type === 6 || type === "hotp" || type === "hhex") {
    return "hotp";
  }
  return null;
}

function splitOtpLabel(rawLabel: string) {
  const literalSeparator = rawLabel.indexOf(":");
  if (literalSeparator >= 0) {
    return {
      issuer: safeDecode(rawLabel.slice(0, literalSeparator)).trim(),
      account: safeDecode(rawLabel.slice(literalSeparator + 1)).trim(),
    };
  }

  const decodedLabel = safeDecode(rawLabel).trim();
  const decodedSeparator = decodedLabel.indexOf(":");
  if (decodedSeparator >= 0) {
    return {
      issuer: decodedLabel.slice(0, decodedSeparator).trim(),
      account: decodedLabel.slice(decodedSeparator + 1).trim(),
    };
  }

  return { issuer: "", account: decodedLabel };
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeSecret(secret: string) {
  return secret.replace(/\s+/g, "");
}

function isSupportedSecret(secret: string) {
  return Boolean(
    secret && (/^[a-z2-7]+=*$/i.test(secret) || /^[0-9a-f]+$/i.test(secret))
  );
}

function normalizeCounter(counter?: number) {
  return Number.isFinite(counter) && Number(counter) >= 0
    ? Math.floor(Number(counter))
    : 0;
}

function normalizePeriod(period?: number) {
  return Number.isInteger(period) &&
    Number(period) > 0 &&
    Number(period) <= 86400
    ? Number(period)
    : undefined;
}

function normalizeDigits(digits?: number) {
  return Number.isInteger(digits) && Number(digits) >= 1 && Number(digits) <= 10
    ? Number(digits)
    : undefined;
}

function normalizeAlgorithm(algorithm?: string | number) {
  if (typeof algorithm === "number") {
    return NUMERIC_ALGORITHMS[algorithm];
  }
  return algorithm?.trim().toUpperCase();
}
