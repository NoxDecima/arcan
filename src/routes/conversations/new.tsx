import { useState } from "react";
import { useAccount } from "jazz-tools/react";
import { useNavigate } from "react-router-dom";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import {
  findOrCreate1to1Conversation,
  createGroupConversation,
} from "@/jazz/conversation";
import { NewConvoScreen } from "@/ui/screens/new-convo-screen";
import type { PickItem } from "@/ui/screens/picker-types";

/**
 * NewConversationRoute (Unit 4 Phase 6 → Wave C): unified entry point for
 * both 1:1 and group conversation creation.
 *
 * Wave C: container renders <NewConvoScreen>. All data logic and handlers
 * moved verbatim. Avatar resolution per-contact (useRemoteAvatar) is Rung-4;
 * contact rows show initials.
 */
export function NewConversationRoute() {
  const me = useAccount(ArcanAccount, {
    resolve: {
      profile: true,
      root: { contactBook: { $each: true }, knownConversations: true },
    },
  });
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!me.$isLoaded) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="p-6">
          <p className="text-sm text-dim">Loading…</p>
        </div>
      </div>
    );
  }

  const rawContacts = Array.from((me.root.contactBook as any) ?? []);
  const contacts: PickItem[] = rawContacts
    .filter((c: any) => !!c?.contactAccountID)
    .map((c: any) => ({
      id: c.contactAccountID as string,
      name: (c.displayNameLocal as string | undefined) ?? "Unknown",
      initials:
        ((c.displayNameLocal as string | undefined)?.[0]?.toUpperCase()) ?? "?",
      // avatarSrc: undefined — Rung-4 (useRemoteAvatar is per-item, incompatible with map)
    }));

  const selectedCount = selected.size;
  const isGroup = selectedCount >= 2;

  function toggle(accountID: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(accountID)) next.delete(accountID);
      else next.add(accountID);
      return next;
    });
  }

  async function submit() {
    if (creating) return; // reentrancy guard — double-click could create duplicates
    if (selectedCount === 0) return;
    setCreating(true);
    setError(null);
    try {
      if (selectedCount === 1) {
        const accountID = Array.from(selected)[0];
        const contact = rawContacts.find(
          (c: any) => c?.contactAccountID === accountID,
        );
        const conv = await findOrCreate1to1Conversation(
          me as any,
          contact ?? { contactAccountID: accountID },
        );
        navigate(`/conversations/${(conv as any).$jazz.id}`);
      } else {
        const title =
          groupName.trim() || `Group with ${selectedCount} people`;
        const conv = await createGroupConversation(
          me as any,
          Array.from(selected),
          title,
        );
        navigate(`/conversations/${(conv as any).$jazz.id}`);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to create conversation",
      );
    } finally {
      setCreating(false);
    }
  }

  const submitLabel =
    selectedCount === 0
      ? "select contacts"
      : isGroup
        ? `create group · ${selectedCount} members`
        : "message";

  return (
    <NewConvoScreen
      onBack={() => navigate(-1)}
      contacts={contacts}
      selected={selected}
      onToggle={toggle}
      groupNameSlot={
        isGroup ? (
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="group name (optional)"
            maxLength={100}
            className="h-9 flex-1 rounded-r-4 border border-hairline bg-panel px-3 font-body text-sm text-text outline-none focus:border-arcan-accent"
            data-testid="new-convo-group-name"
          />
        ) : undefined
      }
      emptySlot={
        contacts.length === 0 ? (
          <>
            <p className="text-sm text-dim">You have no contacts yet.</p>
            <button
              type="button"
              onClick={() => navigate("/contacts/add")}
              className="mt-2 text-sm text-arcan-accent hover:underline"
            >
              Add a contact
            </button>
          </>
        ) : undefined
      }
      errorSlot={
        error ? <p className="text-xs text-red">{error}</p> : undefined
      }
      submitLabel={submitLabel}
      submitDisabled={selectedCount === 0 || creating}
      onSubmit={() => void submit()}
      // testid carries
      backTestId="new-convo-back"
      emptyTestId="new-convo-empty"
      errorTestId="new-convo-error"
      submitTestId="new-convo-submit"
    />
  );
}
