"use client";

/**
 * WebPushToggle — the only UI surface that requests browser push permission.
 *
 * Rules (from the brief):
 *   - NEVER auto-prompt on first paint. The prompt fires only when the user
 *     flips the switch to ON.
 *   - Handles the three permission states: default / granted / denied.
 *   - Reports "no soportado" gracefully on Safari iOS, insecure contexts, etc.
 *   - On enable: calls `requestPushSubscription()` which (a) prompts, (b)
 *     registers the SW, (c) POSTs to /api/web-push/subscribe.
 *   - On disable: POSTs to /api/web-push/unsubscribe and unsubscribes locally.
 *
 * This widget is shape-agnostic — drop it inside the NotifyPrefs popover,
 * inside a profile page, etc.
 */

import * as React from "react";
import { AlertCircle, BellOff, BellRing, Loader2, ShieldAlert } from "lucide-react";
import {
  getPermission,
  getPushSupport,
  hasActiveSubscription,
  requestPushSubscription,
  unsubscribePush,
} from "@/lib/web-push-client";

type State = "loading" | "idle" | "working" | "error";

export type WebPushToggleProps = {
  /** Called whenever the active subscription state changes (after server round-trip). */
  onChange?: (subscribed: boolean) => void;
  /** Compact "switch only" variant for use inside the prefs panel. */
  compact?: boolean;
};

export function WebPushToggle({ onChange, compact = false }: WebPushToggleProps) {
  const support = React.useMemo(() => getPushSupport(), []);
  const [state, setState] = React.useState<State>("loading");
  const [subscribed, setSubscribed] = React.useState(false);
  const [permission, setPermission] = React.useState<NotificationPermission | "unsupported">(getPermission());
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!support.supported) {
      setState("idle");
      return;
    }
    let cancelled = false;
    hasActiveSubscription().then((active) => {
      if (cancelled) return;
      setSubscribed(active);
      setPermission(getPermission());
      setState("idle");
    });
    return () => {
      cancelled = true;
    };
  }, [support.supported]);

  const toggle = React.useCallback(async () => {
    if (!support.supported || state === "working" || state === "loading") return;
    setErrorMessage(null);
    setState("working");

    if (subscribed) {
      const r = await unsubscribePush();
      setSubscribed(false);
      setPermission(getPermission());
      setState("idle");
      if (r.ok) onChange?.(false);
      else {
        setErrorMessage("No se pudo desactivar. Inténtalo de nuevo.");
        setState("error");
      }
      return;
    }

    const r = await requestPushSubscription();
    if (r.ok) {
      setSubscribed(true);
      setPermission(getPermission());
      setState("idle");
      onChange?.(true);
      return;
    }
    if (r.reason === "permission_denied") {
      setErrorMessage(
        "Has bloqueado las notificaciones en este navegador. Cámbialo en los ajustes del sitio para volver a activarlas.",
      );
    } else if (r.reason === "permission_dismissed") {
      setErrorMessage("Permiso no concedido. Vuelve a intentarlo cuando quieras.");
    } else if (r.reason === "unsupported") {
      setErrorMessage("Tu navegador no admite notificaciones push.");
    } else {
      setErrorMessage("No se pudo activar. Comprueba la conexión y reinténtalo.");
    }
    setSubscribed(false);
    setPermission(getPermission());
    setState("error");
  }, [onChange, state, subscribed, support.supported]);

  if (!support.supported) {
    return (
      <div className="rounded-md border border-[#1F3A5F]/15 bg-[#FBF8F3] p-3 text-sm text-[#1F3A5F]/80 flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-[#B08A3E]" aria-hidden="true" />
        <div>
          <div className="font-medium text-[#1F3A5F]">Notificaciones del navegador no disponibles</div>
          <div className="text-xs mt-0.5">
            {support.reason === "insecure_context"
              ? "Necesitamos una conexión segura (HTTPS) para activarlas."
              : support.reason === "no_vapid_key"
                ? "La configuración del servicio aún no está completa."
                : "Tu navegador o dispositivo no admite esta función."}
          </div>
        </div>
      </div>
    );
  }

  const busy = state === "loading" || state === "working";

  const switchEl = (
    <button
      type="button"
      role="switch"
      aria-checked={subscribed}
      aria-busy={busy}
      onClick={toggle}
      disabled={busy}
      className={[
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1F3A5F]",
        subscribed ? "bg-[#1F3A5F]" : "bg-[#1F3A5F]/20",
        busy && "opacity-70 cursor-progress",
      ].join(" ")}
    >
      <span className="sr-only">{subscribed ? "Desactivar push" : "Activar push"}</span>
      <span
        aria-hidden="true"
        className={[
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
          subscribed ? "translate-x-5" : "translate-x-0.5",
        ].join(" ")}
      />
      {busy && (
        <Loader2 className="absolute inset-0 m-auto h-3.5 w-3.5 animate-spin text-[var(--color-ink-primary)]" aria-hidden="true" />
      )}
    </button>
  );

  if (compact) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-[#1F3A5F]">
          {subscribed ? (
            <BellRing className="h-4 w-4 text-[#B08A3E]" aria-hidden="true" />
          ) : (
            <BellOff className="h-4 w-4 text-[#1F3A5F]/60" aria-hidden="true" />
          )}
          <span>Notificación del navegador</span>
        </div>
        {switchEl}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-[#1F3A5F]/15 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-[#1F3A5F] flex items-center gap-2">
            {subscribed ? (
              <BellRing className="h-4 w-4 text-[#B08A3E]" aria-hidden="true" />
            ) : (
              <BellOff className="h-4 w-4 text-[#1F3A5F]/60" aria-hidden="true" />
            )}
            Notificaciones del navegador
          </div>
          <p className="text-xs text-[#1F3A5F]/70 mt-1 max-w-[40ch]">
            Recibe avisos inmediatos en este dispositivo, incluso con la pestaña cerrada.
          </p>
        </div>
        {switchEl}
      </div>
      {permission === "denied" && (
        <p className="mt-2 text-xs text-[#B08A3E] flex items-start gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          <span>Permiso bloqueado en este navegador. Cámbialo en los ajustes del sitio para reactivar.</span>
        </p>
      )}
      {errorMessage && permission !== "denied" && (
        <p className="mt-2 text-xs text-[#B08A3E] flex items-start gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{errorMessage}</span>
        </p>
      )}
    </div>
  );
}
