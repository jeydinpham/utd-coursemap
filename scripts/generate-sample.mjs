// Generates a realistic-looking but FAKE schedule so the app works without
// network access. Real UTD buildings, course codes and time blocks; made-up
// room assignments and instructors. Run with: npm run data:sample
import { writeFile, mkdir } from 'node:fs/promises';

// Deterministic PRNG so the sample is stable between runs.
let seed = 20260824;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const COURSES = {
  CS: [['1136', 'Computer Science Laboratory'], ['1337', 'Computer Science I'], ['2305', 'Discrete Mathematics for Computing I'], ['2336', 'Computer Science II'], ['2340', 'Computer Architecture'], ['3305', 'Discrete Mathematics for Computing II'], ['3341', 'Probability and Statistics in CS'], ['3345', 'Data Structures and Algorithmic Analysis'], ['3354', 'Software Engineering'], ['3377', 'Systems Programming in UNIX'], ['4337', 'Programming Language Paradigms'], ['4341', 'Digital Logic and Computer Design'], ['4347', 'Database Systems'], ['4348', 'Operating Systems Concepts'], ['4349', 'Advanced Algorithm Design and Analysis'], ['4375', 'Introduction to Machine Learning'], ['4384', 'Automata Theory'], ['4485', 'Computer Science Project']],
  SE: [['3306', 'Mathematical Foundations of Software Engineering'], ['3345', 'Data Structures and Algorithmic Analysis'], ['3354', 'Software Engineering'], ['4351', 'Requirements Engineering'], ['4352', 'Software Architecture and Design'], ['4367', 'Software Testing, Verification, Validation']],
  CE: [['3320', 'Digital Circuits'], ['3345', 'Data Structures and Algorithmic Analysis'], ['4304', 'Computer Architecture']],
  EE: [['2310', 'Introduction to Digital Systems'], ['3302', 'Signals and Systems'], ['3310', 'Electronic Devices'], ['3311', 'Electronic Circuits'], ['3320', 'Digital Circuits'], ['4301', 'Electromagnetic Engineering I']],
  MECH: [['2320', 'Statics'], ['2330', 'Dynamics'], ['3310', 'Thermodynamics'], ['3315', 'Fluid Mechanics'], ['3350', 'Mechanics of Materials']],
  BMEN: [['1208', 'Introduction to Clinical Applications'], ['3320', 'Fundamentals of Biomedical Engineering'], ['3350', 'Biomedical Transport Processes']],
  MATH: [['1325', 'Applied Calculus I'], ['2413', 'Differential Calculus'], ['2414', 'Integral Calculus'], ['2415', 'Calculus of Several Variables'], ['2417', 'Calculus I'], ['2418', 'Linear Algebra'], ['2419', 'Calculus II'], ['2420', 'Differential Equations with Applications'], ['3310', 'Theoretical Concepts of Calculus'], ['4334', 'Numerical Analysis']],
  STAT: [['3360', 'Probability and Statistics for Management'], ['4351', 'Probability']],
  PHYS: [['1301', 'College Physics I'], ['2125', 'Physics Laboratory I'], ['2325', 'Mechanics'], ['2326', 'Electromagnetism and Waves']],
  CHEM: [['1311', 'General Chemistry I'], ['1312', 'General Chemistry II'], ['2323', 'Introductory Organic Chemistry I'], ['2325', 'Introductory Organic Chemistry II']],
  BIOL: [['2311', 'Introduction to Modern Biology I'], ['2312', 'Introduction to Modern Biology II'], ['3361', 'Biochemistry I'], ['3301', 'Genetics']],
  ACCT: [['2301', 'Introductory Financial Accounting'], ['2302', 'Introductory Management Accounting'], ['3331', 'Intermediate Financial Accounting I']],
  FIN: [['3320', 'Business Finance'], ['3390', 'Introduction to Financial Modeling'], ['4300', 'Investment Management']],
  MKT: [['3300', 'Principles of Marketing'], ['4330', 'Marketing Analytics']],
  BUAN: [['4320', 'Database Fundamentals for Business Analytics'], ['4351', 'Prescriptive Analytics']],
  OPRE: [['3310', 'Operations Management'], ['3360', 'Probability and Statistics for Management']],
  ITSS: [['3300', 'Information Technology for Business'], ['4351', 'Business Intelligence']],
  BLAW: [['2301', 'Business and Public Law']],
  ECON: [['2301', 'Principles of Macroeconomics'], ['2302', 'Principles of Microeconomics'], ['3310', 'Intermediate Microeconomic Theory']],
  GOVT: [['2305', 'American National Government'], ['2306', 'State and Local Government']],
  HIST: [['1301', 'U.S. History Survey to Civil War'], ['1302', 'U.S. History Survey from Civil War']],
  PSY: [['2301', 'Introduction to Psychology'], ['2314', 'Lifespan Development'], ['3310', 'Developmental Psychology']],
  RHET: [['1302', 'Rhetoric']],
  LIT: [['2331', 'Masterpieces of World Literature'], ['2341', 'Literary Analysis']],
  COMM: [['1311', 'Foundations of Communication'], ['1315', 'Public Speaking']],
  PHIL: [['1301', 'Introduction to Philosophy'], ['2306', 'Introduction to Ethics']],
  CRIM: [['1301', 'Introduction to Criminal Justice']],
  ATCM: [['2340', 'Computer Imaging'], ['3310', 'Motion Design'], ['3365', 'Game Design']],
  ARTS: [['1301', 'Exploration of the Arts'], ['2380', 'Drawing Studio']],
  ANGM: [['2305', '3D Modeling'], ['3310', 'Animation Techniques']],
};

