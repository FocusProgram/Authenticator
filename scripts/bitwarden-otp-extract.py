#!/usr/bin/env python3
"""Extract OTP entries from Bitwarden export JSON and convert to Authenticator import format."""

import argparse
import json
import uuid
import re
from pathlib import Path


def clean_base32(secret: str) -> str:
    """Normalize base32 secret: remove spaces, uppercase."""
    return secret.replace(" ", "").upper()


def is_base32(s: str) -> bool:
    """Check if string is valid base32."""
    return bool(re.match(r'^[A-Z2-7]+=*$', s))


def parse_otpauth_uri(uri: str) -> dict | None:
    """Parse an otpauth:// URI into components."""
    if not uri.startswith("otpauth://"):
        return None
    rest = uri[len("otpauth://"):]
    otp_type = rest[:4].lower()  # totp or hotp
    rest = rest[5:]  # skip type and /
    parts = rest.split("?", 1)
    label = parts[0]
    params = {}
    if len(parts) > 1:
        for p in parts[1].split("&"):
            k, _, v = p.partition("=")
            params[k.lower()] = v

    issuer = params.get("issuer", "")
    account = label
    if ":" in label:
        issuer = label.split(":")[0] or issuer
        account = label.split(":", 1)[1]

    return {
        "type": otp_type,
        "account": account,
        "issuer": issuer,
        "secret": params.get("secret", ""),
        "period": params.get("period"),
        "digits": params.get("digits"),
        "algorithm": params.get("algorithm"),
    }


def convert_bitwarden_to_authenticator(input_path: str, output_path: str | None = None):
    """Read Bitwarden JSON export, extract OTP entries, write Authenticator-format JSON."""
    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    items = data.get("items", [])
    folders = {f["id"]: f["name"] for f in data.get("folders", [])}

    export_data = {}
    skipped = 0

    for item in items:
        login = item.get("login", {})
        totp = login.get("totp")
        if not totp:
            continue

        name = item.get("name", "").strip()
        username = login.get("username", "").strip()
        folder_id = item.get("folderId", "")
        folder_name = folders.get(folder_id, "")

        # Determine OTP type and secret
        if totp.startswith("otpauth://"):
            parsed = parse_otpauth_uri(totp)
            if not parsed or not parsed["secret"]:
                skipped += 1
                continue
            otp_type = parsed["type"]
            secret = parsed["secret"]
            issuer = parsed["issuer"] or name
            account = parsed["account"] or username
            period = parsed.get("period")
            digits = parsed.get("digits")
            algorithm = parsed.get("algorithm")
        else:
            # Plain base32 secret (may be lowercase or have spaces)
            secret = clean_base32(totp)
            if not is_base32(secret):
                skipped += 1
                continue
            otp_type = "totp"
            issuer = name
            account = username
            period = None
            digits = None
            algorithm = None

        entry_hash = str(uuid.uuid4())
        entry = {
            "account": account,
            "encrypted": False,
            "hash": entry_hash,
            "index": 0,
            "issuer": issuer,
            "secret": secret,
            "type": otp_type,
            "pinned": False,
        }

        # Add optional fields only if present
        if period:
            try:
                p = int(period)
                if p > 0:
                    entry["period"] = p
            except (ValueError, TypeError):
                pass
        if digits:
            try:
                d = int(digits)
                if d > 0:
                    entry["digits"] = d
            except (ValueError, TypeError):
                pass
        if algorithm:
            entry["algorithm"] = algorithm.upper()

        export_data[entry_hash] = entry

    if not output_path:
        stem = Path(input_path).stem
        output_path = str(Path(input_path).parent / f"{stem}_authenticator.json")

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(export_data, f, indent=2, ensure_ascii=False)

    print(f"Extracted {len(export_data)} OTP entries, skipped {skipped}")
    print(f"Output: {output_path}")
    return output_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Extract OTP entries from a Bitwarden JSON export and convert to Authenticator import format.",
        epilog="Examples:\n"
            "  %(prog)s bitwarden_export.json\n"
            "  %(prog)s bitwarden_export.json -o otp.json\n"
            "  %(prog)s bitwarden_export.json --output ~/Downloads/otp.json",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "input",
        help="Path to Bitwarden JSON export file",
    )
    parser.add_argument(
        "-o", "--output",
        default=None,
        help="Output file path (default: <input>_authenticator.json)",
    )
    args = parser.parse_args()
    convert_bitwarden_to_authenticator(args.input, args.output)
