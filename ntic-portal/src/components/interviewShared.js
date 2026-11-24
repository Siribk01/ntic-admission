// Labels and small helpers shared by the interview screens.
export const PLATFORM_LABEL = { google_meet: 'Google Meet', microsoft_teams: 'Microsoft Teams', zoom: 'Zoom', phone: 'Phone call', in_person: 'In person', other: 'Other online' };
export const INTERVIEW_STATUS_LABEL = { not_scheduled: 'Not scheduled', scheduled: 'Scheduled', completed: 'Completed', absent: 'Absent', cancelled: 'Cancelled' };
export const SCORECARD_LABEL = { not_started: 'Not started', draft: 'Draft', submitted: 'Submitted', not_submitted: 'Not submitted' };
export const RECOMMENDATION_LABEL = { strongly_recommend: 'Strongly recommend', recommend: 'Recommend', neutral: 'Neutral', not_recommended: 'Not recommended' };
export const whenLagos = (iso) => new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' }).format(new Date(iso));
export const HISTORY_LABEL = { scheduled: 'Scheduled', rescheduled: 'Rescheduled', cancelled: 'Cancelled', completed: 'Marked completed', absent: 'Marked absent' };

const TONE = { scheduled: 'bg-blue-50 text-blue-800', completed: 'bg-green-50 text-green-800', absent: 'bg-amber-50 text-amber-800', cancelled: 'bg-slate-100 text-slate-600', not_scheduled: 'bg-slate-100 text-slate-600' };
export const interviewTone = (s) => TONE[s] || TONE.not_scheduled;

// The Nigeria-time date and time of an ISO instant, as the two form inputs want them
export function lagosParts(iso) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const g = (t) => p.find((x) => x.type === t).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
}