const ECS = ['CS', 'CS', 'CS', 'SE', 'CE', 'EE', 'MECH', 'BMEN', 'MATH'];
const NSM = ['MATH', 'MATH', 'PHYS', 'CHEM', 'BIOL', 'STAT'];
const JSOM = ['ACCT', 'FIN', 'MKT', 'BUAN', 'OPRE', 'ITSS', 'BLAW', 'ECON'];
const LIBARTS = ['GOVT', 'HIST', 'PSY', 'RHET', 'LIT', 'COMM', 'PHIL', 'CRIM', 'ECON'];
const CORE = [...LIBARTS, 'MATH', 'CS', 'BIOL'];

// building -> [subject pool, classroom numbers]
const BUILDINGS = {
  ECSS: [ECS, ['2.201', '2.203', '2.305', '2.306', '2.311', '2.312', '2.410', '2.412', '2.415', '3.503', '3.619', '3.910', '4.619', '4.910']],
  ECSW: [ECS, ['1.315', '1.355', '1.365', '2.325', '2.335', '3.210', '3.250', '3.315', '4.325', '4.910']],
  ECSN: [ECS, ['2.110', '2.112', '2.120', '2.126', '3.108', '3.118', '3.120']],
  JSOM: [JSOM, ['1.107', '1.117', '1.118', '1.212', '1.217', '2.102', '2.106', '2.115', '2.117', '2.702', '2.714', '2.717', '11.202', '12.214']],
  SLC: [NSM, ['1.102', '1.202', '1.205', '2.206', '2.302', '2.303', '3.102', '3.202', '3.203', '3.210']],
  SCI: [NSM, ['1.210', '1.220', '2.235', '2.240', '3.230', '3.240']],
  JO: [LIBARTS, ['3.516', '3.532', '3.536', '4.102', '4.614', '4.708']],
  GR: [CORE, ['1.208', '2.530', '3.102', '4.204', '4.428']],
  FO: [CORE, ['1.202', '1.306', '2.702', '2.708', '3.616']],
  FN: [NSM, ['2.102', '2.202', '2.212', '2.302']],
  CB: [CORE, ['1.102', '1.104', '1.106', '1.108', '1.114', '1.116', '1.120']],
  HH: [CORE, ['1.102', '1.106', '1.110', '1.112']],
  ATC: [['ATCM', 'ATCM', 'ARTS', 'ANGM'], ['1.102', '1.305', '1.406', '2.602', '2.605', '2.705', '3.910']],
  BSB: [['BMEN', 'BIOL', 'CHEM'], ['1.505', '1.605', '2.505']],
  AD: [['GOVT', 'ECON', 'PSY'], ['2.216', '2.232']],
  SSA: [['COMM', 'PSY'], ['13.330', '14.330']],
};

