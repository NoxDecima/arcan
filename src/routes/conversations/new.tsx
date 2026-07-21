import { useEffect, useRef, useState } from "react";
import { useAccount } from "jazz-tools/react";
import { useNavigate } from "react-router-dom";
import { useUpNavigation } from "@/nav/use-up-navigation";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import {
  findOrCreate1to1Conversation,
  createGroupConversation,
} from "@/jazz/conversation";
import { setConversationIcon } from "@/jazz/avatar";
import { listContacts } from "@/jazz/handshake";
import { NewConvoScreen } from "@/ui/screens/new-convo-screen";
import { Icon, PButton } from "@/ui/kit";
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
      root: { contacts: { $each: { $onError: "catch" } }, knownConversations: true },
    },
  });
  const navigate = useNavigate();
  const goUp = useUpNavigation();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupImageFile, setGroupImageFile] = useState<File | null>(null);
  const [groupImageUrl, setGroupImageUrl] = useState<string | null>(null);
  const groupImageInputRef = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      if (groupImageUrl) URL.revokeObjectURL(groupImageUrl);
    },
    [groupImageUrl],
  );

  if (!me.$isLoaded) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="p-6">
          <p className="text-sm text-dim">Loading…</p>
        </div>
      </div>
    );
  }

  const rawContacts = listContacts(me);
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

  // Feedback round 2: default group name is the first members' first names.
  const selectedFirstNames = Array.from(selected).map(
    (id) =>
      (rawContacts.find((c: any) => c?.contactAccountID === id) as any)
        ?.displayNameLocal?.trim()
        .split(/\s+/)[0] ?? "someone",
  );
  const defaultGroupTitle =
    selectedFirstNames.slice(0, 3).join(", ") +
    (selectedFirstNames.length > 3 ? ` +${selectedFirstNames.length - 3}` : "");

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
        const title = groupName.trim() || defaultGroupTitle;
        const conv = await createGroupConversation(
          me as any,
          Array.from(selected),
          title,
        );
        if (groupImageFile) {
          try {
            await setConversationIcon(me as any, conv, groupImageFile);
          } catch {
            // Icon upload failing shouldn't block the conversation.
          }
        }
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
        : "create conversation";

  return (
    <>
      <NewConvoScreen
        onBack={() => goUp()}
        contacts={contacts}
        selected={selected}
        onToggle={toggle}
        groupNameSlot={
          isGroup ? (
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder={defaultGroupTitle || "group name (optional)"}
              maxLength={100}
              className="h-9 flex-1 rounded-r-4 border border-hairline bg-panel px-3 font-body text-sm text-text outline-none focus:border-arcan-accent"
              data-testid="new-convo-group-name"
            />
          ) : undefined
        }
        onGroupImagePick={() => groupImageInputRef.current?.click()}
        groupImageUrl={groupImageUrl}
        emptySlot={
          contacts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <Icon d="people" size={28} className="text-dim" />
              <p className="font-body text-ui-sub text-dim">
                no contacts yet — conversations start with a contact.
              </p>
              <div className="w-full max-w-[240px]">
                <PButton
                  primary
                  full
                  icon="plus"
                  label="add a contact"
                  onClick={() => navigate("/contacts/add")}
                  data-testid="new-convo-empty-add"
                />
              </div>
            </div>
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
      <input
        ref={groupImageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="new-convo-group-image-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setGroupImageFile(f);
          setGroupImageUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(f);
          });
        }}
      />
    </>
  );
}
