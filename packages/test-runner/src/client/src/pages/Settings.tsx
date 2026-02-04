import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';

export const Settings: React.FC = () => {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-2">Settings</h1>
        <p className="text-muted-foreground">
          Configure your test runner preferences
        </p>
      </div>

      <div className="text-center py-16 text-muted-foreground">
        <SettingsIcon className="h-16 w-16 mx-auto mb-4 opacity-50" />
        <h3 className="text-xl font-semibold mb-2">Settings</h3>
        <p>Configuration options coming soon...</p>
      </div>
    </div>
  );
};