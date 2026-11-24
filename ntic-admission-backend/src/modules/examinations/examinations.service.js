// src/modules/examinations/examinations.service.js
// Exam slots, and scheduling applicants into them.

const repo = require('./examinations.repository');
const paymentsRepo = require('../payments/payments.repository');
const auditService = require('../audit/audit.service');
const notifications = require('../notifications/notifications.service');
const { withTransaction } = require('../../db/pool');
const { validate } = require('../../utils/validate');
const { assertUuid } = require('../../utils/ids');
const { getCampusScope } = require('../../utils/campusScope');
const AppError = require('../../utils/AppError');
const { LIVE_STATUSES } = require('../../constants/applicationStatus');
const {
  createSlotSchema, updateSlotSchema, listSlotsSchema, scheduleSchema, cancelSchema,
} = require('./examinations.validation');

const auditEvent = (context, action, resourceType, resourceId, metadata) => ({
  actor: context.actor, action, resourceType, resourceId, ip: context.ip, userAgent: context.userAgent, metadata,
});

// Parents may move their own exam up to this many hours before it starts. After that, only staff can.
// (Proposed default; to be confirmed with NTIC.)
const PARENT_CHANGE_CUTOFF_HOURS = 48;

// A campus officer only works with their own campuses. Other campuses are reported as "not found".
const inScope = (scope, campusId) => !scope || scope.includes(campusId);

// ===================== slots =====================

async function createSlot(input, context) {
  const data = validate(createSlotSchema, input);
  const scope = await getCampusScope(context.actor);
  if (!inScope(scope, data.campusId)) throw AppError.forbidden('You can only create slots for your own campuses');

  try {
    const id = await withTransaction(async (client) => {
      const slotId = await repo.insertSlot({ ...data, createdBy: context.actor.id }, client);
      await auditService.record(
        auditEvent(context, 'exam_slot.create', 'exam_slot', slotId, {
          cycleId: data.cycleId, campusId: data.campusId, startsAt: data.startsAt, capacity: data.capacity,
        }),
        { client }
      );
      return slotId;
    });
    return repo.findSlotById(id);
  } catch (err) {
    // 23503 = a foreign key points at something that does not exist (unknown cycle or campus)
    if (err.code === '23503') {
      throw AppError.validation([{ field: 'cycleId', message: 'The cycle or campus does not exist' }]);
    }
    throw err;
  }
}

async function listSlots(query, actor) {
  const filters = validate(listSlotsSchema, query);
  return repo.listSlots({ ...filters, campusScope: await getCampusScope(actor) });
}

async function requireSlotInScope(slotId, actor) {
  assertUuid(slotId, 'Slot id');
  const slot = await repo.findSlotById(slotId);
  if (!slot || !inScope(await getCampusScope(actor), slot.campusId)) throw AppError.notFound('Exam slot not found');
  return slot;
}

async function getSlot(slotId, actor) {
  return requireSlotInScope(slotId, actor);
}

async function updateSlot(slotId, input, context) {
  const data = validate(updateSlotSchema, input);
  await requireSlotInScope(slotId, context.actor);

  await withTransaction(async (client) => {
    const [locked] = await repo.lockSlots([slotId], client);
    if (!locked) throw AppError.notFound('Exam slot not found');
    if (data.capacity !== undefined) {
      const booked = await repo.countScheduled(slotId, client);
      if (data.capacity < booked) {
        throw new AppError(`${booked} candidates are already booked. Capacity cannot be lowered below that.`, 409, 'INVALID_STATE');
      }
    }
    await repo.updateSlot(slotId, data, client);
    await auditService.record(auditEvent(context, 'exam_slot.update', 'exam_slot', slotId, data), { client });
  });
  return repo.findSlotById(slotId);
}

// ===================== scheduling =====================

async function present(applicationId, { withHistory = false } = {}) {
  const exam = await repo.findExamByApplication(applicationId);
  if (!exam) return null;
  return withHistory ? { ...exam, history: await repo.listHistory(exam.id) } : exam;
}

