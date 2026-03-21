/**
 * alert-delivery.ts
 *
 * Browser notification delivery for Luminus alert firings.
 *
 * Architecture:
 * - Delivery settings live in localStorage (browser enabled flag).
 * - Per-rule cooldown tracked in localStorage. Default: 5 min. Prevents
 *   spam when evaluateAlerts() runs on every data refresh tick.
 * - The notification `tag` field deduplicates same-rule tray entries in browsers
 *   that support it, giving a second line of defence against duplicates.
 * - Clicking a notification focuses the app and sets a `#alert=<ruleId>` hash
 *   hint in the URL. This does NOT reconstruct full workspace state; it is
 *   an actionable pointer for future deep-link work. Comment clearly so no
 *   caller assumes more than is delivered.
 */

import type { AlertFiring } from './alerts';

const DELIVERY_KEY = 'luminus:alerts:delivery';
const COOLDOWN_KEY = 'luminus:alerts:cooldown';

/** Minimum ms between repeated notifications for the same rule. */
export const NOTIFICATION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

export interface DeliverySettings {
  browserEnabled: boolean;
}

// ---- Settings ----

function loadDeliverySettings(): DeliverySettings {
  if (typeof window === 'undefined') return { browserEnabled: false };
  try {
    const raw = window.localStorage.getItem(DELIVERY_KEY);
    if (!raw) return { browserEnabled: false };
    const parsed = JSON.parse(raw);
    return { browserEnabled: false, ...parsed };
  } catch {
    return { browserEnabled: false };
  }
}

function saveDeliverySettings(settings: DeliverySettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DELIVERY_KEY, JSON.stringify(settings));
  } catch {}
}

export function getDeliverySettings(): DeliverySettings {
  return loadDeliverySettings();
}

export function setBrowserNotificationsEnabled(enabled: boolean): DeliverySettings {
  const settings: DeliverySettings = { ...loadDeliverySettings(), browserEnabled: enabled };
  saveDeliverySettings(settings);
  return settings;
}

// ---- Permission ----

/**
 * Returns current Notification permission, or 'unsupported' if the API is absent.
 */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

/**
 * Request browser notification permission.
 * Returns the resulting permission state.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}

// ---- Cooldown ----

function loadCooldownMap(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(COOLDOWN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function saveCooldownMap(map: Record<string, number>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(COOLDOWN_KEY, JSON.stringify(map));
  } catch {}
}

/**
 * Returns true if this ruleId is still within the cooldown window.
 * Exported for testing; callers normally go through deliverFirings().
 */
export function isOnCooldown(ruleId: string, nowMs: number, cooldownMs = NOTIFICATION_COOLDOWN_MS): boolean {
  const map = loadCooldownMap();
  const last = map[ruleId] ?? 0;
  return nowMs - last < cooldownMs;
}

/** Reset the cooldown for a rule (e.g. after rule is re-enabled). Internal use only in tests. */
export function _clearCooldown(ruleId: string): void {
  const map = loadCooldownMap();
  delete map[ruleId];
  saveCooldownMap(map);
}

// ---- Message formatting ----

interface NotificationContent {
  title: string;
  body: string;
}

export function firingToNotificationContent(firing: AlertFiring): NotificationContent {
  const conditionVerb: Record<string, string> = {
    price_above: 'price spike',
    price_below: 'price drop',
    congestion_above: 'congestion alert',
    outage_start: 'outage started',
  };
  const condLabel = conditionVerb[firing.condition] ?? firing.condition.replace(/_/g, ' ');

  let body: string;
  if (firing.condition === 'price_above') {
    body = `${firing.assetLabel}: ${firing.observedValue.toFixed(0)} €/MWh (above ${firing.threshold} €/MWh)`;
  } else if (firing.condition === 'price_below') {
    body = `${firing.assetLabel}: ${firing.observedValue.toFixed(0)} €/MWh (below ${firing.threshold} €/MWh)`;
  } else if (firing.condition === 'congestion_above') {
    body = `${firing.assetLabel}: ${firing.observedValue.toFixed(0)}% utilisation (above ${firing.threshold}%)`;
  } else if (firing.condition === 'outage_start') {
    body = `${firing.assetLabel}: outage detected`;
  } else {
    body = `${firing.assetLabel}: ${condLabel}`;
  }

  return { title: `Luminus — ${condLabel}`, body };
}

// ---- Delivery ----

/**
 * Deliver newly fired alerts as browser notifications.
 *
 * Rules:
 * - Does nothing if settings.browserEnabled is false.
 * - Does nothing if Notification permission is not 'granted'.
 * - Skips any rule that fired a notification within NOTIFICATION_COOLDOWN_MS.
 * - Uses the rule ID as the notification `tag` so the browser collapses
 *   repeated same-rule notifications in the tray.
 * - Clicking the notification focuses the app window and sets a `#alert=<ruleId>`
 *   hash. This encodes the alert identity for context, NOT a full workspace
 *   restoration. Full deep-linking is deferred to a later sprint.
 */
export function deliverFirings(firings: AlertFiring[]): void {
  if (typeof window === 'undefined') return;

  const settings = loadDeliverySettings();
  if (!settings.browserEnabled) return;

  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;

  const now = Date.now();
  const cooldownMap = loadCooldownMap();
  let changed = false;

  for (const firing of firings) {
    const last = cooldownMap[firing.ruleId] ?? 0;
    if (now - last < NOTIFICATION_COOLDOWN_MS) continue;

    const { title, body } = firingToNotificationContent(firing);

    // Hash hint for click handler. Encodes alert identity only.
    const alertParam = encodeURIComponent(firing.ruleId);
    const clickUrl = `${window.location.origin}${window.location.pathname}#alert=${alertParam}`;

    try {
      const n = new Notification(title, {
        body,
        icon: '/favicon.ico',
        // tag deduplicates same-rule tray entries; latest replaces earlier
        tag: `luminus-alert-${firing.ruleId}`,
        data: { ruleId: firing.ruleId, assetLabel: firing.assetLabel },
      });

      n.onclick = () => {
        window.focus();
        // Navigates to app with alert hint. Does NOT restore full workspace state.
        window.location.href = clickUrl;
        n.close();
      };

      cooldownMap[firing.ruleId] = now;
      changed = true;
    } catch {
      // Notification constructor can throw in sandboxed iframes; skip silently.
    }
  }

  if (changed) saveCooldownMap(cooldownMap);
}
