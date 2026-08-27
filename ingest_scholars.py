import json
import time
import re
from scholarly import scholarly

# 1. รายการข้อมูลพื้นฐานของอาจารย์ที่เก็บรวบรวมได้จากหน้าเว็บคณะ (ตรงตามโครงสร้างในรูปภาพ)
FACULTY_WEB_DATA = [
    {
        "id": "prof_001",
        "name_th": "ผศ.ดร.ลัมพาพรรณ พันธ์ชูจิตร์",
        "name_en": "Asst.Prof.Dr. Lumpapun Punchoojit",
        "academic_position": "ผู้ช่วยศาสตราจารย์ (Asst.Prof.Dr.)",
        "contact_info": {
            "office": "อาคาร LC-2 ชั้น 2 ห้อง 224",
            "phone": "02-546-4444 ต่อ 2157 ต่อ 224",
            "email": "lumpapun_p@sci.tu.ac.th"
        },
        "education": [
            "Ph.D. (Computer Science), Faculty of Science and Technology, Thammasat University , 2019",
            "M.Sc. (Information Technology) ,Faculty of Information Technology, King Mongkut’s University of Technology North Bangkok, 2013",
            "B.Sc. (Computer Science), Mahidol University International College , 2009"
        ],
        "research_interests": [
            "Human-Computer Interaction",
            "Child-Computer Interaction",
            "Human and Psychological factors in designing UX/UI",
            "UX/UI research methods",
            "Mobile Usability"
        ],
        "expertise": [
            "วิจัยด้านการปฏิสัมพันธ์ระหว่างมนุษย์และคอมพิวเตอร์ และระหว่างเด็กและคอมพิวเตอร์ ศึกษาในเชิงทฤษฎี วัดผลและประเมินผล รวมถึงการประยุกต์ใช้ทฤษฎีในการสร้างผลิตภัณฑ์ต่าง ๆ",
            "วิจัยด้านมนุษยปัจจัยและปัจจัยเชิงจิตวิทยาที่มีอิทธิพลต่อการออกแบบส่วนต่อประสานและประสบการณ์ผู้ใช้",
            "การประยุกต์ใช้วิธีวิจัยรูปแบบต่าง ๆ ในการออกแบบส่วนต่อประสานและประสบการณ์ผู้ใช้",
            "งานวิจัยด้านความยากง่ายในการใช้งานอุปกรณ์สื่อสารแบบเคลื่อนที่"
        ],
        "selected_publication": {
            "-"
        },
        "external_profiles": {
            "google_scholar_url": "https://scholar.google.com/citations?user=6lbEl34KcAAC&hl=th",
            "researchgate_url": "https://www.researchgate.net/publication/320986719_Usability_Studies_on_Mobile_User_Interface_Design_Patterns_A_Systematic_Literature_Review"
        },
        "scholar_id": "6lbEl34KcAAC&hl"
    },
    
    {
        "id": "prof_002",
        "name_th": "ผศ.ดร.ประภาพร รัตนธำรง",
        "name_en": "Asst.Prof.Dr. Prapaporn Rattanatamrong",
        "academic_position": "ผู้ช่วยศาสตราจารย์ (Asst.Prof.Dr.)",
        "contact_info": {
            "office": "อาคาร LC-2 ชั้น 2 ห้อง 210",
            "phone": "0-2986-9256 ต่อ 225",
            "email": "rattanat@tu.ac.th"
        },
        "education": [
            "Ph.D. (Electrical and Computer Engineering), University of Florida, USA, 2554",
            "M.Sc. (Computer Science), University of Southern California, USA, 2547",
            "วศ.บ. (วิศวกรรมคอมพิวเตอร์) (เกียรตินิยมอันดับสอง), มหาวิทยาลัยเกษตรศาสตร์, ประเทศไทย, 2544"
        ],
        "research_interests": [
            "Distributed Systems and Middleware",
            "Cloud and Edge Computing",
            "Big Data Engineering",
            "Digital Twins",
            "Data-Driven Decision Support Systems",
            "Real-Time Scheduling"
        ],
        "expertise": [
            "การออกแบบสถาปัตยกรรมของระบบสารสนเทศ (IT systems) บริการบนระบบอินเตอร์เน็ต (Internet-based services) และโครงสร้างพื้นฐานไซเบอร์ (Cyberinfrastructure) แบบกระจายศูนย์ (Distributed systems) และแบบที่อาศัยกลยุทธ์เชิงเทคนิคและศักยภาพของคลาวด์ (Cloud computing) เป็นองค์ประกอบ",
            "ระบบในการบริหารจัดการการไหลของข้อมูล (Data workflow) เพื่อจัดเก็บ โอนย้าย และวิเคราะห์ข้อมูลทั้งในเซิร์ฟเวอร์บนคลาวด์และเอดจ์ (Cloud and Edge servers)",
            "ระบบแสดงข้อมูลเป็นภาพ เพื่อสนับสนุนการใช้ข้อมูลประกอบการตัดสินใจขององค์กร (Dashboard and Decision support systems)"
        ],
        "selected_publications": [
            "Thongthavorn, Wongsatorn & Rattanatamrong, Prapaporn. (2019). Multi-Container Application Migration with Load Balanced and Adaptive Parallel TCP. 55-62. 10.1109/HPCS48598.2019.9188218.",
            "Wantanakorn, Pornchanok & Harintajinda, Supamas & Chuthapisith, Jariya & Anurathapan, Usanarat & Rattanatamrong, Prapaporn. (2018). A New Mobile Application to Reduce Anxiety in Pediatric Patients Before Bone Marrow Aspiration Procedures. Hospital pediatrics. 8. 10.1542/hpeds.2018-0073.",
            "Rattanatamrong, Prapaporn & Fortes, Jose. (2014). Dynamic Scheduling of Real-Time Mixture-of-Experts Systems on Limited Resources. Computers, IEEE Transactions on. 63. 1751-1764. 10.1109/TC.2013.50.",
            "Rattanatamrong, Prapaporn & Fortes, Jose. (2012). Improved real-time scheduling of periodic tasks on multiprocessors. Concurrency and Computation Practice and Experience. 27. 10.1002/cpe.2969.",
            "Rattanatamrong, Prapaporn & Fortes, Jose. (2011). Mode Transition for Online Scheduling of Adaptive Real-Time Systems on Multiprocessors. 1. 25 – 32. 10.1109/RTCSA.2011.71.",
            "Rattanatamrong, Prapaporn & Fortes, José. (2010). Real-time scheduling of mixture-of-experts systems with limited resources. HSCC’10 – Proceedings of the 13th ACM International Conference on Hybrid Systems: Computation and Control. 71-80. 10.1145/1755952.1755964.",
            "Digiovanna, Jack & Rattanatamrong, Prapaporn & Zhao, Ming & Mahmoudi, Babak & Hermer, Linda & Figueiredo, Renato & Principe, Jose & Fortes, Jose & Sanchez, Justin. (2010). Cyber-Workstation for Computational Neuroscience. Frontiers in neuroengineering. 2. 17. 10.3389/neuro.16.017.2009."
        ],
        "external_profiles": {
            "google_scholar_url": "https://scholar.google.com/citations?user=91z1Tv8AAAAJ&hl=en",
            "researchgate_url": "https://www.researchgate.net/profile/Prapaporn-Rattanatamrong"
        },
        "scholar_id": "91z1Tv8AAAAJ"
    },
    {
        "id": "prof_003",
        "name_th": "ผศ.ดร.ทรงศักดิ์ รองวิริยะพานิช",
        "name_en": "Asst.Prof.Dr. Songsakdi Rongviriyapanish",
        "academic_position": "ผู้ช่วยศาสตราจารย์ (Asst.Prof.Dr.)",
        "contact_info": {
            "office": "อาคาร LC-2 ชั้น 2 ห้อง 223",
            "phone": "0-2986-9156 ต่อ 204",
            "email": "rongviri@tu.ac.th"
        },
        "education": [
            "Ph.D. (Decorat en informatique), Université de Nancy II ,FRANCE, 2543",
            "DEA (Diplôme d’étude aprofondi specialisé en bases de données, du parallélisme et des systèmes distributes), Institut National des Télécommunications ,FRANCE, 2539",
            "Maîtrise (Maîtrise d’informatique) , Institut Galilée, Université de Paris XIII , FRANCE, 2538",
            "Licence (Licence d’informatique) , Institut Galilée, Université de Paris XIII , FRANCE, 2537"
        ],
        "research_interests": [
            "Software Engineering (Software Verification, Software Process)",
            "Simulation Model",
            "Software Modeling ( Formal Method )"
        ],
        "expertise": ["-"],
        "selected_publications": ["-"],
        "external_profiles": {
            "google_scholar_url": "https://scholar.google.com/citations?hl=th&user=w57gQ0EAAAAJ&view_op=list_works&sortby=pubdate",
            "researchgate_url": "https://www.researchgate.net/profile/Songsak-Rongviriyapanich"
        },
        "scholar_id": "w57gQ0EAAAAJ"
    },
    {
        "id": "prof_004",
        "name_th": "ผศ.ดร.กษิดิศ ชาญเชี่ยว",
        "name_en": "Asst.Prof.Dr. Kasidit Chanchio",
        "academic_position": "ผู้ช่วยศาสตราจารย์ (Asst.Prof.Dr.)",
        "contact_info": {
            "office": "อาคาร LC-2 ชั้น 2 ห้อง 210",
            "phone": "0-2986-9156 ต่อ 200",
            "email": "ckasidit@tu.ac.th"
        },
        "research_interests": [
            "Fault Tolerence",
            "Distributed and Parallel Processing",
            "High Performance Computing",
            "System Software"
        ],
        "education": [
            "Ph. D. (Computer Science), Louisiana State University, USA. , 2543",
            "M.S. (Computer Science), Louisiana State University, USA. , 2539",
            "วท.บ. (ศาสตร์คอมพิวเตอร์) , มหาวิทยาลัยธรรมศาสตร์ , ประเทศไทย, 2533"
        ],
        "expertise": ["-"],
        "selected_publications": ["-"],
        "external_profiles": {
            "google_scholar_url": "-",
            "researchgate_url": "-"
        },
        "scholar_id": "-"
    }
]