// Books the application into a slot. If it is already booked elsewhere, moves it.
// "actor" is either staff (campus scope applies, a reason is needed to move someone) or the parent who owns
// the application (ownership applies, only the application's campus or preferred exam centre, and a cutoff).
async function bookSlot(applicationId, input, context, { asParent }) {
  assertUuid(applicationId, 'Application id');
  const data = validate(scheduleSchema, input);
  const scope = asParent ? null : await getCampusScope(context.actor);

  await withTransaction(async (client) => {
    // Lock order is always: application, then its exam row, then slots (by id). Same order everywhere = no deadlocks.
    const application = await repo.lockApplication(applicationId, client);
    if (!application) throw AppError.notFound('Application not found');
    if (asParent ? application.parentUserId !== context.actor.id : !inScope(scope, application.campusId)) {
      throw AppError.notFound('Application not found');
    }

    if (!LIVE_STATUSES.includes(application.status)) {
      throw new AppError('Only submitted applications can be scheduled for an exam', 409, 'INVALID_STATE');
    }
    // BR-010: the exam number is issued at the first confirmed booking, and that needs the fee paid
    const paid = await paymentsRepo.sumSuccessful(application.id, client);
    if (paid < application.feeAmountMinor) {
      throw new AppError('The application fee must be paid before an exam can be scheduled', 409, 'PAYMENT_REQUIRED');
    }

    const exam = await repo.lockExamByApplication(applicationId, client);
    // A candidate who has already sat the exam cannot be booked again (someone marked absent, or cancelled, can)
    if (exam && exam.status === 'completed') {
      throw new AppError('This candidate has already sat the exam', 409, 'INVALID_STATE');
    }
    const current = exam && exam.status === 'scheduled' ? exam : null;

    const slotIds = [...new Set([data.slotId, current && current.slotId].filter(Boolean))];
    const slots = await repo.lockSlots(slotIds, client);
    const target = slots.find((s) => s.id === data.slotId);
    const currentSlot = current ? slots.find((s) => s.id === current.slotId) : null;

    const campusAllowed = asParent
      ? [application.campusId, application.preferredExamCampusId].filter(Boolean).includes(target && target.campusId)
      : inScope(scope, target && target.campusId);
    if (!target || !campusAllowed) throw AppError.notFound('Exam slot not found');

    if (asParent && currentSlot) {
      const hoursLeft = (new Date(currentSlot.startsAt) - Date.now()) / 36e5;
      if (hoursLeft < PARENT_CHANGE_CUTOFF_HOURS) {
        throw new AppError(
          `Your exam is less than ${PARENT_CHANGE_CUTOFF_HOURS} hours away, so it can no longer be changed online. Please contact NTIC.`,
          409,
          'CHANGE_CLOSED'
        );
      }
    }

    if (target.cycleId !== application.cycleId) {
      throw AppError.validation([{ field: 'slotId', message: 'This slot belongs to a different admission cycle' }]);
    }
    if (target.status !== 'open') throw new AppError('This slot is closed', 409, 'SLOT_CLOSED');
    if (new Date(target.startsAt) <= new Date()) throw new AppError('This slot has already started', 409, 'SLOT_PAST');

    if (current && current.slotId === target.id) {
      throw new AppError('The applicant is already booked in this slot', 409, 'INVALID_STATE');
    }
    // Staff must say why they move someone. A parent moving their own child's exam needs no reason.
    const reason = data.reason || (asParent && current ? 'Changed by parent' : undefined);
    if (current && !reason) {
      throw AppError.validation([{ field: 'reason', message: 'A reason is required to reschedule' }]);
    }

    // The seat check. The slot row is locked, so nobody else can be counting at the same moment.
    const taken = await repo.countScheduled(target.id, client);
    if (taken >= target.capacity) throw new AppError('This slot is full', 409, 'SLOT_FULL');

    let examId;
    let examNumber;
    if (exam) {
      examId = exam.id; // keeps the exam number it already has
      examNumber = exam.examNumber;
      await repo.setExamSlot(examId, target.id, 'scheduled', client);
    } else {
      examNumber = await repo.issueExamNumber(application.campusId, application.cycleId, client);
      examId = await repo.insertExam({ applicationId, examNumber, slotId: target.id }, client);
    }

    const action = current ? 'rescheduled' : 'scheduled';
    await repo.addHistory(
      { examId, action, fromSlotId: current ? current.slotId : null, toSlotId: target.id, reason, actorId: context.actor.id },
      client
    );
    const slot = await repo.findSlotById(target.id, client);
    await notifications.queueForApplication(client, applicationId, current ? 'exam_rescheduled' : 'exam_scheduled', {
      examNumber, startsAt: slot.startsAt, venue: slot.venue, campusName: slot.campusName,
    });
    await auditService.record(
      auditEvent(context, `exam.${action === 'scheduled' ? 'schedule' : 'reschedule'}`, 'examination', examId, {
        applicationNumber: application.applicationNumber, slotId: target.id,
        fromSlotId: current ? current.slotId : null, bookedBy: asParent ? 'parent' : 'staff',
      }),
      { client }
    );
  });

  return present(applicationId, { withHistory: !asParent });
}

