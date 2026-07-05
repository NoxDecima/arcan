import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { Avatar } from "@/components/avatar";
import { SafetyNumber } from "@/components/safety-number";
import { getAccountPubkeyHex } from "@/auth/pubkey";
import { Skel } from "@/components/skeleton";
import { PCard, PSectionLabel, PRow, Icon } from "@/ui/kit";

/**
 * AccountSection (Unit 9-5a, Wave C): the FIRST card in settings, rebuilt against the
 * prototype. In Wave C this component is no longer rendered by SettingsBody
 * (logic folded into the SettingsBody container that renders <SettingsScreen>).
 * The component stays functional for isolated unit tests; Phase 4 deletes it.
 *
 * Settings-kit imports replaced with @/ui/kit equivalents (Wave C cleanup).
 */
export function AccountSection() {
  const me = useAccount(ArcanAccount, { resolve: { profile: true } });
  const navigate = useNavigate();
  const [showSafety, setShowSafety] = useState(false);

  if (!me.$isLoaded) {
    return (
      <div data-testid="account-section-loading">
        <PSectionLabel>account</PSectionLabel>
        <PCard>
          <div className="px-3.5 py-3">
            <Skel w="55%" h={14} />
          </div>
        </PCard>
      </div>
    );
  }

  const myID = (me as any).$jazz?.id as string | undefined;
  const fingerprintHex = getAccountPubkeyHex(me);

  return (
    <div>
      <PSectionLabel>account</PSectionLabel>
      <PCard>
        {/* MeRow — whole row → profile (design MeRow, 44px avatar) */}
        <button
          type="button"
          data-testid="settings-me-row"
          onClick={() => myID && navigate(`/profile/${myID}`)}
          disabled={!myID}
          className="flex w-full items-center gap-3 border-b border-hairline px-3.5 py-[13px] text-left hover:bg-panel-2 disabled:opacity-50"
        >
          <Avatar
            src={(me as any).profile.avatar}
            initials={me.profile.displayName?.[0] ?? "?"}
            size="md"
            loadAs={me}
            className="!h-11 !w-11"
            data-testid="settings-me-avatar"
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold leading-tight text-text">
              {me.profile.displayName}
            </div>
            <div className="mt-0.5 text-[11px] leading-none text-dim">
              view your profile
            </div>
          </div>
          <Icon d="chev" size={15} className="text-dim" />
        </button>

        <PRow
          icon="key"
          label="change password"
          onClick={() => navigate("/settings/change-password")}
          data-testid="change-password-btn"
        />
        <PRow
          icon="shield"
          label="recovery code"
          onClick={() => navigate("/settings/recovery-code")}
          data-testid="view-recovery-code-btn"
        />

        {/* Expandable safety-number row (4-D). Collapsed shows a chevron that
            rotates open; expanded renders the formatted number on panel-2.
            NOTE: In Wave C, this row is DROPPED from the SettingsScreen presenter
            (safety lives on the profile per proto). It remains here so existing
            isolated unit tests for AccountSection continue to pass. */}
        <button
          type="button"
          data-testid="safety-number-toggle"
          aria-expanded={showSafety}
          onClick={() => setShowSafety((v) => !v)}
          className={`flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-panel-2 ${
            showSafety ? "border-b border-hairline" : ""
          }`}
        >
          <span className="text-text-2">
            <Icon d="shield" size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-medium leading-tight text-text">
              safety number
            </div>
            <div className="mt-0.5 text-[10.5px] leading-tight text-dim">
              verify it matches in person
            </div>
          </div>
          <span
            className={`text-dim transition-transform ${showSafety ? "rotate-90" : ""}`}
          >
            <Icon d="chev" size={15} />
          </span>
        </button>
        {showSafety && (
          <div className="bg-panel-2 px-3.5 py-3">
            <SafetyNumber fingerprintHex={fingerprintHex} />
          </div>
        )}
      </PCard>
    </div>
  );
}
