import { useNavigate } from "react-router-dom";
import { Card, SRow, Chev } from "./settings-kit";

/**
 * FeedbackRow (Unit 9-5b, 4-F): the inline feedback form has moved to the
 * dedicated /settings/feedback route. This is the single card row that links
 * to it. Positioned directly below the account card, above appearance
 * (proto.jsx SettingsScreen line 277).
 *
 * The kit SRow renders its leading icon in the muted token colour (text-text-2)
 * and exposes no per-icon colour prop, so the message glyph is muted rather
 * than accent-tinted; the chevron comes from the kit Chev helper.
 */
export function FeedbackRow() {
  const navigate = useNavigate();
  return (
    <Card>
      <SRow
        data-testid="feedback-row"
        icon="message"
        label="give feedback"
        sub="report a bug or share an idea"
        control={<Chev />}
        onClick={() => navigate("/settings/feedback")}
        last
      />
    </Card>
  );
}
