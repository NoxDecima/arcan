/**
 * ContactDetailRoute: contact detail page.
 *
 * Wave C (Unit 10): container renders <ProfileScreen> (contact variant). All
 * data logic and handlers moved verbatim. The danger "remove contact" button
 * is passed as dangerZone slot (Rung-4, app-only).
 *
 * Route: /contacts/:contactID/detail
 */

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useUpNavigation } from "@/nav/use-up-navigation";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { SafetyNumber } from "@/components/safety-number";
import { Button } from "@/components/ui/button";
import { findOrCreate1to1Conversation } from "@/jazz/conversation";
import { resolveAvatarFileBlob, useRemoteAvatar } from "@/jazz/avatarResolver";
import { Skel } from "@/components/skeleton";
import { ProfileScreen } from "@/ui/screens/profile-screen";

export function ContactDetailRoute() {
  const { contactID } = useParams<{ contactID: string }>();
  const navigate = useNavigate();
  const goUp = useUpNavigation();

  const me = useAccount(ArcanAccount, {
    resolve: {
      root: { contactBook: { $each: true }, knownConversations: true },
    },
  });

  const contact = me.$isLoaded
    ? me.root.contactBook.find((c) => (c as any).$jazz?.id === contactID)
    : undefined;

  // Sync resolver (covers self / group member); remote-load hook fills in the
  // contact-book branch where the schema only stores a string accountID.
  const localAvatar = me.$isLoaded
    ? resolveAvatarFileBlob({
        accountID: (contact as any)?.contactAccountID,
        me,
      })
    : undefined;
  const remoteAvatar = useRemoteAvatar(
    localAvatar ? null : (contact as any)?.contactAccountID ?? null,
  );
  const avatar = localAvatar ?? remoteAvatar;

  if (!me.$isLoaded) {
    return (
      <div
        className="flex flex-col items-center gap-4 p-6"
        data-testid="contact-detail-loading"
      >
        <Skel w={72} h={72} r={36} />
        <Skel w={140} h={14} />
        <Skel w={90} h={10} />
      </div>
    );
  }

  if (!contact) {
    return (
      <div
        className="flex flex-col items-center gap-4 p-6"
        data-testid="contact-detail-not-found"
      >
        <p className="text-sm text-red">contact not found.</p>
        <Button variant="outline" onClick={() => navigate("/")}>
          go home
        </Button>
      </div>
    );
  }

  const displayName = (contact as any).displayNameLocal as string | undefined;
  const accountID = (contact as any).contactAccountID as string | undefined;
  const fingerprintHex = (contact as any).pinnedFingerprint ?? "";
  const idShort = accountID
    ? `${accountID.slice(0, 6)}…${accountID.slice(-3)}`
    : "";

  const [safetyOpen, setSafetyOpen] = useState(false);

  async function handleStartChat() {
    if (!contact) return;
    const conversation = await findOrCreate1to1Conversation(me as any, contact);
    navigate(`/conversations/${(conversation as any).$jazz.id}`);
  }

  function handleRemove() {
    (me as any).root.contactBook.$jazz.remove(
      (c: any) => c.$jazz?.id === contactID,
    );
    navigate("/");
  }

  return (
    <ProfileScreen
      vm={{
        name: displayName ?? "Unknown",
        initials: displayName?.[0]?.toUpperCase() ?? "?",
        avatarSrc: avatar ?? undefined,
        idShort,
        sharedConversations: [],
      }}
      onBack={() => goUp()}
      onMessage={() => void handleStartChat()}
      safetyOpen={safetyOpen}
      onToggleSafety={() => setSafetyOpen((o) => !o)}
      safetySlot={
        fingerprintHex && fingerprintHex.length === 64 ? (
          <SafetyNumber fingerprintHex={fingerprintHex} />
        ) : undefined
      }
      dangerZone={
        <Button
          variant="destructive"
          className="w-full"
          onClick={handleRemove}
          data-testid="contact-remove-btn"
        >
          remove contact
        </Button>
      }
      // testid carries
      nameTestId="contact-detail-name"
      messageTestId="start-chat-btn"
    />
  );
}
