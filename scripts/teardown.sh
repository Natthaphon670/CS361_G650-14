
set -euo pipefail

STACK_NAME="${STACK_NAME:-cs361-faculty-workload}"
REGION="${AWS_REGION:-us-east-1}"
DRY_RUN="${DRY_RUN:-false}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-backup/$STAMP}"

run() { if [[ "$DRY_RUN" == "true" ]]; then echo "[dry-run] $*"; else "$@"; fi; }
resource() {
  aws cloudformation describe-stack-resource --region "$REGION" --stack-name "$STACK_NAME" \
    --logical-resource-id "$1" --query StackResourceDetail.PhysicalResourceId --output text 2>/dev/null || true
}

if ! aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK_NAME" >/dev/null 2>&1; then
  echo "ไม่พบ stack $STACK_NAME ใน $REGION (อาจถูกลบไปแล้ว)"; exit 0
fi

if [[ "$DRY_RUN" != "true" ]]; then
  read -r -p "พิมพ์ชื่อ stack '$STACK_NAME' เพื่อยืนยันการลบ: " answer
  [[ "$answer" == "$STACK_NAME" ]] || { echo "ยกเลิก"; exit 1; }
fi

mkdir -p "$BACKUP_DIR"
echo "==> สำรองข้อมูลไปที่ $BACKUP_DIR"
for logical in FacultyWorkloadsTable FacultyProfilesTable SystemSettingsTable; do
  table="$(resource "$logical")"
  [[ -z "$table" || "$table" == "None" ]] && continue
  echo "    DynamoDB $table"
  # scan แบบ paginate อัตโนมัติ เก็บเป็น DynamoDB JSON (นำกลับด้วย restore.sh)
  run sh -c "aws dynamodb scan --region '$REGION' --table-name '$table' --output json > '$BACKUP_DIR/$logical.json'"
done

for logical in EvidenceBucket FrontendBucket; do
  bucket="$(resource "$logical")"
  [[ -z "$bucket" || "$bucket" == "None" ]] && continue
  if [[ "$logical" == "EvidenceBucket" ]]; then
    echo "    S3 $bucket -> $BACKUP_DIR/evidence/"
    run aws s3 sync "s3://$bucket" "$BACKUP_DIR/evidence" --region "$REGION" --only-show-errors
  fi
  echo "==> ล้าง bucket $bucket (CloudFormation ลบ bucket ที่ยังมีไฟล์ไม่ได้)"
  run aws s3 rm "s3://$bucket" --recursive --region "$REGION" --only-show-errors
done

echo "==> ลบ stack $STACK_NAME"
run sam delete --stack-name "$STACK_NAME" --region "$REGION" --no-prompts
echo "เสร็จสิ้น — ข้อมูลสำรองอยู่ที่ $BACKUP_DIR (อย่า commit โฟลเดอร์ backup/ ขึ้น Git)"