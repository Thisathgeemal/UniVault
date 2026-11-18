#!/usr/bin/env node
/**
 * UniVault – synthetic test data generator
 *
 * Generates fictional employee and bank-customer records for the Employment and
 * KYC credential use cases. Every record's `claims` object is validated against
 * the JSON Schemas in docs/schemas/ before it is written.
 *
 * NO REAL PERSONAL DATA: names are random combinations from generic lists,
 * organisations are fictional, emails use the reserved example.com / .example
 * domains, and phone numbers use a recognisable +94 7X 000 XXXX test pattern.
 * NIC numbers are format-valid and consistent with each record's date of
 * birth, so a generated number may coincide with a real one by chance; it is
 * never linked to that person's data. Do not use this data outside testing.
 *
 * Usage:
 *   node scripts/generate-synthetic-data.mjs [--employees 50] [--customers 50]
 *        [--shared 10] [--seed 2026] [--as-of 2026-11-20] [--out backend/seed-data]
 *
 *   --shared  number of people who are BOTH an employee and a bank customer
 *             (same name, NIC and date of birth) – used to demo one wallet
 *             holding credentials from two issuers.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// CLI options
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = {
    employees: 50,
    customers: 50,
    shared: 10,
    seed: 2026,
    asOf: '2026-11-20',
    out: 'backend/seed-data',
  };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    const val = argv[i + 1];
    if (!key || val === undefined) continue;
    if (key === 'employees') opts.employees = Number(val);
    else if (key === 'customers') opts.customers = Number(val);
    else if (key === 'shared') opts.shared = Number(val);
    else if (key === 'seed') opts.seed = Number(val);
    else if (key === 'as-of') opts.asOf = val;
    else if (key === 'out') opts.out = val;
    else throw new Error(`Unknown option --${key}`);
  }
  if (opts.shared > Math.min(opts.employees, opts.customers)) {
    throw new Error('--shared cannot be larger than --employees or --customers');
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Seeded random number generator (mulberry32) – same seed, same data
// ---------------------------------------------------------------------------
function createRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));
  const pick = (arr) => arr[Math.floor(next() * arr.length)];
  const chance = (p) => next() < p;
  const digits = (n) => Array.from({ length: n }, () => int(0, 9)).join('');
  return { next, int, pick, chance, digits };
}

// ---------------------------------------------------------------------------
// Reference lists (generic, not taken from any real person or organisation)
// ---------------------------------------------------------------------------
const NAMES = {
  sinhala: {
    male: [
      'Kasun',
      'Nuwan',
      'Chamara',
      'Isuru',
      'Dinuka',
      'Sahan',
      'Tharindu',
      'Lahiru',
      'Ruwan',
      'Pasindu',
      'Chathura',
      'Malith',
    ],
    female: [
      'Nadeesha',
      'Dilini',
      'Sachini',
      'Hiruni',
      'Thilini',
      'Kavindi',
      'Ishara',
      'Nimesha',
      'Sanduni',
      'Rashmi',
      'Piumi',
      'Chamodi',
    ],
    surname: [
      'Perera',
      'Fernando',
      'Silva',
      'Bandara',
      'Jayasinghe',
      'Wickramaratne',
      'Gunawardena',
      'Dissanayake',
      'Herath',
      'Rathnayake',
      'Senanayake',
      'Wijesinghe',
    ],
  },
  tamil: {
    male: ['Arun', 'Karthik', 'Suresh', 'Prakash', 'Vimal', 'Niroshan', 'Gajan', 'Thusyanthan'],
    female: [
      'Priya',
      'Kavitha',
      'Nirosha',
      'Tharshika',
      'Shalini',
      'Mathumitha',
      'Janani',
      'Keerthana',
    ],
    surname: [
      'Sivakumar',
      'Rajendran',
      'Navaratnam',
      'Selvaraj',
      'Kanagaratnam',
      'Thevarajah',
      'Paramanathan',
      'Yogarajah',
    ],
  },
  muslim: {
    male: ['Rizwan', 'Imran', 'Fazil', 'Ashraf', 'Nazeer', 'Riyas'],
    female: ['Fathima', 'Ayesha', 'Shafna', 'Rifka', 'Nusra', 'Hafsa'],
    surname: ['Mohamed', 'Cassim', 'Marikar', 'Hameed', 'Ismail', 'Rahuman'],
  },
};

// City, district and postal code. Used only to build fictional addresses.
const CITIES = [
  ['Colombo 03', 'Colombo', '00300'],
  ['Nugegoda', 'Colombo', '10250'],
  ['Gampaha', 'Gampaha', '11000'],
  ['Negombo', 'Gampaha', '11500'],
  ['Kalutara', 'Kalutara', '12000'],
  ['Kandy', 'Kandy', '20000'],
  ['Matale', 'Matale', '21000'],
  ['Nuwara Eliya', 'Nuwara Eliya', '22200'],
  ['Galle', 'Galle', '80000'],
  ['Matara', 'Matara', '81000'],
  ['Hambantota', 'Hambantota', '82000'],
  ['Kurunegala', 'Kurunegala', '60000'],
  ['Puttalam', 'Puttalam', '61300'],
  ['Anuradhapura', 'Anuradhapura', '50000'],
  ['Polonnaruwa', 'Polonnaruwa', '51000'],
  ['Ratnapura', 'Ratnapura', '70000'],
  ['Kegalle', 'Kegalle', '71000'],
  ['Badulla', 'Badulla', '90000'],
  ['Jaffna', 'Jaffna', '40000'],
  ['Batticaloa', 'Batticaloa', '30000'],
  ['Trincomalee', 'Trincomalee', '31000'],
];
const STREETS = [
  'Temple Road',
  'Main Street',
  'Lake Road',
  'Station Road',
  'School Lane',
  'Hospital Road',
  'Church Road',
  'Park Avenue',
  'Flower Road',
  'Hill Street',
  'Old Kandy Road',
  'Galle Road',
];

// Fictional issuers. Names are invented and marked "(Demo)".
const ISSUERS = [
  {
    issuer_key: 'employer-a',
    issuer_type: 'employer',
    name: 'Serendib Trading Company (Demo)',
    email_domain: 'serendib-trading.example',
    id_prefix: 'STC',
    departments: {
      Operations: ['Operations Executive', 'Branch Supervisor', 'Logistics Coordinator'],
      Finance: ['Accounts Assistant', 'Finance Executive', 'Senior Accountant'],
      'Human Resources': ['HR Assistant', 'HR Executive'],
      'Information Technology': [
        'Software Engineer',
        'IT Support Officer',
        'Systems Administrator',
      ],
      'Customer Service': ['Customer Service Officer', 'Call Centre Agent'],
    },
    locations: ['Head Office – Colombo', 'Kandy Branch', 'Galle Branch', 'Kurunegala Branch'],
  },
  {
    issuer_key: 'employer-b',
    issuer_type: 'employer',
    name: 'Lanka Agro Tools Enterprises (Demo)',
    email_domain: 'lanka-agro-tools.example',
    id_prefix: 'LAT',
    departments: {
      Sales: ['Sales Assistant', 'Sales Executive', 'Showroom Manager'],
      Warehouse: ['Storekeeper', 'Warehouse Assistant', 'Forklift Operator'],
      'Field Services': ['Field Technician', 'Machinery Mechanic'],
      Accounts: ['Accounts Clerk', 'Cashier'],
    },
    locations: ['Main Showroom', 'Warehouse', 'Field Operations'],
  },
  {
    issuer_key: 'bank-a',
    issuer_type: 'bank',
    name: 'UniVault Demo Bank',
  },
];

const OCCUPATIONS = [
  'Teacher',
  'Nurse',
  'Software Engineer',
  'Accountant',
  'Shop Owner',
  'Farmer',
  'Driver',
  'Graphic Designer',
  'Civil Engineer',
  'Pharmacist',
  'Tailor',
  'Student',
  'Electrician',
  'Sales Representative',
];
const PUBLIC_POSITIONS = ['Divisional Secretariat Officer', 'Municipal Council Member'];

// ---------------------------------------------------------------------------
// Date helpers (UTC, ISO 8601 YYYY-MM-DD)
// ---------------------------------------------------------------------------
const toIso = (d) => d.toISOString().slice(0, 10);
const parseIso = (s) => new Date(`${s}T00:00:00Z`);
function randomDate(rng, fromIso, toIsoStr) {
  const from = parseIso(fromIso).getTime();
  const to = parseIso(toIsoStr).getTime();
  return toIso(new Date(from + Math.floor(rng.next() * (to - from + 1))));
}
function addYears(iso, years) {
  const d = parseIso(iso);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return toIso(d);
}
function ageOn(dobIso, onIso) {
  const dob = parseIso(dobIso);
  const on = parseIso(onIso);
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    on.getUTCMonth() < dob.getUTCMonth() ||
    (on.getUTCMonth() === dob.getUTCMonth() && on.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

// ---------------------------------------------------------------------------
// NIC generation
// Day code = day of year counted on a 366-day calendar (February always has
// 29 days), plus 500 for females. This is the commonly used decoding rule;
// informal sources disagree on some edge cases, which does not matter for
// synthetic test data. The check digit is random (the official algorithm is
// not published), so numbers are format-valid but not authentic.
// ---------------------------------------------------------------------------
const MONTH_DAYS_366 = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function nicDayCode(dobIso, gender) {
  const d = parseIso(dobIso);
  let doy = d.getUTCDate();
  for (let m = 0; m < d.getUTCMonth(); m += 1) doy += MONTH_DAYS_366[m];
  return doy + (gender === 'female' ? 500 : 0);
}
function generateNic(rng, dobIso, gender) {
  const year = dobIso.slice(0, 4);
  const day = String(nicDayCode(dobIso, gender)).padStart(3, '0');
  const serial = rng.digits(3);
  const check = rng.digits(1);
  // People born before 1998 were usually issued the old format before 2016.
  const useOld = Number(year) < 1998 && rng.chance(0.6);
  if (useOld) return `${year.slice(2)}${day}${serial}${check}V`;
  return `${year}${day}0${serial}${check}`;
}

// ---------------------------------------------------------------------------
// Person pool
// ---------------------------------------------------------------------------
function generatePerson(rng, index, dobRange) {
  const group = rng.pick(['sinhala', 'sinhala', 'sinhala', 'tamil', 'muslim']);
  const gender = rng.chance(0.5) ? 'male' : 'female';
  const list = NAMES[group];
  let first = rng.pick(list[gender]);
  let middle = rng.pick(list[gender]);
  while (middle === first) middle = rng.pick(list[gender]);
  const surname = rng.pick(list.surname);
  const fullName = rng.chance(0.6) ? `${first} ${middle} ${surname}` : `${first} ${surname}`;
  const dob = randomDate(rng, dobRange[0], dobRange[1]);
  const [city, district, postal] = rng.pick(CITIES);
  return {
    person_id: `P${String(index + 1).padStart(4, '0')}`,
    gender, // internal only – never placed in credential claims
    full_name: fullName,
    first_name: first.toLowerCase(),
    surname: surname.toLowerCase(),
    date_of_birth: dob,
    nic_number: generateNic(rng, dob, gender),
    mobile_number: `+947${rng.int(0, 8)}000${rng.digits(4)}`,
    address: {
      line1: `No. ${rng.int(1, 250)}${rng.chance(0.3) ? `/${rng.int(1, 9)}` : ''}, ${rng.pick(STREETS)}`,
      city,
      district,
      postal_code: postal,
      country: 'LK',
    },
  };
}

// ---------------------------------------------------------------------------
// Record builders – `claims` must validate against the credential schema
// ---------------------------------------------------------------------------
function buildEmployee(rng, person, issuer, seq, asOf) {
  const department = rng.pick(Object.keys(issuer.departments));
  const earliestJoin = addYears(person.date_of_birth, 18);
  const joinFrom = earliestJoin > '2010-01-01' ? earliestJoin : '2010-01-01';
  const joinTo = asOf;
  const dateOfJoining = randomDate(rng, joinFrom, joinTo);
  const monthsEmployed = (parseIso(asOf) - parseIso(dateOfJoining)) / (30 * 864e5);
  const employmentType =
    monthsEmployed < 6 ? 'probationary' : rng.chance(0.75) ? 'permanent' : 'contract';

  const claims = {
    employee_id: `${issuer.id_prefix}-${String(seq).padStart(5, '0')}`,
    full_name: person.full_name,
    designation: rng.pick(issuer.departments[department]),
    department,
    employment_type: employmentType,
    date_of_joining: dateOfJoining,
  };
  if (rng.chance(0.8)) claims.nic_number = person.nic_number;
  if (rng.chance(0.9)) claims.work_location = rng.pick(issuer.locations);
  if (rng.chance(0.7))
    claims.work_email = `${person.first_name}.${person.surname}${seq}@${issuer.email_domain}`;
  if (rng.chance(0.5)) claims.work_phone = `+9411000${rng.digits(4)}`;

  return {
    _synthetic: true,
    record_id: `EMP-REC-${String(seq).padStart(4, '0')}`,
    person_id: person.person_id,
    issuer_key: issuer.issuer_key,
    credential_type: 'EmploymentCredential',
    claims,
  };
}

function buildCustomer(rng, person, bank, seq, asOf, employerName) {
  const docRoll = rng.next();
  const idDocumentType = docRoll < 0.7 ? 'nic' : docRoll < 0.85 ? 'passport' : 'driving_licence';
  const age = ageOn(person.date_of_birth, asOf);

  const claims = {
    full_name: person.full_name,
    id_document_type: idDocumentType,
    id_document_number:
      idDocumentType === 'nic'
        ? person.nic_number
        : idDocumentType === 'passport'
          ? `N${rng.digits(7)}`
          : `B${rng.digits(7)}`,
    date_of_birth: person.date_of_birth,
    age_over_18: age >= 18,
    nationality: 'LK',
    permanent_address: person.address,
    mobile_number: person.mobile_number,
  };
  if (idDocumentType !== 'nic') {
    claims.id_document_expiry = randomDate(rng, addYears(asOf, 1), addYears(asOf, 9));
  }
  if (rng.chance(0.2)) {
    const [city, district, postal] = rng.pick(CITIES);
    claims.residential_address = {
      line1: `No. ${rng.int(1, 250)}, ${rng.pick(STREETS)}`,
      city,
      district,
      postal_code: postal,
      country: 'LK',
    };
    claims.residence_proof_type = rng.pick([
      'electricity_bill',
      'water_bill',
      'fixed_line_telephone_bill',
    ]);
  }
  if (rng.chance(0.6)) claims.email = `${person.first_name}.${person.surname}${seq}@example.com`;
  if (employerName) {
    claims.occupation = 'Employee';
    claims.employer_name = employerName;
  } else if (age < 18) {
    claims.occupation = 'Student';
  } else if (rng.chance(0.85)) {
    claims.occupation = rng.pick(OCCUPATIONS);
  }

  // For holders under 18 the issuer must cap credential expiry at the 18th
  // birthday (schema doc, section 6). Recorded here so tests can check it.
  const issuanceHints = { suggested_valid_until: addYears(asOf, 2) };
  if (age < 18) issuanceHints.suggested_valid_until = addYears(person.date_of_birth, 18);
  if (
    claims.id_document_expiry &&
    claims.id_document_expiry < issuanceHints.suggested_valid_until
  ) {
    issuanceHints.suggested_valid_until = claims.id_document_expiry;
  }

  return {
    _synthetic: true,
    record_id: `KYC-REC-${String(seq).padStart(4, '0')}`,
    person_id: person.person_id,
    issuer_key: bank.issuer_key,
    credential_type: 'KYCCredential',
    kyc_verification_date: randomDate(rng, addYears(asOf, -3), asOf),
    issuance_hints: issuanceHints,
    claims,
  };
}

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------
function loadValidators() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
  addFormats(ajv);
  ajv.addKeyword({ keyword: 'x-univault' });
  const load = (file) => JSON.parse(readFileSync(join(ROOT, 'docs/schemas', file), 'utf8'));
  return {
    EmploymentCredential: ajv.compile(load('employment-credential.v1.schema.json')),
    KYCCredential: ajv.compile(load('kyc-credential.v1.schema.json')),
  };
}

function validateAll(records, validators) {
  const failures = [];
  for (const rec of records) {
    const validate = validators[rec.credential_type];
    if (!validate(rec.claims)) failures.push({ record_id: rec.record_id, errors: validate.errors });
  }
  return failures;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const opts = parseArgs(process.argv.slice(2));
  const rng = createRng(opts.seed);
  const [employerA, employerB, bank] = ISSUERS;

  // Adults for employees; customers may include a few 16–17 year olds.
  const adultRange = ['1968-01-01', addYears(opts.asOf, -19)];
  const minorRange = [addYears(opts.asOf, -18), addYears(opts.asOf, -16)];

  const employeesPool = Array.from({ length: opts.employees }, (_, i) =>
    generatePerson(rng, i, adultRange),
  );
  const extraCustomers = opts.customers - opts.shared;
  const customerOnlyPool = Array.from({ length: extraCustomers }, (_, i) => {
    const isMinor = i < 2; // two under-18 customers to exercise the age rule
    return generatePerson(rng, opts.employees + i, isMinor ? minorRange : adultRange);
  });

  const employees = employeesPool.map((person, i) => {
    const issuer = i % 2 === 0 ? employerA : employerB;
    return buildEmployee(rng, person, issuer, i + 1, opts.asOf);
  });

  const customers = [
    // First `shared` employees are also bank customers (multi-issuer wallet demo)
    ...employeesPool.slice(0, opts.shared).map((person, i) => {
      const employer = ISSUERS.find((iss) => iss.issuer_key === employees[i].issuer_key);
      return buildCustomer(rng, person, bank, i + 1, opts.asOf, employer.name);
    }),
    ...customerOnlyPool.map((person, i) =>
      buildCustomer(rng, person, bank, opts.shared + i + 1, opts.asOf, null),
    ),
  ];
  // Give one adult customer-only record a public position (PEP-related field)
  const pep = customers.find((c) => !c.claims.employer_name && c.claims.age_over_18);
  if (pep) pep.claims.public_position = rng.pick(PUBLIC_POSITIONS);

  const validators = loadValidators();
  const failures = validateAll([...employees, ...customers], validators);
  if (failures.length > 0) {
    console.error(`Schema validation failed for ${failures.length} record(s):`);
    console.error(JSON.stringify(failures, null, 2));
    process.exit(1);
  }

  const meta = {
    _synthetic: true,
    generator: 'scripts/generate-synthetic-data.mjs',
    seed: opts.seed,
    as_of: opts.asOf,
    schema_version: '1.0',
    notice: 'Fictional test data for the UniVault prototype. Not real people or organisations.',
  };
  const outDir = resolve(ROOT, opts.out);
  mkdirSync(outDir, { recursive: true });
  const write = (file, data) =>
    writeFileSync(join(outDir, file), `${JSON.stringify(data, null, 2)}\n`, 'utf8');

  write('issuers.json', {
    ...meta,
    issuers: ISSUERS.map(({ issuer_key, issuer_type, name, email_domain }) => ({
      issuer_key,
      issuer_type,
      name,
      ...(email_domain ? { email_domain } : {}),
    })),
  });
  write('employees.json', { ...meta, count: employees.length, records: employees });
  write('customers.json', { ...meta, count: customers.length, records: customers });

  const minors = customers.filter((c) => !c.claims.age_over_18).length;
  console.log(
    `Generated ${employees.length} employees and ${customers.length} customers → ${opts.out}`,
  );
  console.log(`  shared people (employee + customer): ${opts.shared}`);
  console.log(`  customers under 18: ${minors}`);
  console.log('  all records passed schema validation');
}

main();
