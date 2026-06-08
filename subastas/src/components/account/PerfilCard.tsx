"use client";

/**
 * PerfilCard — "Tus datos de registro". Reads name/email/createdAt/trialStartDate
 * from GET /api/user/profile (fetched by the parent page). Two actions in the
 * header: Editar (name modal) + Cambiar contraseña (password modal). Name edits
 * update locally via onNameSaved so the row reflects the change immediately.
 */

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { Pencil, KeyRound } from "lucide-react";
import { AccountSection, DataRow } from "./AccountSection";
import { EditNameModal } from "./EditNameModal";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { Button } from "@/components/ui/button";
import { formatAccountDate } from "./format";

export type ProfileData = {
  name: string | null;
  email: string;
  createdAt: string | Date | null;
  trialStartDate: string | Date | null;
};

export function PerfilCard({
  profile,
  onNameSaved,
}: {
  profile: ProfileData;
  onNameSaved: (name: string) => void;
}) {
  const t = useTranslations("account");
  const locale = useLocale();
  const [editOpen, setEditOpen] = React.useState(false);
  const [pwOpen, setPwOpen] = React.useState(false);

  return (
    <AccountSection
      eyebrow={t("perfilEyebrow")}
      title={t("perfilTitle")}
      action={
        <>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            {t("perfilEdit")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPwOpen(true)}>
            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
            {t("perfilChangePassword")}
          </Button>
        </>
      }
    >
      <dl>
        <DataRow label={t("perfilName")}>
          {profile.name?.trim() ? (
            profile.name
          ) : (
            <span className="font-normal italic text-[var(--color-ink-quiet)]">
              {t("perfilNoName")}
            </span>
          )}
        </DataRow>
        <DataRow label={t("perfilEmail")}>
          <span className="break-all">{profile.email}</span>
        </DataRow>
        <DataRow label={t("perfilCreated")}>
          {formatAccountDate(profile.createdAt, locale)}
        </DataRow>
        <DataRow label={t("perfilTrialStarted")}>
          {formatAccountDate(profile.trialStartDate, locale)}
        </DataRow>
      </dl>

      <EditNameModal
        open={editOpen}
        onOpenChange={setEditOpen}
        currentName={profile.name ?? ""}
        onSaved={onNameSaved}
      />
      <ChangePasswordModal open={pwOpen} onOpenChange={setPwOpen} />
    </AccountSection>
  );
}
