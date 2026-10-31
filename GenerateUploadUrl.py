import json
import boto3
import os
from botocore.config import Config

s3_client = boto3.client(
    's3',
    region_name='us-east-1',
    config=Config(signature_version='s3v4')
)

BUCKET_NAME = os.environ.get('EVIDENCE_BUCKET_NAME', 'tu-cs-faculty-evidence-v3')

def lambda_handler(event, context):
    try:
        # 1. ดึงข้อมูลจาก Cognito Claims (เพื่อทำ BOLA / Ownership Check)
        claims = event.get('requestContext', {}).get('authorizer', {}).get('claims', {})
        user_groups = claims.get('cognito:groups', '')
        user_faculty_id = claims.get('custom:faculty_id', '') or claims.get('sub')
        
        # 2. ดึง Query Parameters
        query_params = event.get('queryStringParameters') or {}
        object_key = query_params.get('key')
        
        if not object_key:
            return {
                'statusCode': 400,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'message': 'Missing key parameter'})
            }
            
        # 3. Ownership Check (BOLA): บังคับให้อาจารย์ขอได้เฉพาะ Path ของตนเอง
        if 'Staff' not in user_groups and 'Admin' not in user_groups:
            if not object_key.startswith(f"evidence/{user_faculty_id}/"):
                return {
                    'statusCode': 403,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({'message': 'Forbidden: Access denied to this resource'})
                }
        
        # 4. สร้าง Pre-signed PUT URL (สำหรับ Upload) หมดอายุใน 15 นาที (900 วินาที)
        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={'Bucket': BUCKET_NAME, 'Key': object_key},
            ExpiresIn=900
        )
        
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization'
            },
            'body': json.dumps({
                'upload_url': presigned_url,
                'key': object_key
            })
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': str(e)})
        }