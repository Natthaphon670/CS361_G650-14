/**
 * Workload Repository Module (Issue #3)
 *
 * Data source: faculties-workloads-mock.json
 * Query keys: faculty_id, academic_year, semester, workloads/category
 */

const DEFAULT_DATA_URL = './faculties-workloads-mock.json';

function normalizeNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isNaN(number) ? value : number;
}

function createWorkloadRepository(records = []) {
  const data = Array.isArray(records) ? records : [];

  function getAll() {
    return [...data];
  }

  function getByFaculty(facultyId) {
    return data.filter(record => record.faculty_id === facultyId);
  }

  function getByTerm(academicYear, semester) {
    const year = normalizeNumber(academicYear);
    const sem = normalizeNumber(semester);
    return data.filter(record =>
      Number(record.academic_year) === Number(year) &&
      Number(record.semester) === Number(sem)
    );
  }

  function getByFacultyAndTerm(facultyId, academicYear, semester) {
    const year = normalizeNumber(academicYear);
    const sem = normalizeNumber(semester);
    return data.filter(record =>
      record.faculty_id === facultyId &&
      Number(record.academic_year) === Number(year) &&
      Number(record.semester) === Number(sem)
    );
  }

  function getByAcademicYear(facultyId, academicYear) {
    const year = normalizeNumber(academicYear);
    return data.filter(record =>
      (!facultyId || record.faculty_id === facultyId) &&
      Number(record.academic_year) === Number(year)
    );
  }

  function getByCategory(facultyId, academicYear, semester, category) {
    const records = getByFacultyAndTerm(facultyId, academicYear, semester);
    if (!category) return records;
    return records.filter(record =>
      record.workloads &&
      Object.prototype.hasOwnProperty.call(record.workloads, category)
    );
  }

  function getCategoryItems(facultyId, academicYear, semester, category) {
    return getByCategory(facultyId, academicYear, semester, category)
      .flatMap(record => (record.workloads?.[category] || []).map(item => ({
        ...item,
        faculty_id: record.faculty_id,
        academic_year: record.academic_year,
        semester: record.semester,
        evaluation_period: record.evaluation_period,
        category
      })));
  }

  function getFacultyHistory(facultyId) {
    return getByFaculty(facultyId).sort((a, b) =>
      Number(a.academic_year) - Number(b.academic_year) ||
      Number(a.semester) - Number(b.semester)
    );
  }

  function search(filters = {}) {
    const { faculty_id, academic_year, semester, category } = filters;
    let result = data;

    if (faculty_id) result = result.filter(r => r.faculty_id === faculty_id);
    if (academic_year !== undefined && academic_year !== null && academic_year !== '') {
      result = result.filter(r => Number(r.academic_year) === Number(academic_year));
    }
    if (semester !== undefined && semester !== null && semester !== '') {
      result = result.filter(r => Number(r.semester) === Number(semester));
    }
    if (category) {
      result = result.filter(r =>
        r.workloads && Object.prototype.hasOwnProperty.call(r.workloads, category)
      );
    }

    return [...result];
  }

  return {
    getAll,
    getByFaculty,
    getByTerm,
    getByFacultyAndTerm,
    getByAcademicYear,
    getByCategory,
    getCategoryItems,
    getFacultyHistory,
    search
  };
}

async function loadWorkloadRepository(url = DEFAULT_DATA_URL) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Cannot load workload dataset: ${response.status} ${response.statusText}`);
  }
  const records = await response.json();
  if (!Array.isArray(records)) {
    throw new Error('Invalid workload dataset: expected an array of records.');
  }
  return createWorkloadRepository(records);
}

export { createWorkloadRepository, loadWorkloadRepository };