def extract_scholar_id(url_or_id):
    """
    ดึง Scholar ID จาก URL หรือสตริงก์ ID
    """
    if not url_or_id:
        return None
    if "user=" in url_or_id:
        match = re.search(r'user=([^&]+)', url_or_id)
        return match.group(1) if match else None
    elif len(url_or_id) > 5 and "/" not in url_or_id:
        return url_or_id
    return None

def fetch_publication_data(scholar_id, name_en=""):
    """
    ดึงข้อมูลงานวิจัยจาก Google Scholar โดยใช้ scholarly
    """
    publications = []
    target_id = extract_scholar_id(scholar_id)
    
    # หากไม่ได้ใส่ Scholar ID ระบบจะพยายามค้นหาจากชื่อภาษาอังกฤษให้โดยอัตโนมัติ
    if not target_id and name_en:
        try:
            print(f"  --> ไม่พบ Scholar ID, กำลังค้นหาจากชื่อ: '{name_en}'...")
            search_query = scholarly.search_author(name_en)
            author_node = next(search_query, None)
            if author_node:
                target_id = author_node.get('scholar_id')
                print(f"  --> พบ Scholar ID อัตโนมัติ: {target_id}")
        except Exception as e:
            print(f"  --> ค้นหาชื่อไม่พบหรือเกิดข้อผิดพลาด: {e}")

    if not target_id:
        print("  --> [คำเตือน] ไม่มีข้อมูล Google Scholar ID ข้ามการดึงงานวิจัย")
        return publications

    try:
        print(f"  --> กำลังดึงผลงานวิจัยจาก Google Scholar (ID: {target_id})...")
        author = scholarly.search_author_id(target_id)
        author_data = scholarly.fill(author, sections=['publications'])
        
        for pub in author_data.get('publications', []):
            pub_bib = pub.get('bib', {})
            pub_item = {
                "title": pub_bib.get('title', 'N/A'),
                "year": int(pub_bib.get('pub_year')) if pub_bib.get('pub_year') and pub_bib.get('pub_year').isdigit() else None,
                "venue": pub_bib.get('venue', 'N/A'),
                "citation_count": pub.get('num_citations', 0),
                "url": pub.get('pub_url', f"https://scholar.google.com/citations?view_op=view_citation&citation_for_view={pub.get('author_pub_id')}")
            }
            publications.append(pub_item)
            time.sleep(0.3)
            
    except Exception as e:
        print(f"  --> [Warning] ไม่สามารถดึงข้อมูลจาก Scholar ID: {target_id} ได้ ({e})")
        
    return publications

