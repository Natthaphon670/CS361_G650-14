import json

class AuthorizationError(Exception):
    """Exception สำหรับกรณีผู้ใช้ไม่มีสิทธิ์เข้าถึง (403 Forbidden)"""
    def __init__(self, message="Forbidden: You do not have permission to perform this action"):
        self.message = message
        self.status_code = 403
        super().__init__(self.message)

def get_user_claims(event):
    """
    [Task 1] สกัด Claims จาก event.requestContext.authorizer.claims
    """
    try:
        authorizer = event.get('requestContext', {}).get('authorizer', {})
        claims = authorizer.get('claims', {})
        
        username = claims.get('cognito:username') or claims.get('username') or claims.get('sub')
        faculty_id = claims.get('custom:faculty_id') or claims.get('faculty_id')
        
        # แกะ cognito:groups (อาจมาเป็น String หรือ List)
        groups_raw = claims.get('cognito:groups', [])
        if isinstance(groups_raw, str):
            groups = [g.strip() for g in groups_raw.split(',') if g.strip()]
        else:
            groups = list(groups_raw)

        return {
            'username': username,
            'faculty_id': faculty_id,
            'groups': groups,
            'claims': claims
        }
    except Exception as e:
        return {
            'username': None,
            'faculty_id': None,
            'groups': [],
            'claims': {}
        }

def verify_bfla(user_claims, allowed_groups=['Staff', 'Admin']):
    """
    [Task 3] BFLA Protection (Role Check)
    ตรวจสอบว่ากลุ่มของผู้ใช้มีสิทธิ์ตามที่กำหนดหรือไม่
    """
    user_groups = user_claims.get('groups', [])
    has_permission = any(group in allowed_groups for group in user_groups)
    
    if not has_permission:
        raise AuthorizationError(
            f"BFLA Violation: Access denied. Required role in {allowed_groups}, but user has {user_groups}"
        )
    return True

def verify_bola(user_claims, target_faculty_id):
    """
    [Task 2] BOLA Protection (Ownership Check)
    ตรวจสอบว่าผู้ใช้เป็นเจ้าของข้อมูล (faculty_id ตรงกัน) หรือเป็น Staff/Admin หรือไม่
    """
    user_groups = user_claims.get('groups', [])
    is_staff_or_admin = any(g in ['Staff', 'Admin'] for g in user_groups)
    
    # หากเป็น Staff หรือ Admin อนุญาตให้ข้าม Ownership Check ได้
    if is_staff_or_admin:
        return True
        
    user_faculty_id = user_claims.get('faculty_id')
    
    # ตรวจสอบความเป็นเจ้าของข้อมูล
    if not user_faculty_id or str(user_faculty_id) != str(target_faculty_id):
        raise AuthorizationError(
            f"BOLA Violation: You are not authorized to modify or access data belonging to faculty_id '{target_faculty_id}'"
        )
    return True