/**
 * Demo-mode helpers. Enabled when DEMO_MODE=true in env.
 * Demo mode:
 *  - Bypasses authentication (any visitor lands on the demo household).
 *  - Disables every mutation via assertWritable(), returning a friendly error.
 *  - Displayed via <DemoBanner /> on every protected page.
 */

export const DEMO_MODE = process.env.DEMO_MODE === "true";

export const DEMO_EMAIL = "demo@wallet.huberty.pro";
export const DEMO_NAME = "Démo Family";

/**
 * Throw when called from any mutation server action in demo mode.
 * Call at the very top of every action that writes to the DB.
 */
export function assertWritable() {
  if (DEMO_MODE) {
    throw new Error(
      "Mode démo : lecture seule. Crée ton propre compte sur wallet.huberty.pro pour éditer."
    );
  }
}
