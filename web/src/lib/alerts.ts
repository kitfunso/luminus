/**
 * Alert rules: local-only scaffold.
 * Rules are stored in localStorage; delivery hooks (Telegram, email) are out of scope for v1.
 *
 * Storage key: luminus:alerts
 */

export type AlertCondition =
  | 'price_above'      // EUR/MWh
  | 'price_below'
  | 'outage_start'
  | 'outage_end'
  | 'congestion_above' // utilisation %
  | 'forecast_miss'    // MAPE %
  | 'spread_above'     // EUR/MWh spread between two zones (target: "FROM-TO")
  | 'spread_below';    // EUR/MWh spread between two zones (target: "FROM-TO")

export type AlertAssetType = 'country' | 'plant' | 'corridor';

export interface AlertRule {
  id: string;
  assetType: AlertAssetType;
  assetId: string;
  assetLabel: string;
  condition: AlertCondition;
  threshold?: number;  // numeric threshold where applicable
  enabled: boolean;
  createdAt: string;
  lastTriggeredAt?: string;
  /** Delivery channels for this rule. 'in_app' always on; 'browser' opt-in. */
  deliveryChannels: ('in_app' | 'browser')[];
}

export interface AlertFiring {
  ruleId: string;
  assetLabel: string;
  condition: AlertCondition;
  threshold?: number;
  observedValue: number;
  firedAt: string;
}

const RULES_KEY = 'luminus:alerts:rules';
const FIRINGS_KEY = 'luminus:alerts:firings';
const MAX_FIRINGS = 50;

function loadRules(): AlertRule[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RULES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AlertRule[]) : [];
  } catch {
    return [];
  }
}

function saveRules(rules: AlertRule[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RULES_KEY, JSON.stringify(rules));
  } catch {}
}

function loadFirings(): AlertFiring[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FIRINGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AlertFiring[]) : [];
  } catch {
    return [];
  }
}

function saveFirings(firings: AlertFiring[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FIRINGS_KEY, JSON.stringify(firings.slice(0, MAX_FIRINGS)));
  } catch {}
}

export function getAlertRules(): AlertRule[] {
  return loadRules();
}

export function getAlertFirings(): AlertFiring[] {
  return loadFirings();
}

export function addAlertRule(rule: Omit<AlertRule, 'id' | 'createdAt'>): AlertRule[] {
  const rules = loadRules();
  const newRule: AlertRule = {
    ...rule,
    id: `alert:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  };
  const next = [newRule, ...rules];
  saveRules(next);
  return next;
}

export function removeAlertRule(id: string): AlertRule[] {
  const next = loadRules().filter((r) => r.id !== id);
  saveRules(next);
  return next;
}

export function toggleAlertRule(id: string): AlertRule[] {
  const rules = loadRules().map((r) =>
    r.id === id ? { ...r, enabled: !r.enabled } : r
  );
  saveRules(rules);
  return rules;
}

/**
 * Evaluate all enabled rules against the current data snapshot.
 * Returns any new firings (does not deduplicate vs last run — caller decides cooldown).
 */
export function evaluateAlerts(
  priceByIso: Record<string, number>,
  congestionByCorridorId: Record<string, number>,
  outageSet: Set<string>
): AlertFiring[] {
  const rules = loadRules().filter((r) => r.enabled);
  const now = new Date().toISOString();
  const fired: AlertFiring[] = [];

  for (const rule of rules) {
    let observed: number | undefined;
    let triggered = false;

    if (rule.condition === 'price_above' || rule.condition === 'price_below') {
      const iso2 = rule.assetId.replace('country:', '').toUpperCase();
      observed = priceByIso[iso2];
      if (observed === undefined) continue;
      triggered =
        rule.condition === 'price_above'
          ? observed > (rule.threshold ?? 0)
          : observed < (rule.threshold ?? 9999);
    }

    if (rule.condition === 'congestion_above') {
      const cUtil = congestionByCorridorId[rule.assetId];
      observed = cUtil !== undefined ? cUtil * 100 : undefined;
      if (observed === undefined) continue;
      triggered = observed > (rule.threshold ?? 80);
    }

    if (rule.condition === 'spread_above' || rule.condition === 'spread_below') {
      // target format: "corridor:FROM-TO" or just "FROM-TO"
      const raw = rule.assetId.replace('corridor:', '');
      const [fromIso, toIso] = raw.split('-').map((s) => s.toUpperCase());
      const fromPrice = fromIso ? priceByIso[fromIso] : undefined;
      const toPrice = toIso ? priceByIso[toIso] : undefined;
      if (fromPrice === undefined || toPrice === undefined) continue;
      observed = toPrice - fromPrice;
      triggered =
        rule.condition === 'spread_above'
          ? observed > (rule.threshold ?? 0)
          : observed < (rule.threshold ?? 0);
    }

    if (rule.condition === 'outage_start') {
      triggered = outageSet.has(rule.assetId);
      observed = triggered ? 1 : 0;
    }

    if (triggered && observed !== undefined) {
      fired.push({
        ruleId: rule.id,
        assetLabel: rule.assetLabel,
        condition: rule.condition,
        threshold: rule.threshold,
        observedValue: observed,
        firedAt: now,
      });
    }
  }

  if (fired.length > 0) {
    const existing = loadFirings();
    saveFirings([...fired, ...existing]);
  }

  return fired;
}

export const CONDITION_LABELS: Record<AlertCondition, string> = {
  price_above: 'Price above',
  price_below: 'Price below',
  outage_start: 'Outage starts',
  outage_end: 'Outage ends',
  congestion_above: 'Congestion above',
  forecast_miss: 'Forecast miss',
  spread_above: 'Spread above',
  spread_below: 'Spread below',
};
