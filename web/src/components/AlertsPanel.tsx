'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getAlertRules,
  addAlertRule,
  removeAlertRule,
  toggleAlertRule,
  getAlertFirings,
  CONDITION_LABELS,
  type AlertRule,
  type AlertCondition,
  type AlertAssetType,
} from '@/lib/alerts';
import {
  getDeliverySettings,
  setBrowserNotificationsEnabled,
  requestNotificationPermission,
  getNotificationPermission,
} from '@/lib/alert-delivery';
import { getWatchlist } from '@/lib/watchlist';
import { COUNTRY_CENTROIDS } from '@/lib/countries';

interface AlertsPanelProps {
  onClose: () => void;
}

type Tab = 'rules' | 'log';

// Only expose conditions that evaluateAlerts() genuinely handles.
// outage_end requires previous-state tracking (not yet implemented).
// forecast_miss requires forecasts wired into evaluate() (deferred to a later sprint).
const ASSET_CONDITIONS: Record<AlertAssetType, AlertCondition[]> = {
  country: ['price_above', 'price_below'],
  plant: ['outage_start'],
  corridor: ['congestion_above'],
};

const THRESHOLD_UNIT: Partial<Record<AlertCondition, string>> = {
  price_above: '€/MWh',
  price_below: '€/MWh',
  congestion_above: '%',
};

const NEEDS_THRESHOLD: Set<AlertCondition> = new Set([
  'price_above', 'price_below', 'congestion_above',
]);

function RuleRow({ rule, onRemove, onToggle }: { rule: AlertRule; onRemove: () => void; onToggle: () => void }) {
  const condLabel = CONDITION_LABELS[rule.condition];
  const thresholdStr = rule.threshold !== undefined
    ? ` ${rule.threshold}${THRESHOLD_UNIT[rule.condition] ? ' ' + THRESHOLD_UNIT[rule.condition] : ''}`
    : '';

  return (
    <div className="flex items-start gap-2 py-2 border-b border-white/[0.04] last:border-0">
      <button
        onClick={onToggle}
        className={`mt-0.5 w-3.5 h-3.5 rounded-full border flex-shrink-0 transition-colors ${
          rule.enabled
            ? 'bg-sky-500 border-sky-500'
            : 'bg-transparent border-slate-600'
        }`}
        title={rule.enabled ? 'Disable' : 'Enable'}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] text-slate-300 truncate">{rule.assetLabel}</div>
        <div className="text-[11px] text-slate-500">
          {condLabel}{thresholdStr}
        </div>
      </div>
      <button
        onClick={onRemove}
        className="text-slate-700 hover:text-red-400 text-[11px] transition-colors flex-shrink-0 mt-0.5"
        title="Delete rule"
      >
        ✕
      </button>
    </div>
  );
}