// Standard UTD meeting blocks.
const TR_MW_BLOCKS = ['08:30', '10:00', '11:30', '13:00', '14:30', '16:00', '17:30', '19:00'];
const MWF_BLOCKS = ['09:00', '10:00', '11:00', '12:00', '13:00'];
const LAST_NAMES = ['Nguyen', 'Patel', 'Garcia', 'Kim', 'Chen', 'Smith', 'Johnson', 'Rodriguez', 'Lee', 'Martinez', 'Wang', 'Brown', 'Singh', 'Davis', 'Hernandez', 'Lopez', 'Wilson', 'Zhang', 'Anderson', 'Thomas', 'Khan', 'Moore', 'Clark', 'Lewis', 'Walker', 'Young', 'Allen', 'Wright', 'Scott', 'Green'];
const INITIALS = 'ABCDEFGHJKLMNPRSTW';

const addMin = (hhmm, mins) => {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + mins;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

// Busier mid-day, quieter early morning and evening.
const occupancy = (start) => {
  const h = Number(start.slice(0, 2));
  return h < 9 ? 0.45 : h < 16 ? 0.78 : h < 18 ? 0.6 : 0.4;
};

const meetings = [];
const sectionCounter = {};
function addSection(b, r, pool, days, start, dur) {
  const subj = pick(pool);
  const [num, title] = pick(COURSES[subj]);
  const code = `${subj} ${num}`;
  const evening = Number(start.slice(0, 2)) >= 17;
  const n = (sectionCounter[code] = (sectionCounter[code] ?? 0) + 1);
  meetings.push({
    b,
    r,
    code,
    sec: evening ? `5${String(n).padStart(2, '0')}` : String(n).padStart(3, '0'),
    title,
    prof: `${pick(INITIALS.split(''))}. ${pick(LAST_NAMES)}`,
    days,
    start,
    end: addMin(start, dur),
    from: null,
    to: null,
  });
}

for (const [b, [pool, rooms]] of Object.entries(BUILDINGS)) {
  for (const r of rooms) {
    // A few rooms run MWF 50-minute classes in the morning instead of MW 75-minute ones.
    const mwf = rand() < 0.25;
    for (const start of TR_MW_BLOCKS) {
      const mwfMorning = mwf && start < '14:30'; // MWF blocks occupy M/W until 13:50
      if (!mwfMorning && rand() < occupancy(start)) addSection(b, r, pool, [1, 3], start, 75);
      if (rand() < occupancy(start)) addSection(b, r, pool, [2, 4], start, 75);
    }
    if (mwf) for (const start of MWF_BLOCKS) if (rand() < 0.7) addSection(b, r, pool, [1, 3, 5], start, 50);
    // Occasional Friday seminars / labs.
    if (!mwf && rand() < 0.3) addSection(b, r, pool, [5], pick(['09:00', '13:00', '14:00']), 165);
  }
}

const rooms = Object.fromEntries(Object.entries(BUILDINGS).map(([b, [, r]]) => [b, r]));
await mkdir('public/data', { recursive: true });
await writeFile(
  'public/data/schedule.json',
  JSON.stringify({ term: 'Sample', source: 'sample', generatedAt: new Date().toISOString(), rooms, meetings }),
);
console.log(`Wrote ${meetings.length} sample meetings across ${Object.values(rooms).flat().length} rooms.`);
