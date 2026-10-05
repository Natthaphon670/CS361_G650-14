import fs from 'node:fs';
import { createWorkloadRepository } from './workload-repository.js';

const records = JSON.parse(fs.readFileSync('./faculties-workloads-mock.json', 'utf8'));
const repo = createWorkloadRepository(records);

const facultyTerm = repo.getByFacultyAndTerm('prof_001', 2567, 1);
const facultyHistory = repo.getFacultyHistory('prof_001');
const teaching = repo.getCategoryItems('prof_001', 2567, 1, 'teaching');
const search = repo.search({ faculty_id: 'prof_001', academic_year: 2567, semester: 1, category: 'teaching' });

if (records.length !== 16) throw new Error(`Expected 16 records, got ${records.length}`);
if (facultyTerm.length !== 1) throw new Error(`Expected 1 faculty/term record, got ${facultyTerm.length}`);
if (facultyHistory.length !== 4) throw new Error(`Expected 4 history records, got ${facultyHistory.length}`);
if (teaching.length !== 1) throw new Error(`Expected 1 teaching item, got ${teaching.length}`);
if (search.length !== 1) throw new Error(`Expected 1 filtered record, got ${search.length}`);

console.log('Issue #3 repository verification: PASS');
console.log({ totalRecords: records.length, facultyTerm: facultyTerm.length, facultyHistory: facultyHistory.length, teachingItems: teaching.length });