const scheduleExam = (applicationId, input, context) => bookSlot(applicationId, input, context, { asParent: false });
const scheduleExamAsParent = (applicationId, input, context) => bookSlot(applicationId, input, context, { asParent: true });

// The slots a parent can choose from: this cycle, at the campus they applied to (or their preferred centre),
// open, in the future, with seats left. Only after the fee is paid.
async function listSlotsForParent(applicationId, parent) {
  assertUuid(applicationId, 'Application id');
  const basics = await repo.findApplicationBasics(applicationId);
  if (!basics || basics.parentUserId !== parent.id) throw AppError.notFound('Application not found');
  if (!LIVE_STATUSES.includes(basics.status)) {
    throw new AppError('Submit your application before choosing an exam date', 409, 'INVALID_STATE');
  }
  const feeStatus = await repo.getFeeAndPaid(applicationId);
  if (feeStatus.paid < feeStatus.fee) {
    throw new AppError('Please pay the application fee before choosing an exam date', 409, 'PAYMENT_REQUIRED');
  }
  const campusIds = [basics.campusId, basics.preferredExamCampusId].filter(Boolean);
  return repo.listBookableSlots({ cycleId: basics.cycleId, campusIds });
}

async function cancelExam(applicationId, input, context) {
  assertUuid(applicationId, 'Application id');
  const { reason } = validate(cancelSchema, input);
  const scope = await getCampusScope(context.actor);

  await withTransaction(async (client) => {
    const application = await repo.lockApplication(applicationId, client);
    if (!application || !inScope(scope, application.campusId)) throw AppError.notFound('Application not found');

    const exam = await repo.lockExamByApplication(applicationId, client);
    if (!exam || exam.status !== 'scheduled') {
      throw new AppError('There is no scheduled exam to cancel', 409, 'INVALID_STATE');
    }
    await repo.setExamSlot(exam.id, null, 'cancelled', client); // frees the seat; the exam number stays with this applicant
    await repo.addHistory({ examId: exam.id, action: 'cancelled', fromSlotId: exam.slotId, reason, actorId: context.actor.id }, client);
    await notifications.queueForApplication(client, applicationId, 'exam_cancelled', { examNumber: exam.examNumber });
    await auditService.record(
      auditEvent(context, 'exam.cancel', 'examination', exam.id, { applicationNumber: application.applicationNumber, reason }),
      { client }
    );
  });
  return present(applicationId, { withHistory: true });
}

async function getExamForStaff(applicationId, actor) {
  assertUuid(applicationId, 'Application id');
  const basics = await repo.findApplicationBasics(applicationId);
  if (!basics || !inScope(await getCampusScope(actor), basics.campusId)) throw AppError.notFound('Application not found');
  return (await present(applicationId, { withHistory: true })) || notScheduled(basics);
}

// What a parent sees: preferences are requests, not bookings (BR-005)
function notScheduled(basics) {
  return {
    status: 'not_scheduled',
    note: 'Your preferred exam date and time are only requests. Once your fee is paid you can choose an available exam date.',
    preferred: {
      date: basics.preferredExamDate,
      time: basics.preferredExamTime,
      campusId: basics.preferredExamCampusId,
    },
  };
}

async function getExamForParent(applicationId, parent) {
  assertUuid(applicationId, 'Application id');
  const basics = await repo.findApplicationBasics(applicationId);
  if (!basics || basics.parentUserId !== parent.id) throw AppError.notFound('Application not found');
  return (await present(applicationId)) || notScheduled(basics);
}

module.exports = {
  createSlot, listSlots, getSlot, updateSlot, scheduleExam, scheduleExamAsParent, listSlotsForParent,
  cancelExam, getExamForStaff, getExamForParent,
};
