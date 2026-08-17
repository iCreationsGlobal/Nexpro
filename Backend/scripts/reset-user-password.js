#!/usr/bin/env node
/**
 * Reset an existing user's password (hashed via User model bcrypt hooks).
 *
 * Usage (from Backend/):
 *   node scripts/reset-user-password.js --email user@example.com --password 'NewPass123!' --dry-run
 *   node scripts/reset-user-password.js --email user@example.com --password 'NewPass123!'
 *   node scripts/reset-user-password.js --search dagadu
 *   node scripts/reset-user-password.js --search cn.com
 *
 * VPS:
 *   ssh root@62.169.22.3 'cd ~/nexpro/Backend && node scripts/reset-user-password.js --search dagadu'
 *   ssh root@62.169.22.3 'cd ~/nexpro/Backend && node scripts/reset-user-password.js --email user@example.com --password '\''NewPass123!'\'' --dry-run'
 *   ssh root@62.169.22.3 'cd ~/nexpro/Backend && node scripts/reset-user-password.js --email user@example.com --password '\''NewPass123!'\'''
 *
 * Notes:
 *   - Login accounts live in `users` (+ `user_tenants` membership).
 *   - HR "Employees" (job titles like "Preinvoice Officer") live in `employees`
 *     and do NOT get a password unless linked/invited as a User.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Op, col, fn, where } = require('sequelize');
const { sequelize, testConnection } = require('../config/database');
const User = require('../models/User');
const Employee = require('../models/Employee');

const getArgValue = (name) => {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) {
    return process.argv[index + 1];
  }
  return null;
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const likePattern = (value) => `%${String(value || '').trim()}%`;

const printUsage = () => {
  console.error('Usage:');
  console.error('  node scripts/reset-user-password.js --email <address> --password <newPassword> [--dry-run]');
  console.error('  node scripts/reset-user-password.js --search <query>');
  console.error("Example: node scripts/reset-user-password.js --email user@example.com --password 'NewPass123!' --dry-run");
  console.error('Example: node scripts/reset-user-password.js --search dagadu');
};

const printUserRow = (user, prefix = '  ') => {
  console.log(`${prefix}ID:       ${user.id}`);
  console.log(`${prefix}Name:     ${user.name}`);
  console.log(`${prefix}Email:    ${user.email}`);
  console.log(`${prefix}Role:     ${user.role}`);
  console.log(`${prefix}Active:   ${user.isActive}`);
  console.log(
    `${prefix}Locked:   ${typeof user.isLocked === 'function' ? user.isLocked() : Boolean(user.lockoutUntil)}`
  );
};

const printEmployeeRow = (employee, prefix = '  ') => {
  const fullName = [employee.firstName, employee.middleName, employee.lastName]
    .filter(Boolean)
    .join(' ');
  console.log(`${prefix}ID:         ${employee.id}`);
  console.log(`${prefix}Name:       ${fullName}`);
  console.log(`${prefix}Email:      ${employee.email || '(none)'}`);
  console.log(`${prefix}Job title:  ${employee.jobTitle || '(none)'}`);
  console.log(`${prefix}Status:     ${employee.status}`);
  console.log(`${prefix}Tenant ID:  ${employee.tenantId}`);
  console.log(`${prefix}Linked userId: ${employee.userId || '(none — no login account)'}`);
};

/**
 * Search users + employees by partial name/email/job title.
 * @param {string} query
 */
const searchAccounts = async (query) => {
  const pattern = likePattern(query);
  console.log(`Searching users and employees for: ${query}`);
  console.log('');

  const users = await User.unscoped().findAll({
    where: {
      [Op.or]: [
        { email: { [Op.iLike]: pattern } },
        { name: { [Op.iLike]: pattern } },
      ],
    },
    attributes: ['id', 'name', 'email', 'role', 'isActive', 'lockoutUntil', 'createdAt'],
    order: [['createdAt', 'DESC']],
    limit: 50,
  });

  const employees = await Employee.findAll({
    where: {
      [Op.or]: [
        { email: { [Op.iLike]: pattern } },
        { firstName: { [Op.iLike]: pattern } },
        { lastName: { [Op.iLike]: pattern } },
        { preferredName: { [Op.iLike]: pattern } },
        { jobTitle: { [Op.iLike]: pattern } },
      ],
    },
    attributes: [
      'id',
      'tenantId',
      'userId',
      'firstName',
      'middleName',
      'lastName',
      'preferredName',
      'email',
      'jobTitle',
      'status',
      'isActive',
      'createdAt',
    ],
    order: [['createdAt', 'DESC']],
    limit: 50,
  });

  console.log(`Users matching (${users.length}):`);
  if (users.length === 0) {
    console.log('  (none)');
  } else {
    users.forEach((user, index) => {
      console.log(`\n${index + 1}. ${user.name} <${user.email}>`);
      printUserRow(user);
    });
  }

  console.log('');
  console.log(`Employees matching (${employees.length}):`);
  if (employees.length === 0) {
    console.log('  (none)');
  } else {
    employees.forEach((employee, index) => {
      const fullName = [employee.firstName, employee.middleName, employee.lastName]
        .filter(Boolean)
        .join(' ');
      console.log(`\n${index + 1}. ${fullName} <${employee.email || 'no email'}> — ${employee.jobTitle || 'no title'}`);
      printEmployeeRow(employee);
    });
  }

  console.log('');
  console.log('Interpretation:');
  console.log('  - Password reset only works for rows in `users` (login accounts).');
  console.log('  - Employees with linked userId=null cannot log in until invited via Users/Team.');
  console.log('  - Job titles like "Preinvoice Officer" are Employee fields, not User.role');
  console.log('    (User.role is only: admin | manager | staff | driver).');
};

