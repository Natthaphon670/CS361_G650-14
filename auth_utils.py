import json

class AuthorizationError(Exception):
    """Exception สำหรับกรณีผู้ใช้ไม่มีสิทธิ์เข้าถึง (403 Forbidden)"""
    def __init__(self, message="Forbidden: You do not have permission to perform this action"):
        self.message = message
        self.status_code = 403
        super().__init__(self.message)

def get_user_claims(event):
    """
    สกัด Claims จาก event.requestContext.authorizer.claims
    """
    try:
        authorizer = event.get('requestContext', {}).get('authorizer', {})
        claims = authorizer.get('claims', {})
        
        username = claims.get('cognito:username') or claims.get('username') or claims.get('sub')
        faculty_id = claims.get('custom:faculty_id') or claims.get('faculty_id') or claims.get('cognito:username')
        
        # แกะ cognito:groups
        groups_raw = claims.get('cognito:groups', [])
        if isinstance(groups_raw, str):
            groups = [g.strip() for g in groups_raw.split(',') if g.strip()]
        else:
            groups = list(groups_raw)

        is_staff_or_admin = any(g in ['Staff', 'Admin'] for g in groups)

        return {
            'username': username,
            'faculty_id': faculty_id,
            'groups': groups,
            'is_staff_or_admin': is_staff_or_admin,
            'claims': claims
        }
    except Exception:
        return {
            'username': None,
            'faculty_id': None,
            'groups': [],
            'is_staff_or_admin': False,
            'claims': {}
        }

def verify_bfla(user_claims, allowed_groups=['Staff', 'Admin']):
    """
    BFLA Protection (Role Check)
    ตรวจสอบว่าผู้ใช้มีบทบาทตามกลุ่มที่ได้รับอนุญาตหรือไม่
    """
    user_groups = user_claims.get('groups', [])
    has_permission = any(group in allowed_groups for group in user_groups)
    
    if not has_permission:
        raise AuthorizationError('คุณไม่มีสิทธิ์ดำเนินการนี้')
    return True

def verify_bola(user_claims, target_faculty_id):
    """
    BOLA Protection (Ownership Check)
    ตรวจสอบความเป็นเจ้าของข้อมูล (ถ้าเป็น Staff/Admin ให้ยกเว้นการเช็คได้)
    """
    if user_claims.get('is_staff_or_admin'):
        return True
        
    user_faculty_id = user_claims.get('faculty_id')
    
    if not user_faculty_id or str(user_faculty_id) != str(target_faculty_id):
        raise AuthorizationError('คุณไม่มีสิทธิ์เข้าถึงหรือแก้ไขข้อมูลนี้')
    return True