export default function AlertsPanel({ onClose }: AlertsPanelProps) {
  const [tab, setTab] = useState<Tab>('rules');
  const [rules, setRules] = useState<AlertRule[]>(() => getAlertRules());
  const firings = getAlertFirings();

  // Browser notification delivery state
  const [browserEnabled, setBrowserEnabled] = useState<boolean>(
    () => getDeliverySettings().browserEnabled
  );
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(
    () => getNotificationPermission()
  );

  // Sync permission state after page focus (user may have changed it in browser settings)
  useEffect(() => {
    const handleFocus = () => setNotifPermission(getNotificationPermission());
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const handleToggleBrowser = useCallback(async () => {
    if (!browserEnabled) {
      // Request permission if not already granted
      const permission = await requestNotificationPermission();
      setNotifPermission(permission);
      if (permission !== 'granted') {
        // Cannot enable without permission
        return;
      }
    }
    const updated = setBrowserNotificationsEnabled(!browserEnabled);
    setBrowserEnabled(updated.browserEnabled);
  }, [browserEnabled]);

  // New rule form state
  const [formAssetId, setFormAssetId] = useState('');
  const [formCondition, setFormCondition] = useState<AlertCondition>('price_above');
  const [formThreshold, setFormThreshold] = useState('100');
  const [formError, setFormError] = useState('');

  const watchlist = getWatchlist();

  // Available conditions depend on selected asset's type
  const selectedAsset = watchlist.find((w) => w.id === formAssetId);
  const assetType: AlertAssetType = selectedAsset?.type ?? 'country';
  const availableConditions = ASSET_CONDITIONS[assetType];

  const handleAddRule = useCallback(() => {
    setFormError('');
    if (!formAssetId) { setFormError('Select an asset from your watchlist.'); return; }
    if (!formCondition) { setFormError('Select a condition.'); return; }
    const threshold = NEEDS_THRESHOLD.has(formCondition) ? parseFloat(formThreshold) : undefined;
    if (NEEDS_THRESHOLD.has(formCondition) && isNaN(threshold!)) { setFormError('Enter a valid threshold.'); return; }

    const updated = addAlertRule({
      assetType,
      assetId: formAssetId,
      assetLabel: selectedAsset?.label ?? formAssetId,
      condition: formCondition,
      threshold,
      enabled: true,
      deliveryChannels: ['in_app'],
    });
    setRules(updated);
    setFormAssetId('');
    setFormThreshold('100');
  }, [formAssetId, formCondition, formThreshold, assetType, selectedAsset]);

  // Country quick-add: let user add a country not in watchlist by ISO2
  const allCountries = Object.entries(COUNTRY_CENTROIDS).map(([iso2, { name }]) => ({
    id: `country:${iso2}`,
    label: name,
    type: 'country' as AlertAssetType,
  }));

  const assetOptions = [
    ...watchlist.map((w) => ({ id: w.id, label: w.label, type: w.type })),
    // Add countries not already in watchlist
    ...allCountries.filter((c) => !watchlist.some((w) => w.id === c.id)),
  ];

  return (
    <div
      className="right-panel absolute right-4 bg-[#0a0e17]/92 backdrop-blur-xl border border-white/[0.06] rounded-2xl shadow-2xl w-[300px] max-h-[calc(100vh-32px)] flex flex-col"
      style={{ top: 16, zIndex: 15, animation: 'slideInRight 0.2s ease-out' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
        <h3 className="text-sm font-bold text-white">Alerts</h3>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors text-sm">✕</button>
      </div>

      {/* Tabs */}
      <div className="flex px-4 gap-3 pb-2 flex-shrink-0">
        {(['rules', 'log'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-[11px] font-medium pb-0.5 transition-colors border-b ${
              tab === t ? 'text-sky-400 border-sky-400/50' : 'text-slate-500 border-transparent hover:text-slate-400'
            }`}
          >
            {t === 'rules' ? `Rules (${rules.length})` : `Log (${firings.length})`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto sidebar-scroll px-4 pb-4">
        {tab === 'rules' && (
          <div>
            {/* Browser notification toggle */}
            <div className="mb-3 pb-3 border-b border-white/[0.04]">
              <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-2">Delivery</div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-slate-300">Browser notifications</div>
                  {notifPermission === 'denied' && (
                    <div className="text-[10px] text-red-400 mt-0.5">
                      Blocked in browser settings. Enable manually to use.
                    </div>
                  )}
                  {notifPermission === 'unsupported' && (
                    <div className="text-[10px] text-slate-600 mt-0.5">Not supported in this browser.</div>
                  )}
                  {notifPermission === 'default' && !browserEnabled && (
                    <div className="text-[10px] text-slate-500 mt-0.5">Click to enable.</div>
                  )}
                  {notifPermission === 'granted' && browserEnabled && (
                    <div className="text-[10px] text-emerald-500 mt-0.5">On — 5 min cooldown per rule.</div>
                  )}
                </div>
                <button
                  onClick={handleToggleBrowser}
                  disabled={notifPermission === 'denied' || notifPermission === 'unsupported'}
                  className={`w-8 h-4 rounded-full border transition-colors flex-shrink-0 relative ${
                    browserEnabled && notifPermission === 'granted'
                      ? 'bg-sky-500 border-sky-500'
                      : 'bg-transparent border-slate-600'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                  title={browserEnabled ? 'Disable browser notifications' : 'Enable browser notifications'}
                >
                  <span
                    className={`absolute top-0.5 w-3 h-3 rounded-full transition-transform ${
                      browserEnabled && notifPermission === 'granted'
                        ? 'bg-white translate-x-4'
                        : 'bg-slate-500 translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Add rule form */}
            <div className="mb-3 space-y-2 pb-3 border-b border-white/[0.04]">
              <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">New Rule</div>

              <select
                value={formAssetId}
                onChange={(e) => {
                  setFormAssetId(e.target.value);
                  // reset condition to first valid one for new asset type
                  const newAsset = assetOptions.find((a) => a.id === e.target.value);
                  const type = newAsset?.type ?? 'country';
                  setFormCondition(ASSET_CONDITIONS[type][0]);
                }}
                className="w-full text-[11px] bg-black/40 border border-white/[0.07] rounded-lg px-2 py-1.5 text-slate-300 focus:outline-none focus:border-sky-500/40"
              >
                <option value="">Select asset…</option>
                {assetOptions.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>

              <select
                value={formCondition}
                onChange={(e) => setFormCondition(e.target.value as AlertCondition)}
                className="w-full text-[11px] bg-black/40 border border-white/[0.07] rounded-lg px-2 py-1.5 text-slate-300 focus:outline-none focus:border-sky-500/40"
              >
                {availableConditions.map((c) => (
                  <option key={c} value={c}>{CONDITION_LABELS[c]}</option>
                ))}
              </select>

              {NEEDS_THRESHOLD.has(formCondition) && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={formThreshold}
                    onChange={(e) => setFormThreshold(e.target.value)}
                    className="flex-1 text-[11px] bg-black/40 border border-white/[0.07] rounded-lg px-2 py-1.5 text-slate-300 focus:outline-none focus:border-sky-500/40"
                    placeholder="Threshold"
                  />
                  <span className="text-[10px] text-slate-600 whitespace-nowrap">
                    {THRESHOLD_UNIT[formCondition] ?? ''}
                  </span>
                </div>
              )}

              {formError && <p className="text-[10px] text-red-400">{formError}</p>}

              <button
                onClick={handleAddRule}
                className="w-full text-[11px] py-1.5 rounded-lg bg-sky-500/15 border border-sky-500/25 text-sky-400 hover:bg-sky-500/25 transition-colors"
              >
                + Add Rule
              </button>
            </div>

            {/* Rules list */}
            {rules.length === 0 ? (
              <p className="text-[11px] text-slate-600 py-2 text-center">No rules yet.</p>
            ) : (
              <div>
                {rules.map((rule) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    onRemove={() => setRules(removeAlertRule(rule.id))}
                    onToggle={() => setRules(toggleAlertRule(rule.id))}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'log' && (
          <div>
            {firings.length === 0 ? (
              <p className="text-[11px] text-slate-600 py-4 text-center">No alerts fired yet.</p>
            ) : (
              <div className="space-y-2">
                {firings.map((f, i) => (
                  <div key={i} className="py-2 border-b border-white/[0.04] last:border-0">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-[12px] text-slate-300">{f.assetLabel}</span>
                      <span className="text-[10px] text-slate-600 flex-shrink-0">
                        {new Date(f.firedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-[11px] text-amber-400 mt-0.5">
                      {CONDITION_LABELS[f.condition]}
                      {f.threshold !== undefined && ` ${f.threshold}`}
                      {' → '}{f.observedValue.toFixed(0)}
                      {THRESHOLD_UNIT[f.condition] ? ' ' + THRESHOLD_UNIT[f.condition] : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