/**
 * When exact email miss: show similar users + any employee with that email/name fragment.
 * @param {string} email
 */
const printNotFoundDiagnostics = async (email) => {
  const localPart = email.split('@')[0] || email;
  const domain = email.includes('@') ? email.split('@')[1] : '';
  const nameGuess = localPart.replace(/[._0-9]+/g, ' ').trim();

  const similarUsers = await User.unscoped().findAll({
    where: {
      [Op.or]: [
        { email: { [Op.iLike]: likePattern(localPart) } },
        ...(domain ? [{ email: { [Op.iLike]: likePattern(domain) } }] : []),
        ...(nameGuess ? [{ name: { [Op.iLike]: likePattern(nameGuess) } }] : []),
      ],
    },
    attributes: ['id', 'name', 'email', 'role', 'isActive'],
    limit: 20,
  });

  const matchingEmployees = await Employee.findAll({
    where: {
      [Op.or]: [
        where(fn('lower', col('email')), email),
        { email: { [Op.iLike]: likePattern(localPart) } },
        { lastName: { [Op.iLike]: likePattern(localPart) } },
        ...(nameGuess
          ? [
              { firstName: { [Op.iLike]: likePattern(nameGuess.split(/\s+/)[0] || nameGuess) } },
              { lastName: { [Op.iLike]: likePattern(nameGuess.split(/\s+/).slice(-1)[0] || nameGuess) } },
            ]
          : []),
        { jobTitle: { [Op.iLike]: '%preinvoice%' } },
      ],
    },
    attributes: [
      'id',
      'tenantId',
      'userId',
      'firstName',
      'middleName',
      'lastName',
      'email',
      'jobTitle',
      'status',
    ],
    limit: 20,
  });

  console.log('');
  console.log('Diagnostics (why "no user found" is common):');
  console.log('  1) Typo / different email on the login User row');
  console.log('  2) Only an Employee (HR) record exists — no users row / no invite accepted');
  console.log('  3) Wrong DB / env (script uses Backend/.env DATABASE_URL)');
  console.log('');

  if (similarUsers.length > 0) {
    console.log(`Similar users (${similarUsers.length}):`);
    similarUsers.forEach((user) => {
      console.log(`  - ${user.name} <${user.email}> role=${user.role} active=${user.isActive} id=${user.id}`);
    });
  } else {
    console.log('Similar users: (none)');
  }

  console.log('');
  if (matchingEmployees.length > 0) {
    console.log(`Matching employees (${matchingEmployees.length}):`);
    matchingEmployees.forEach((employee) => {
      const fullName = [employee.firstName, employee.middleName, employee.lastName]
        .filter(Boolean)
        .join(' ');
      console.log(
        `  - ${fullName} <${employee.email || 'no email'}> title="${employee.jobTitle || ''}" ` +
          `status=${employee.status} userId=${employee.userId || 'NULL'} tenant=${employee.tenantId}`
      );
    });
    console.log('');
    console.log('If Jennifer only appears under Employees with userId=NULL:');
    console.log('  → Invite her from Users/Team (or create User + user_tenants), then re-run this script.');
  } else {
    console.log('Matching employees: (none)');
    console.log('Try: node scripts/reset-user-password.js --search dagadu');
  }
};

const resetUserPassword = async () => {
  const searchQuery = getArgValue('--search');
  const email = normalizeEmail(getArgValue('--email'));
  const newPassword = getArgValue('--password');
  const isDryRun = process.argv.includes('--dry-run');

  if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL is not set. Add it to Backend/.env or export it before running.');
    process.exit(1);
  }

  await testConnection();

  if (searchQuery) {
    await searchAccounts(searchQuery);
    return;
  }

  if (!email) {
    console.error('Error: --email is required (or use --search <query>).');
    printUsage();
    process.exit(1);
  }

  if (!newPassword) {
    console.error('Error: --password is required when resetting.');
    printUsage();
    process.exit(1);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error(`Error: invalid email address "${email}".`);
    process.exit(1);
  }

  if (String(newPassword).length < 6) {
    console.error('Error: --password must be at least 6 characters.');
    process.exit(1);
  }

  console.log(isDryRun ? 'Dry run: looking up user for password reset' : 'Resetting user password');
  console.log(`Email: ${email}`);
  console.log(`Password length: ${String(newPassword).length}`);

  const user = await User.unscoped().findOne({
    where: where(fn('lower', col('email')), email),
  });

  if (!user) {
    console.log(`No user found with email ${email}. No changes were made.`);
    await printNotFoundDiagnostics(email);
    return;
  }

  console.log('');
  console.log('User found:');
  printUserRow(user);

  if (isDryRun) {
    console.log('');
    console.log('Dry run complete. No database changes were made.');
    return;
  }

  // Model beforeUpdate hook hashes with bcrypt (BCRYPT_ROUNDS or 10).
  user.password = newPassword;
  if (Object.prototype.hasOwnProperty.call(user, 'failedLoginAttempts')) {
    user.failedLoginAttempts = 0;
  }
  if (Object.prototype.hasOwnProperty.call(user, 'lockoutUntil')) {
    user.lockoutUntil = null;
  }
  await user.save();

  console.log('');
  console.log('Password updated successfully.');
  console.log(`  User ID: ${user.id}`);
  console.log(`  Name:    ${user.name}`);
  console.log(`  Email:   ${user.email}`);
  console.log('  Lockout/failed-login counters cleared (when present).');
};

resetUserPassword()
  .then(async () => {
    await sequelize.close();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('Password reset failed:', error.message);
    try {
      await sequelize.close();
    } catch {
      // ignore close errors
    }
    process.exit(1);
  });
