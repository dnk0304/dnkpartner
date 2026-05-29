#!/usr/bin/env python3
"""
Notification health-check utility.

What it does:
1) Verifies required env vars for email alerts.
2) Calls /api/alerts/test to send a test email.
3) Calls /api/alerts/check to trigger matching alerts against recent auctions.
"""

import argparse
import json
import os
import sys
from pathlib import Path
import urllib.request

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def load_local_env() -> None:
    """Load .env into process env for local script execution."""
    env_path = PROJECT_ROOT / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def post_json(url: str, payload: dict) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        body = response.read().decode("utf-8", errors="replace")
        return {
            "status": response.status,
            "body": body,
        }


def check_env() -> dict:
    return {
        "RESEND_API_KEY": bool(os.getenv("RESEND_API_KEY")),
        "RESEND_FROM_EMAIL": bool(os.getenv("RESEND_FROM_EMAIL")),
        "NEXT_PUBLIC_APP_URL": bool(os.getenv("NEXT_PUBLIC_APP_URL") or os.getenv("NEXT_PUBLIC_URL")),
    }


def main() -> None:
    load_local_env()

    parser = argparse.ArgumentParser(description="Test alert notifications end-to-end")
    parser.add_argument("--base-url", default=os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3005"))
    parser.add_argument("--email", default="dennis.kotlenko@gmail.com")
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    env_status = check_env()
    missing = [key for key, ok in env_status.items() if not ok]

    print("=" * 72)
    print("NOTIFICATION HEALTH CHECK")
    print("=" * 72)
    print(f"Base URL: {base_url}")
    print(f"Test email: {args.email}")
    print("")
    print("Environment check:")
    for key, ok in env_status.items():
        print(f"  - {key}: {'OK' if ok else 'MISSING'}")
    print("")

    if missing:
        print("Missing required environment variables for email delivery.")
        print("Please configure:")
        for key in missing:
            print(f"  - {key}")
        sys.exit(1)

    try:
        print("1) Sending test email via /api/alerts/test ...")
        test_result = post_json(f"{base_url}/api/alerts/test", {"email": args.email})
        print(f"   HTTP {test_result['status']}")
        print(f"   Response: {test_result['body'][:500]}")
    except Exception as exc:
        print(f"   FAILED: {exc}")
        sys.exit(1)

    try:
        print("")
        print("2) Triggering alert matcher via /api/alerts/check ...")
        check_result = post_json(f"{base_url}/api/alerts/check", {})
        print(f"   HTTP {check_result['status']}")
        print(f"   Response: {check_result['body'][:500]}")
    except Exception as exc:
        print(f"   FAILED: {exc}")
        sys.exit(1)

    print("")
    print("Notification checks completed.")
    print("=" * 72)


if __name__ == "__main__":
    main()
