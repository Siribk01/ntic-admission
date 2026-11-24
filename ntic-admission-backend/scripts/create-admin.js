// scripts/create-admin.js
// Creates a central administrator from the command line. This is how the FIRST admin is made,
// because the API only lets an existing administrator create staff.
//
//   npm run create-admin
//   npm run create-admin -- --email admin@school.org --first-name Ada --last-name Okafor
//
// By default it refuses to run if an active administrator already exists.
// Add --allow-additional to create another one (for example, if the only admin is locked out).

const readline = require('readline');
const { parseArgs } = require('node:util');
const { closePool } = require('../src/db/pool');
const usersRepo = require('../src/modules/users/users.repository');
const staffService = require('../src/modules/staff/staff.service');
const { ROLES } = require('../src/constants/roles');

// Ask a question and show what the person types
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Ask a question but do NOT show what is typed (for passwords)
function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let value = '';
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          return resolve(value);
        }
        if (ch === '\u0003') {           // Ctrl + C
          process.stdout.write('\n');
          process.exit(130);
        }
        if (ch === '\u007f' || ch === '\b') {
          value = value.slice(0, -1);    // Backspace
        } else {
          value += ch;
        }
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      'first-name': { type: 'string' },
      'last-name': { type: 'string' },
      'allow-additional': { type: 'boolean' },
    },
  });

  if (!process.stdin.isTTY) {
    throw new Error('Run this in a normal terminal window so the password can be typed privately.');
  }

  // Guard: this is for the FIRST administrator
  const existing = await usersRepo.countActiveByRole(ROLES.CENTRAL_ADMIN);
  if (existing > 0 && !values['allow-additional']) {
    console.log(
      `An active administrator already exists (${existing}).\n` +
        'Create further staff accounts through the API (POST /api/v1/admin/staff).\n' +
        'To create another administrator from here anyway, add --allow-additional.'
    );
    return;
  }

  const email = values.email || (await ask('Email: '));
  const firstName = values['first-name'] || (await ask('First name: '));
  const lastName = values['last-name'] || (await ask('Last name: '));
  const password = await askHidden('Password (hidden): ');
  const confirm = await askHidden('Confirm password: ');

  if (password !== confirm) {
    throw new Error('Passwords do not match. Nothing was created.');
  }

  // Same validation, hashing and audit logging as the API route, so the rules are identical
  const admin = await staffService.createStaff(
    { email, password, firstName, lastName, role: ROLES.CENTRAL_ADMIN },
    { actor: null, userAgent: 'create-admin CLI' }
  );

  console.log(`\nAdministrator created: ${admin.email} (id ${admin.id})`);
  console.log('Sign in with POST /api/v1/auth/login.');
}

main()
  .catch((err) => {
    console.error(`\nFailed: ${err.message}`);
    if (Array.isArray(err.details)) {
      for (const d of err.details) console.error(`  - ${d.field}: ${d.message}`);
    }
    process.exitCode = 1;
  })
  .finally(() => closePool());