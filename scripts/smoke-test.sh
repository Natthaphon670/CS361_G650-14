
set -uo pipefail

STACK_NAME="${STACK_NAME:-cs361-faculty-workload}"
REGION="${AWS_REGION:-us-east-1}"
TEST_TERM="${TEST_TERM:-2599#9}"   # เทอมสมมติ ไม่ชนกับข้อมูลจริง

output() {
  aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
API_URL="${API_URL:-$(output ApiGatewayInvokeURL)}"
FRONTEND_URL="${FRONTEND_URL:-$(output FrontendUrl 2>/dev/null || true)}"
API_URL="${API_URL%/}"

pass=0; fail=0
check() {   # check <name> <expected-status> <curl args...>
  local name="$1" expected="$2"; shift 2
  local status
  status=$(curl -sS -o /tmp/smoke-body -w '%{http_code}' --max-time 20 "$@" || echo 000)
  if [[ "$status" == "$expected" ]]; then
    echo "  PASS  $name -> $status"; pass=$((pass + 1))
  else
    echo "  FAIL  $name -> $status (expected $expected): $(head -c 300 /tmp/smoke-body 2>/dev/null)"; fail=$((fail + 1))
  fi
}

echo "API:      $API_URL"
echo "Frontend: ${FRONTEND_URL:-<skip>}"
echo "--- Public (ไม่ต้อง login)"
check "GET /profiles"           200 "$API_URL/profiles"
check "GET /workloads"          200 "$API_URL/workloads?academic_year=2567&semester=1"
check "GET /settings/deadline"  200 "$API_URL/settings/deadline"
check "CORS preflight"          200 -X OPTIONS -H "Origin: https://example.com" \
                                    -H "Access-Control-Request-Method: PUT" "$API_URL/workloads/x/y"
if [[ -n "$FRONTEND_URL" && "$FRONTEND_URL" != "None" ]]; then
  check "GET frontend index.html" 200 "${FRONTEND_URL%/}/index.html"
  check "GET frontend config.js"  200 "${FRONTEND_URL%/}/config.js"
fi

echo "--- Security (ต้องถูกปฏิเสธ)"
check "PUT ไม่มี Token -> 401"   401 -X PUT -H 'Content-Type: application/json' -d '{"workloads":{}}' \
                                    "$API_URL/workloads/prof_001/2599%239"
check "PUT deadline ไม่มี Token -> 401" 401 -X PUT -H 'Content-Type: application/json' \
                                    -d '{"mode":"extend_to_friday"}' "$API_URL/settings/deadline"

if [[ -n "${ID_TOKEN:-}" ]]; then
  FID="${FACULTY_ID:?ต้องระบุ FACULTY_ID ของเจ้าของ token}"
  TERM_ENC="${TEST_TERM//#/%23}"
  echo "--- Authenticated (${FID}, term ${TEST_TERM})"
  check "PUT workload ด้วย Token" 200 -X PUT -H "Authorization: Bearer $ID_TOKEN" -H 'Content-Type: application/json' \
        -d '{"academic_year":2599,"semester":9,"workloads":{}}' "$API_URL/workloads/$FID/$TERM_ENC"
  check "GET workload ที่เพิ่งสร้าง" 200 -H "Authorization: Bearer $ID_TOKEN" "$API_URL/workloads/$FID/$TERM_ENC"
  check "DELETE workload ทดสอบ"   200 -X DELETE -H "Authorization: Bearer $ID_TOKEN" "$API_URL/workloads/$FID/$TERM_ENC"
  echo "  (ถ้า PUT ได้ 403 DeadlinePassed แปลว่าเลยกำหนดส่งแล้ว — ขยายเวลาที่ Dashboard ก่อนทดสอบ)"
fi

echo "--- Result: $pass passed, $fail failed"
[[ $fail -eq 0 ]]