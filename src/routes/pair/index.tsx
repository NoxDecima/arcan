/**
 * PairRoute: handles /pair — chooses between initiator and responder flow
 * based on the `?role=` query parameter.
 *
 * - `?role=initiator` (or any explicit "initiator" value) → InitiatorStep
 * - anything else (including no role param, or URL hash present) → ResponderStep
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-lg shadow-sm border">
        <div className="p-6 border-b">
          <h1 className="text-xl font-bold">
            {role === "initiator" ? "Link new device" : "Join account"}
          </h1>
        </div>
        {role === "initiator" ? <InitiatorStep /> : <ResponderStep />}
      </div>
    </div>
  );
}
