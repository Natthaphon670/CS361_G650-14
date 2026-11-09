
set -euo pipefail

DIR="${1:?ระบุโฟลเดอร์ backup เช่น backup/20261109-210000}"
STACK_NAME="${STACK_NAME:-cs361-faculty-workload}"
REGION="${AWS_REGION:-us-east-1}"

resource() {
  aws cloudformation describe-stack-resource --region "$REGION" --stack-name "$STACK_NAME" \
    --logical-resource-id "$1" --query StackResourceDetail.PhysicalResourceId --output text
}

for logical in FacultyWorkloadsTable FacultyProfilesTable SystemSettingsTable; do
  file="$DIR/$logical.json"
  [[ -f "$file" ]] || continue
  table="$(resource "$logical")"
  echo "==> $file -> $table"
  # batch-write-item รับได้ครั้งละ 25 รายการ
  python3 - "$file" "$table" "$REGION" <<'PY'
import json, subprocess, sys
path, table, region = sys.argv[1:]
items = json.load(open(path, encoding="utf-8"))["Items"]
for i in range(0, len(items), 25):
    req = {table: [{"PutRequest": {"Item": it}} for it in items[i:i + 25]]}
    subprocess.run(["aws", "dynamodb", "batch-write-item", "--region", region,
                    "--request-items", json.dumps(req)], check=True, stdout=subprocess.DEVNULL)
print(f"    restored {len(items)} items")
PY
done

if [[ -d "$DIR/evidence" ]]; then
  bucket="$(resource EvidenceBucket)"
  echo "==> evidence -> s3://$bucket"
  aws s3 sync "$DIR/evidence" "s3://$bucket" --region "$REGION" --only-show-errors
fi
echo "เสร็จสิ้น"