import { useNavigate } from "react-router-dom";
import { PCard, PRow } from "@/ui/kit";

/**
 * feedback-section.tsx — Wave C: settings-kit imports replaced with @/ui/kit.
 * FeedbackRow is no longer rendered by SettingsBody (logic folded into the
 * container that renders <SettingsScreen>). Stays functional for isolated unit
 * tests (feedback-row.test.tsx); Phase 4 deletes.
 */
export function FeedbackRow() {
  const navigate = useNavigate();
  return (
    <PCard>
      <PRow
        data-testid="feedback-row"
        icon="message"
        iconClassName="text-arcan-accent"
        label="give feedback"
        sub="report a bug or share an idea"
        onClick={() => navigate("/settings/feedback")}
        last
      />
    </PCard>
  );
}
