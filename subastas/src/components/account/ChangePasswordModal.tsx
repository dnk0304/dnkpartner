"use client";

/**
 * ChangePasswordModal — wraps the existing change-password flow on
 * PUT /api/user/profile ({ currentPassword, newPassword }). The server verifies
 * the current password (bcrypt) and returns a Spanish error we surface verbatim
 * (e.g. "Contraseña actual incorrecta"). Client-side we only guard the cheap
 * cases: empty fields, mismatch, and a minimum length.
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-path";

const MIN_LENGTH = 8;

export function ChangePasswordModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("account");
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setCurrent("");
      setNext("");
      setConfirm("");
      setError(null);
      setOk(false);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(false);
    if (next.length < MIN_LENGTH) {
      setError(t("passwordTooShort"));
      return;
    }
    if (next !== confirm) {
      setError(t("passwordMismatch"));
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? t("errorGeneric"));
        return;
      }
      setOk(true);
      // Brief success confirmation, then close.
      window.setTimeout(() => onOpenChange(false), 900);
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("passwordTitle")}</DialogTitle>
          <DialogDescription>{t("passwordDescription")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pw-current">{t("passwordCurrent")}</Label>
            <Input
              id="pw-current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw-new">{t("passwordNew")}</Label>
            <Input
              id="pw-new"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              minLength={MIN_LENGTH}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw-confirm">{t("passwordConfirm")}</Label>
            <Input
              id="pw-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={MIN_LENGTH}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-[var(--color-warn-critical)]">
              {error}
            </p>
          ) : null}
          {ok ? (
            <p role="status" className="text-sm text-[var(--color-status-live)]">
              {t("savedOk")}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={saving || !current || !next || !confirm}>
              {saving ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
