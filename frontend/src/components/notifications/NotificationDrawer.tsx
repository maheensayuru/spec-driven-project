'use client';

import React, { useState, useEffect } from 'react';
import { RiskLevel } from '@renewalradar/shared';

export interface AlertItem {
  id: string;
  obligationId: string;
  obligationTitle: string;
  milestone: string;
  triggerDate: string;
  priority: RiskLevel;
  acknowledgedAt?: string | null;
  createdAt: string;
}

export interface NotificationDrawerProps {
  initialAlerts?: AlertItem[];
  onTriggerScan?: () => Promise<void>;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  initialAlerts,
  onTriggerScan,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>(
    initialAlerts ?? [
      {
        id: 'alt-1',
        obligationId: 'obl-3',
        obligationTitle: 'Commercial Fleet Insurance',
        milestone: '7_day',
        triggerDate: '2026-09-18',
        priority: 'critical',
        acknowledgedAt: null,
        createdAt: '2026-09-05T07:00:00Z',
      },
      {
        id: 'alt-2',
        obligationId: 'obl-1',
        obligationTitle: 'Google Workspace Enterprise',
        milestone: '30_day',
        triggerDate: '2026-09-16',
        priority: 'high',
        acknowledgedAt: null,
        createdAt: '2026-09-05T07:00:00Z',
      },
    ],
  );
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const unreadCount = alerts.filter((a) => !a.acknowledgedAt).length;

  const handleAcknowledge = (alertId: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, acknowledgedAt: new Date().toISOString() } : a)),
    );
  };

  const handleManualScan = async () => {
    setIsScanning(true);
    setScanMessage(null);
    try {
      if (onTriggerScan) {
        await onTriggerScan();
      }
      // Simulate scan result
      setScanMessage('Scanner completed: 3 obligations scanned, 0 duplicate alerts.');
    } catch {
      setScanMessage('Scanner execution failed.');
    } finally {
      setIsScanning(false);
    }
  };

  const getPriorityBadgeClass = (priority: RiskLevel) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'low':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="relative">
      {/* Notification Bell Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-100"
        aria-label="Notifications"
      >
        <span className="text-lg">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Drawer Overlay & Content */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 max-w-[90vw] bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden animate-in fade-in-50 duration-150">
          {/* Header */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Deadline Alerts</h3>
              <p className="text-xs text-slate-500">Autonomous monitoring feed</p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleManualScan}
                disabled={isScanning}
                className="px-2.5 py-1 text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-md transition-colors disabled:opacity-50"
                title="Trigger immediate deadline scanner run"
              >
                {isScanning ? 'Scanning...' : '⚡ Scan Now'}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold p-1"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Scan feedback alert */}
          {scanMessage && (
            <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100 text-[11px] text-indigo-900 font-medium">
              {scanMessage}
            </div>
          )}

          {/* Alert List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {alerts.length === 0 ? (
              <div className="p-8 text-center text-slate-500 space-y-2">
                <div className="text-2xl">✨</div>
                <p className="text-xs font-medium">No active deadline alerts.</p>
                <p className="text-[11px] text-slate-400">
                  All contracts and obligations are outside critical notice windows.
                </p>
              </div>
            ) : (
              alerts.map((item) => (
                <div
                  key={item.id}
                  className={`p-4 transition-colors ${
                    item.acknowledgedAt ? 'bg-white opacity-60' : 'bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full border ${getPriorityBadgeClass(
                        item.priority,
                      )}`}
                    >
                      {item.priority}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Milestone: {item.milestone.replace('_', ' ')}
                    </span>
                  </div>

                  <h4 className="text-xs font-bold text-slate-900 mt-1.5">
                    {item.obligationTitle}
                  </h4>

                  <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                    <span>Due: {item.triggerDate}</span>
                    {!item.acknowledgedAt ? (
                      <button
                        onClick={() => handleAcknowledge(item.id)}
                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                      >
                        Acknowledge
                      </button>
                    ) : (
                      <span className="text-[10px] text-emerald-600 font-medium">
                        ✓ Acknowledged
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-3 bg-slate-50 border-t border-slate-100 text-center">
            <span className="text-[11px] text-slate-400">
              Idempotent daily scanning at 02:00 UTC
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
