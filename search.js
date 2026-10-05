/**
 * ฟังก์ชันสำหรับกรองข้อมูลภาระงานและผลงานตามเงื่อนไข (Issue #4)
 * 
 * @param {Array} workloadsData - ข้อมูลภาระงานทั้งหมด (อิงจาก faculty-workloads.schema.json)
 * @param {Array} facultiesData - ข้อมูลอาจารย์ทั้งหมด (จาก faculties_2.json)
 * @param {Object} params - เงื่อนไขการค้นหา { academicYear, semester, category, keyword }
 * @returns {Array} - รายการผลงานที่ตรงตามเงื่อนไขทั้งหมด (DoD)
 */
function filterWorkloads(workloadsData, facultiesData, params) {
  
  let allWorkItems = [];

  workloadsData.forEach(record => {
    const baseInfo = {
      faculty_id: record.faculty_id,
      academic_year: record.academic_year, 
      semester: record.semester            
    };

    
    if (record.workloads && record.workloads.teaching) {
      record.workloads.teaching.forEach(item => {
        allWorkItems.push({ ...item, ...baseInfo, categoryType: 'teaching' });
      });
    }
    
    if (record.workloads && record.workloads.student_advising) {
      record.workloads.student_advising.forEach(item => {
        allWorkItems.push({ ...item, ...baseInfo, categoryType: 'student_advising' });
      });
    }
  
    if (record.workloads && record.workloads.academic_outputs) {
      record.workloads.academic_outputs.forEach(item => {
        allWorkItems.push({ ...item, ...baseInfo, categoryType: 'academic_outputs' });
      });
    }
    
    if (record.workloads && record.workloads.services_and_admin) {
      record.workloads.services_and_admin.forEach(item => {
        allWorkItems.push({ ...item, ...baseInfo, categoryType: 'services_and_admin' });
      });
    }
  });

  
  return allWorkItems.filter(item => {
    
    
    if (params.academicYear && item.academic_year !== parseInt(params.academicYear)) {
      return false;
    }
    if (params.semester && item.semester !== parseInt(params.semester)) {
      return false;
    }

    
    if (params.category && params.category !== 'all' && item.categoryType !== params.category) {
      return false;
    }

   
    if (params.keyword && params.keyword.trim() !== '') {
      const keyword = params.keyword.toLowerCase().trim();
      
      // ดึงชื่ออาจารย์มาเพื่อรองรับการค้นหาด้วยชื่ออาจารย์
      const faculty = facultiesData.find(f => f.faculty_id === item.faculty_id);
      const facultyNameTh = faculty && faculty.name_th ? faculty.name_th.toLowerCase() : '';
      const facultyNameEn = faculty && faculty.name_en ? faculty.name_en.toLowerCase() : '';

      // สร้างข้อความรวม (Searchable String) ตามฟิลด์ที่มีใน Schema ของแต่ละประเภทงาน
      let searchableText = `${facultyNameTh} ${facultyNameEn} `;
      
      if (item.categoryType === 'teaching') {
        searchableText += `${item.course_code || ''} ${item.course_type || ''}`;
      } 
      else if (item.categoryType === 'student_advising') {
        searchableText += `${item.course_code || ''} ${item.student_or_project_detail || ''} ${item.advising_type || ''}`;
      } 
      else if (item.categoryType === 'academic_outputs') {
        searchableText += `${item.title || ''} ${item.output_type || ''}`;
      } 
      else if (item.categoryType === 'services_and_admin') {
        searchableText += `${item.service_category || ''} ${item.detail || ''} ${item.role || ''}`;
      }

      // ตรวจสอบว่ามีคำสำคัญอยู่ใน Searchable String หรือไม่
      if (!searchableText.includes(keyword)) {
        return false;
      }
    }

    
    return true; 
  });
}