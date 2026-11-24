// src/pages/staff/Setup.jsx
// Central admin only: everything that used to need SQL. Sessions, classes, campuses, fees, staff accounts.
import { useState } from 'react';
import Campuses from './setup/Campuses.jsx';
import DocumentTypes from './setup/DocumentTypes.jsx';
import Rules from './setup/Rules.jsx';
import Emails from './setup/Emails.jsx';
import Criteria from './setup/Criteria.jsx';
import Classes from './setup/Classes.jsx';
import Fees from './setup/Fees.jsx';
import Sessions from './setup/Sessions.jsx';
import StaffAccounts from './setup/StaffAccounts.jsx';

const TABS = [['sessions', 'Sessions', Sessions], ['classes', 'Classes', Classes], ['campuses', 'Campuses', Campuses], ['fees', 'Fees', Fees], ['staff', 'Staff accounts', StaffAccounts], ['criteria', 'Interview scorecard', Criteria], ['documents', 'Documents', DocumentTypes], ['emails', 'Emails', Emails], ['rules', 'Rules and reminders', Rules]];

export default function Setup() {
  const [tab, setTab] = useState('sessions');
  const Current = TABS.find(([k]) => k === tab)[2];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-navy">Setup</h1>
      <div className="flex flex-wrap gap-1">{TABS.map(([k, l]) => (
        <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === k ? 'bg-brand text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'}`}>{l}</button>))}</div>
      <Current />
    </div>
  );
}
