// src/modules/options/options.service.js
// One call that gives the application form everything it must offer in its drop-downs.
const repo = require('./options.repository');

// Where parents send the application fee. Set in the server's .env; if any of the three main values is missing, nothing is shown.
function bankDetails() {
  const { BANK_NAME, BANK_ACCOUNT_NAME, BANK_ACCOUNT_NUMBER, BANK_INSTRUCTIONS } = process.env;
  if (!BANK_NAME || !BANK_ACCOUNT_NAME || !BANK_ACCOUNT_NUMBER) return null;
  return { bankName: BANK_NAME, accountName: BANK_ACCOUNT_NAME, accountNumber: BANK_ACCOUNT_NUMBER, instructions: BANK_INSTRUCTIONS || null };
}

async function getOptions() {
  const [states, campuses, cycles, rules] = await Promise.all([repo.states(), repo.campuses(), repo.openCycles(), repo.feeRules()]);
  const categories = cycles.length ? await repo.cycleCategories(cycles.map((c) => c.id)) : [];
  return {
    states,
    campuses,
    cycles: cycles.map((c) => ({ ...c, categories: categories.filter((x) => x.cycleId === c.id).map(({ id, name }) => ({ id, name })) })),
    // The parent sees the price before choosing. The backend still works the real fee out again when the application is submitted.
    bank: bankDetails(),
    fees: rules.map((r) => ({ ...r, currency: 'NGN' })),
  };
}

module.exports = { getOptions };