def main():
    faculties_data = []
    print("==================================================")
    print("เริ่มกระบวนการดึงและจัดกลุ่มข้อมูลอาจารย์ (Faculty Data Ingestion)")
    print("==================================================\n")
    
    for prof in FACULTY_WEB_DATA:
        print(f"กำลังประมวลผล: {prof['name_th']} ({prof['name_en']})")
        
        # ดึงผลงานวิจัยจาก Google Scholar
        scholar_id_to_use = prof.get('scholar_id') or prof.get('external_profiles', {}).get('google_scholar_url', '')
        pubs = fetch_publication_data(scholar_id_to_use, prof['name_en'])
        
        # จัดโครงสร้างข้อมูลรวม (Nested JSON Schema ตามโครงสร้างเว็บคณะ + Google Scholar)
        faculty_entry = {
            "faculty_id": prof.get('id'),
            "name_th": prof.get('name_th'),
            "name_en": prof.get('name_en'),
            "academic_position": prof.get('academic_position'),
            "contact_information": prof.get('contact_info', {}),
            "research_interests": prof.get('research_interests', []),
            "education": prof.get('education', []),
            "expertise": prof.get('expertise', []),
            "external_profiles": prof.get('external_profiles', {}),
            "total_publications": len(pubs),
            "publications": pubs
        }
        
        faculties_data.append(faculty_entry)
        print(f"  --> สำเร็จ! ดึงงานวิจัยได้ทั้งหมด {len(pubs)} รายการ\n")
        time.sleep(1.0)

    # บันทึกเป็นไฟล์ faculties.json
    output_filename = "faculties.json"
    with open(output_filename, "w", encoding="utf-8") as f:
        json.dump(faculties_data, f, ensure_ascii=False, indent=2)

    print("==================================================")
    print(f"[สำเร็จ] บันทึกข้อมูลโครงสร้างใหม่ลงไฟล์ '{output_filename}' เรียบร้อยแล้ว")
    print("==================================================")

if __name__ == "__main__":
    main()