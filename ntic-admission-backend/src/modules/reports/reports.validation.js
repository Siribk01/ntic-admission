// src/modules/reports/reports.validation.js
const { z } = require('zod');

const id = (label) => z.uuid(`${label} must be a valid id`);
const day = (label) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a date like 2026-11-30`).refine((d) => !Number.isNaN(Date.parse(`${d}T12:00:00Z`)), `${label} is not a real date`);

const dashboardSchema = z.object({ cycleId: id('cycleId').optional(), campusId: id('campusId').optional() }).strict();

const STATUSES = ['submitted', 'under_review', 'information_required', 'decision_pending', 'offered', 'waitlisted', 'rejected', 'withdrawn', 'closed'];

// Filters shared by every export. `status` means the application status for applications and the payment status for payments.
const exportFilters = z.object({
  cycleId: id('cycleId').optional(),
  campusId: id('campusId').optional(),
  status: z.string().optional(),
  from: day('from').optional(),
  to: day('to').optional(),
}).strict();

function exportSchema(dataset) {
  return exportFilters.superRefine((d, ctx) => {
    const add = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (d.status !== undefined) {
      if (dataset === 'applications' && !STATUSES.includes(d.status)) add('status', `status must be one of: ${STATUSES.join(', ')}`);
      if (dataset === 'payments' && !['successful', 'reversed'].includes(d.status)) add('status', 'status must be successful or reversed');
      if (dataset === 'exam-results' && !['draft', 'reviewed'].includes(d.status)) add('status', 'status must be draft or reviewed');
    }
    if (d.from && d.to && d.from > d.to) add('to', 'to cannot be before from');
  });
}

module.exports = { dashboardSchema, exportSchema };
