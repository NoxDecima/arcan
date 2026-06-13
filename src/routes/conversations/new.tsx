import { useState } from "react";
import { useAccount } from "jazz-tools/react";
import { useNavigate } from "react-router-dom";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/avatar";
import {
  findOrCreate1to1Conversation,
  createGroupConversation,
} from "@/jazz/conversation";
import { resolveAvatarFileBlob, useRemoteAvatar } from "@/jazz/avatarResolver";

/**
 * NewConversationRoute (Unit 4 Phase 6): unified entry point for both 1:1
 * and group conversation creation. Selecting one contact behaves like
 * `findOrCreate1to1Conversation`; selecting two or more switches to
 * `createGroupConversation` and surfaces an optional group-name input.
 *
 * Replaces the older two-modal flow (ContactPicker + GroupCreateDialog) for
 * starting new conversations from the sidebar "+" button.
 */
interface ContactRowProps {
  contact: any;
  selected: boolean;
  onToggle: () => void;
  me: any;
  index: number;
}

function NewConvoContactRow({
  contact,
  selected,
  onToggle,
  me,
  index,
}: ContactRowProps) {
  const accountID = contact?.contactAccountID as string | undefined;
  const localAvatar = resolveAvatarFileBlob({
    accountID: accountID ?? "",
    me,
  });
  const remoteAvatar = useRemoteAvatar(
    localAvatar ? null : accountID ?? null,
  );
  const avatar = localAvatar ?? remoteAvatar;

  if (!accountID) return null;

  return (
    <button
      type="button"
      data-testid={`new-convo-contact-${accountID}`}
      data-index={index}
      onClick={onToggle}
      aria-pressed={selected}
      className={`w-full flex items-center gap-3 p-2 rounded-r-3 ${
        selected ? "bg-accent-soft" : "hover:bg-panel-2"
      }`}
    >
      <Avatar
        src={avatar}
        initials={contact?.displayNameLocal?.[0] ?? "?"}
        size="sm"
        loadAs={me}
      />
      <span className="flex-1 text-left text-sm text-text">
        {contact?.displayNameLocal ?? "Unknown"}
      </span>
      <span
        aria-hidden
        className={`w-5 h-5 rounded-r-1 border-2 flex items-center justify-center text-xs ${
          selected
            ? "bg-arcan-accent border-transparent text-on-accent"
            : "border-hairline"
        }`}
      >
        {selected ? "✓" : ""}
      </span>
    </button>
  );
}

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
      <div className="p-6">
        <p className="text-sm text-dim">Loading…</p>
      </div>
    );
  }

  const contacts = Array.from((me.root.contactBook as any) ?? []);
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
    if (selectedCount === 0) return;
    setCreating(true);
    setError(null);
    try {
      if (selectedCount === 1) {
        const accountID = Array.from(selected)[0];
        const contact = contacts.find(
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
    <div className="flex flex-col h-screen bg-bg">
      <header className="p-4 border-b border-hairline flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-sm text-dim hover:text-text"
          data-testid="new-convo-back"
        >
          ← Back
        </button>
        <h1 className="text-lg font-semibold text-text">new conversation</h1>
      </header>

      {isGroup && (
        <div className="p-4 border-b border-hairline">
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="group name (optional)"
            maxLength={100}
            className="w-full p-2 rounded-r-3 border border-hairline bg-panel text-text font-body text-sm outline-none focus:border-arcan-accent"
            data-testid="new-convo-group-name"
          />
        </div>
      )}

      <div className="flex-1 overflow-auto p-2">
        <p className="px-2 pb-2 text-[10px] uppercase tracking-widest text-dim font-semibold">
          contacts · one = 1:1 · two+ = group
        </p>
        {contacts.length === 0 ? (
          <div className="p-6 text-center space-y-2" data-testid="new-convo-empty">
            <p className="text-sm text-dim">You have no contacts yet.</p>
            <button
              type="button"
              onClick={() => navigate("/contacts/add")}
              className="text-sm text-arcan-accent hover:underline"
            >
              Add a contact
            </button>
          </div>
        ) : (
          contacts.map((c: any, i: number) => {
            const id = (c?.contactAccountID as string | undefined) ?? "";
            if (!id) return null;
            return (
              <NewConvoContactRow
                key={id}
                contact={c}
                selected={selected.has(id)}
                onToggle={() => toggle(id)}
                me={me}
                index={i}
              />
            );
          })
        )}
      </div>

      {error && (
        <div className="px-4 pb-2">
          <p className="text-xs text-red" data-testid="new-convo-error">
            {error}
          </p>
        </div>
      )}

      <footer className="p-4 border-t border-hairline">
        <Button
          variant="primary"
          disabled={selectedCount === 0 || creating}
          onClick={() => void submit()}
          data-testid="new-convo-submit"
          className="w-full"
        >
          {submitLabel}
        </Button>
      </footer>
    </div>
  );
}
