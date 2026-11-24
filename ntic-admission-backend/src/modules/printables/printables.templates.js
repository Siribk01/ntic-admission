// src/modules/printables/printables.templates.js
// The {{placeholder}} rules for the editable wording. Pure functions, no database.
//
// A placeholder is written {{name}}. Each template may only use the names listed for it. A misspelt name is refused when the
// template is SAVED (so a letter never goes out with "{{candiateName}}" in it). The values are put in as plain text in a single pass
// and are never read again as placeholders, so a child named "{{x}}" cannot change a letter.

const PLACEHOLDERS = {
  letterhead: [],
  exam_instructions: [],
  offer_letter: ['parentName', 'candidateName', 'applicationNumber', 'campusName', 'categoryName', 'academicSession', 'offerDeadline', 'issueDate'],
};

const TOKEN = /\{\{\s*([A-Za-z]+)\s*\}\}/g;

// Returns a list of problems (empty = fine)
function checkPlaceholders(key, text) {
  const allowed = PLACEHOLDERS[key];
  const problems = [];
  const used = new Set();
  for (const m of text.matchAll(TOKEN)) used.add(m[1]);
  for (const name of used) {
    if (!allowed.includes(name)) {
      problems.push(allowed.length
        ? `{{${name}}} is not a known placeholder. You can use: ${allowed.map((n) => `{{${n}}}`).join(', ')}`
        : `{{${name}}} cannot be used here. This text has no placeholders`);
    }
  }
  // Anything with braces left after removing the valid ones is a typo such as "{{candidateName}" or "{candidateName}}"
  if (/\{\{|\}\}/.test(text.replace(TOKEN, ''))) problems.push('There is a stray "{{" or "}}". Placeholders look like {{candidateName}}');
  return problems;
}

function fill(text, values) {
  return text.replace(TOKEN, (_, name) => (Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : ''));
}

// Removes characters that can confuse a PDF or a reader (control characters), keeps line breaks
function clean(text) {
  return String(text).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '');
}

// "one\n\ntwo\nthree" -> ["one", "two\nthree"]
const paragraphs = (text) => clean(text).split(/\n[ \t]*\n/).map((p) => p.trim()).filter(Boolean);
const lines = (text) => clean(text).split('\n').map((l) => l.trim()).filter(Boolean);

module.exports = { PLACEHOLDERS, checkPlaceholders, fill, clean, paragraphs, lines };
