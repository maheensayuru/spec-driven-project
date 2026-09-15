'use client';

import React from 'react';
import { TeamSettings } from '../../../../components/organizations/TeamSettings';

export default function TeamSettingsPage() {
  return (
    <div className="space-y-6">
      <header className="page-header">
        <div>
          <h1 className="page-title">Team &amp; roles</h1>
          <p className="page-description">
            Manage organization access and understand each role&apos;s restrictions.
          </p>
        </div>
      </header>
      <TeamSettings />
    </div>
  );
}
