/**
 * ContactDetailRoute: minimal contact detail page.
 *
 * Shows the contact's display name, safety number (for TOFU verification),
 * and a Remove button that tombstones the contact from the contactBook.
 */

import { useNavigate, useParams } from "react-router-dom";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { SafetyNumber } from "@/components/safety-number";
import { Button } from "@/components/ui/button";
import { findOrCreate1to1Conversation } from "@/jazz/conversation";
import { Avatar } from "@/components/avatar";
import { resolveAvatarFileBlob, useRemoteAvatar } from "@/jazz/avatarResolver";

export function ContactDetailRoute() {
  const { contactID } = useParams<{ contactID: string }>();
  const navigate = useNavigate();

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
      <div className="flex flex-col items-center gap-4 p-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <p className="text-sm text-red-600">Contact not found.</p>
        <Button variant="outline" onClick={() => navigate("/")}>
          Go home
        </Button>
      </div>
    );
  }

  async function handleStartChat() {
    if (!contact) return;
    const conversation = await findOrCreate1to1Conversation(me as any, contact);
    navigate(`/conversations/${(conversation as any).$jazz.id}`);
  }

  function handleRemove() {
    // Remove the contact from the contactBook by predicate
    (me as any).root.contactBook.$jazz.remove(
      (c: any) => c.$jazz?.id === contactID,
    );
    navigate("/");
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-md mx-auto">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="text-muted-foreground"
        >
          ← Back
        </Button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-4 mb-4">
          <Avatar
            src={avatar}
            initials={(contact as any).displayNameLocal?.[0] ?? "?"}
            size="lg"
            loadAs={me}
          />
          <h1
            data-testid="contact-detail-name"
            className="text-2xl font-bold text-gray-900"
          >
            {(contact as any).displayNameLocal}
          </h1>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium">
            Safety number (verify out of band):
          </p>
          <SafetyNumber fingerprintHex={(contact as any).pinnedFingerprint ?? ""} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          onClick={() => void handleStartChat()}
          data-testid="start-chat-btn"
        >
          Start chat
        </Button>
        <Button
          variant="destructive"
          onClick={handleRemove}
          data-testid="contact-remove-btn"
        >
          Remove contact
        </Button>
      </div>
    </div>
  );
}
