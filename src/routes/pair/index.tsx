/**
 * PairRoute: handles /pair — chooses between initiator and responder flow
 * based on the `?role=` query parameter.
 *
 * - `?role=initiator` → InitiatorStep
 * - anything else (including no role param, or URL hash present) → ResponderStep
 *
 * The inner steps own their AuthSurface; this route is a thin selector.
 *
 * This route is auth-OPTIONAL: the responder arrives as an unauthenticated
 * user (or guest) and becomes authenticated after claiming the account.
 * App.tsx adds a special case before the auth gate to allow this route.
 */

import { InitiatorStep } from "./initiator-step";
import { ResponderStep } from "./responder-step";

export function PairRoute() {
  const params = new URLSearchParams(window.location.search);
  const role = params.get("role");
  return role === "initiator" ? <InitiatorStep /> : <ResponderStep />;
}
