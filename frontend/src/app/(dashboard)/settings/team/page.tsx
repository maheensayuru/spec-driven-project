'use client';

import React from 'react';
import { TeamSettings } from '../../../../components/organizations/TeamSettings';

export default function TeamSettingsPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <TeamSettings />
      </div>
    </div>
  );
}
