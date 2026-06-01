"use client";

/**
 * NotifyPrefsPopover — per-auction "Alertas" panel.
 *
 * Trigger button + Dialog content. Dialog (not a true popover) because:
 *   1) The project has @radix-ui/react-dialog already; no react-popover dep.
 *   2) On mobile, a centered dialog is a better target than a hovering popover.
 *
 * UX:
 *   - Only enabled when the user already follows the auction. If not following,
 *     the trigger is rendered as a disabled hint that says "Sigue esta subasta
 *     para configurar alertas." (Distinct verb pairing — see UX vision.)
 *   - Fetches current prefs on open (GET /api/follows/[auctionId]/prefs).
 *   - Single "Guardar" persists changes (PATCH /api/follows/[auctionId]/prefs).
 *   - WebPushToggle inline so the user can flip browser-push in the same flow.
 */

import * as React from "react";
import { Bell, BellRing, Loader2, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { apiFetch } from "@/lib/api-path";
import { cn } from "@/lib/utils";
import {
  CHANNEL_LABELS_ES,
  DEFAULT_PREFS,
  FollowPrefs,
  NotifyChannel,
  PREF_FIELD_LABELS_ES,
  parseChannels,
  PrefsResponse,
  serializeChannels,
} from "@/lib/notification-types";
import { WebPushToggle } from "./WebPushToggle";

export type NotifyPrefsPopoverProps = {
  auctionId: string;
  isFollowing: boolean;
  /** Optional trigger label override. */
  triggerLabel?: string;
  /** Variant of the trigger button. */
  triggerVariant?: "default" | "compact" | "icon";
  className?: string;
};

type LoadState = "idle" | "loading" | "saving" | "saved" | "error";

export function NotifyPrefsPopover({
  auctionId,
  isFollowing,
  triggerLabel = "Alertas",
  triggerVariant = "default",
  className,
}: NotifyPrefsPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const [prefs, setPrefs] = React.useState<FollowPrefs>(DEFAULT_PREFS);
  const [channels, setChannels] = React.useState<Set<NotifyChannel>>(new Set(["email", "inapp"]));
  const [loadState, setLoadState] = React.useState<LoadState>("idle");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Pull current prefs when the dialog opens.
  React.useEffect(() => {
    if (!open || !isFollowing) return;
    let cancelled = false;
    setLoadState("loading");
    setErrorMsg(null);
    (async () => {
      try {
        const res = await apiFetch(`/api/follows/${encodeURIComponent(auctionId)}/prefs`);
        if (cancelled) return;
        if (!res.ok) {
          setErrorMsg(res.status === 404 ? "Sigue esta subasta para configurar alertas." : "No se pudieron cargar las preferencias.");
          setLoadState("error");
          return;
        }
        const body = (await res.json()) as PrefsResponse;
        const data = body.data;
        setPrefs({
          notifyOnGoLive: data.notifyOnGoLive,
          notifyOnBid: data.notifyOnBid,
          notifyOnStatus: data.notifyOnStatus,
          notifyOnSuspension: data.notifyOnSuspension,
          notifyOnResume: data.notifyOnResume,
          notifyOnFinish: data.notifyOnFinish,
          channels: data.channels,
          quietHoursStart: data.quietHoursStart,
          quietHoursEnd: data.quietHoursEnd,
        });
        setChannels(new Set(parseChannels(data.channels)));
        setLoadState("idle");
      } catch {
        if (cancelled) return;
        setErrorMsg("Sin conexión. Reinténtalo.");
        setLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, isFollowing, auctionId]);

  const toggleField = (k: keyof Omit<FollowPrefs, "channels" | "quietHoursStart" | "quietHoursEnd">) => {
    setPrefs((p) => ({ ...p, [k]: !p[k] }));
  };

  const toggleChannel = (c: NotifyChannel) => {
    setChannels((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const onPushChange = (subscribed: boolean) => {
    setChannels((prev) => {
      const next = new Set(prev);
      if (subscribed) next.add("push");
      else next.delete("push");
      return next;
    });
  };

  const handleSave = async () => {
    setLoadState("saving");
    setErrorMsg(null);
    try {
      const body = {
        ...prefs,
        channels: serializeChannels(Array.from(channels)),
      };
      const res = await apiFetch(`/api/follows/${encodeURIComponent(auctionId)}/prefs`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setErrorMsg(res.status === 404 ? "Sigue esta subasta para guardar preferencias." : "No se pudieron guardar. Reinténtalo.");
        setLoadState("error");
        return;
      }
      setLoadState("saved");
      // Auto-dismiss after a short success state.
      window.setTimeout(() => setOpen(false), 600);
    } catch {
      setErrorMsg("Sin conexión. Reinténtalo.");
      setLoadState("error");
    }
  };

  // --- Trigger button ---
  const triggerDisabled = !isFollowing;
  const triggerCommon =
    "inline-flex items-center gap-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1F3A5F]";
  const triggerActive = "border border-[#1F3A5F]/30 text-[#1F3A5F] hover:bg-[#1F3A5F]/5";
  const triggerInactive = "border border-[#1F3A5F]/15 text-[#1F3A5F]/40 cursor-not-allowed";

  let triggerEl: React.ReactNode;
  if (triggerVariant === "icon") {
    triggerEl = (
      <button
        type="button"
        disabled={triggerDisabled}
        aria-label={triggerDisabled ? "Sigue para configurar alertas" : "Configurar alertas"}
        title={triggerDisabled ? "Sigue esta subasta para configurar alertas" : "Configurar alertas"}
        className={cn(
          triggerCommon,
          "h-9 w-9 justify-center rounded-full bg-white",
          triggerDisabled ? triggerInactive : triggerActive,
          className,
        )}
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
      </button>
    );
  } else if (triggerVariant === "compact") {
    triggerEl = (
      <button
        type="button"
        disabled={triggerDisabled}
        className={cn(
          triggerCommon,
          "h-8 rounded-full px-3 text-xs bg-white",
          triggerDisabled ? triggerInactive : triggerActive,
          className,
        )}
      >
        <Bell className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{triggerLabel}</span>
      </button>
    );
  } else {
    triggerEl = (
      <button
        type="button"
        disabled={triggerDisabled}
        className={cn(
          triggerCommon,
          "h-9 rounded-md px-3 text-sm bg-white",
          triggerDisabled ? triggerInactive : triggerActive,
          className,
        )}
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        <span>{triggerLabel}</span>
      </button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{triggerEl}</DialogTrigger>
      <DialogContent
        className="sm:max-w-md bg-[#FBF8F3] border-[#1F3A5F]/15"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle className="text-[#1F3A5F] flex items-center gap-2">
            <BellRing className="h-5 w-5 text-[#B08A3E]" aria-hidden="true" />
            Alertas de esta subasta
          </DialogTitle>
          <DialogDescription className="text-[#1F3A5F]/70">
            Elige qué eventos te interesan y cómo prefieres recibirlos.
          </DialogDescription>
        </DialogHeader>

        {loadState === "loading" ? (
          <div className="flex items-center justify-center py-8 text-[#1F3A5F]/70 gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Cargando preferencias…
          </div>
        ) : (
          <div className="space-y-5 py-2">
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#1F3A5F]/60 mb-2">
                Eventos
              </h3>
              <ul className="space-y-2.5">
                {(Object.keys(PREF_FIELD_LABELS_ES) as Array<keyof typeof PREF_FIELD_LABELS_ES>).map((key) => {
                  const { label, help } = PREF_FIELD_LABELS_ES[key];
                  const checked = prefs[key];
                  return (
                    <li key={key}>
                      <label className="flex items-start gap-3 cursor-pointer group">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleField(key)}
                          className="mt-0.5 border-[#1F3A5F]/30 data-[state=checked]:bg-[#1F3A5F] data-[state=checked]:border-[#1F3A5F]"
                        />
                        <div className="leading-tight">
                          <div className="text-sm text-[#1F3A5F]">{label}</div>
                          <div className="text-xs text-[#1F3A5F]/60 mt-0.5">{help}</div>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#1F3A5F]/60 mb-2">
                Canales
              </h3>
              <div className="space-y-2.5">
                {(["email", "inapp"] as NotifyChannel[]).map((c) => (
                  <label key={c} className="flex items-center gap-3 cursor-pointer">
                    <Checkbox
                      checked={channels.has(c)}
                      onCheckedChange={() => toggleChannel(c)}
                      className="border-[#1F3A5F]/30 data-[state=checked]:bg-[#1F3A5F] data-[state=checked]:border-[#1F3A5F]"
                    />
                    <span className="text-sm text-[#1F3A5F]">{CHANNEL_LABELS_ES[c]}</span>
                  </label>
                ))}

                {/* Push lives in its own widget — it owns the permission flow. */}
                <div className="pt-1">
                  <WebPushToggle compact onChange={onPushChange} />
                </div>
              </div>
            </section>

            {errorMsg && (
              <div className="flex items-start gap-2 rounded-md border border-[#B08A3E]/30 bg-[#B08A3E]/5 px-3 py-2 text-xs text-[#B08A3E]">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="mt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            className="text-[#1F3A5F]/70 hover:text-[#1F3A5F] hover:bg-[#1F3A5F]/5"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={loadState === "loading" || loadState === "saving"}
            className="bg-[--color-action-soft] border border-[--color-action] text-[--color-ink-primary] hover:bg-[--color-action-soft]/80"
          >
            {loadState === "saving" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                Guardando…
              </>
            ) : loadState === "saved" ? (
              "Guardado"
            ) : (
              "Guardar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
