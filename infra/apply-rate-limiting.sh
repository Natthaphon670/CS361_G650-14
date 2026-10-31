#!/usr/bin/env bash
# =============================================================================
# Issue 5.2: Rate Limiting สำหรับ Main API (/workloads, /profiles) ที่สร้างผ่าน Console
#
# สิ่งที่สคริปต์ทำ (รันซ้ำได้ — idempotent):
#   REST API  : 1) Stage throttling (ทุก method)  2) Throttling เข้มขึ้นที่ POST .../status
#               3) Usage Plan (throttle + quota รายวัน) ผูกกับ Stage + API Key
#               4) (ทางเลือก) REQUIRE_API_KEY=true บังคับ x-api-key ทุก method แล้ว redeploy
#   HTTP API  : Default route throttling + route throttling (HTTP API ไม่มี Usage Plans)
#
# ใช้งาน:
#   ./infra/apply-rate-limiting.sh                      # ค่า default ของโปรเจกต์
#   API_ID=xxxx STAGE=prod RATE=20 BURST=40 ./infra/apply-rate-limiting.sh
#   DRY_RUN=true ./infra/apply-rate-limiting.sh         # แสดงคำสั่งโดยไม่เปลี่ยนอะไร
#
# ต้องมี: aws cli v2 + สิทธิ์ apigateway:* บน API นี้
# =============================================================================
set -euo pipefail

API_ID="${API_ID:-qzleoa96f4}"
STAGE="${STAGE:-prod}"
REGION="${AWS_REGION:-${REGION:-us-east-1}}"

RATE="${RATE:-20}"                   # req/s ต่อ method (ทุก client รวมกัน)
BURST="${BURST:-40}"
SENSITIVE_RATE="${SENSITIVE_RATE:-5}" # Submit/Approve/Reject
SENSITIVE_BURST="${SENSITIVE_BURST:-10}"

PLAN_NAME="${PLAN_NAME:-cs361-faculty-workspace-plan}"
PLAN_RATE="${PLAN_RATE:-10}"         # ต่อ API key
PLAN_BURST="${PLAN_BURST:-20}"
PLAN_QUOTA="${PLAN_QUOTA:-10000}"    # requests / วัน / API key
KEY_NAME="${KEY_NAME:-cs361-web-frontend}"
REQUIRE_API_KEY="${REQUIRE_API_KEY:-false}"
DRY_RUN="${DRY_RUN:-false}"

# Resource ที่ต้องจำกัดเข้มขึ้น (escape '/' เป็น '~1' ตามรูปแบบ patch path ของ API Gateway)
SENSITIVE_METHOD_PATH='/~1workloads~1{faculty_id}~1{term_id}~1status/POST'
SENSITIVE_ROUTE_KEY='POST /workloads/{faculty_id}/{term_id}/status'

aws_() {
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[dry-run] aws $*" >&2
    echo "{}"
  else
    aws --region "$REGION" "$@"
  fi
}
log() { echo "==> $*" >&2; }

# -----------------------------------------------------------------------------
apply_rest() {
  log "REST API $API_ID / stage $STAGE: stage throttling ${RATE} rps, burst ${BURST}"
  aws_ apigateway update-stage --rest-api-id "$API_ID" --stage-name "$STAGE" --patch-operations \
    "op=replace,path=/*/*/throttling/rateLimit,value=${RATE}" \
    "op=replace,path=/*/*/throttling/burstLimit,value=${BURST}" >/dev/null

  log "Sensitive method ${SENSITIVE_ROUTE_KEY}: ${SENSITIVE_RATE} rps, burst ${SENSITIVE_BURST}"
  aws_ apigateway update-stage --rest-api-id "$API_ID" --stage-name "$STAGE" --patch-operations \
    "op=replace,path=${SENSITIVE_METHOD_PATH}/throttling/rateLimit,value=${SENSITIVE_RATE}" \
    "op=replace,path=${SENSITIVE_METHOD_PATH}/throttling/burstLimit,value=${SENSITIVE_BURST}" >/dev/null \
    || log "WARN: ไม่พบ method ${SENSITIVE_ROUTE_KEY} ข้ามขั้นตอนนี้"

  # --- Usage Plan (สร้างครั้งแรก / อัปเดตครั้งต่อไป) ---
  local plan_id
  plan_id=$(aws_ apigateway get-usage-plans --query "items[?name=='${PLAN_NAME}'].id | [0]" --output text 2>/dev/null || true)
  if [[ -z "$plan_id" || "$plan_id" == "None" || "$plan_id" == "{}" ]]; then
    log "Create usage plan ${PLAN_NAME}"
    plan_id=$(aws_ apigateway create-usage-plan --name "$PLAN_NAME" \
      --description "CS361 G650-14: throttle + daily quota per client key" \
      --api-stages "apiId=${API_ID},stage=${STAGE}" \
      --throttle "rateLimit=${PLAN_RATE},burstLimit=${PLAN_BURST}" \
      --quota "limit=${PLAN_QUOTA},period=DAY" --query id --output text)
  else
    log "Update usage plan ${PLAN_NAME} (${plan_id})"
    aws_ apigateway update-usage-plan --usage-plan-id "$plan_id" --patch-operations \
      "op=replace,path=/throttle/rateLimit,value=${PLAN_RATE}" \
      "op=replace,path=/throttle/burstLimit,value=${PLAN_BURST}" \
      "op=replace,path=/quota/limit,value=${PLAN_QUOTA}" \
      "op=replace,path=/quota/period,value=DAY" >/dev/null
    # ผูก stage หากยังไม่ได้ผูก (ถ้าผูกแล้ว API จะตอบ error ซึ่งไม่เป็นไร)
    aws_ apigateway update-usage-plan --usage-plan-id "$plan_id" --patch-operations \
      "op=add,path=/apiStages,value=${API_ID}:${STAGE}" >/dev/null 2>&1 || true
  fi

  # --- API Key สำหรับ Web Frontend ---
  local key_id
  key_id=$(aws_ apigateway get-api-keys --name-query "$KEY_NAME" --query "items[0].id" --output text 2>/dev/null || true)
  if [[ -z "$key_id" || "$key_id" == "None" || "$key_id" == "{}" ]]; then
    log "Create API key ${KEY_NAME}"
    key_id=$(aws_ apigateway create-api-key --name "$KEY_NAME" --enabled --query id --output text)
  fi
  aws_ apigateway create-usage-plan-key --usage-plan-id "$plan_id" --key-id "$key_id" --key-type API_KEY \
    >/dev/null 2>&1 || true   # ผูกแล้วจะ error ConflictException

  if [[ "$REQUIRE_API_KEY" == "true" ]]; then
    log "บังคับ apiKeyRequired=true ทุก method (ยกเว้น OPTIONS) แล้ว redeploy stage"
    aws_ apigateway get-resources --rest-api-id "$API_ID" --limit 500 \
      --query 'items[].[id, join(`,`, keys(resourceMethods || `{}`))]' --output text |
    while read -r res_id methods; do
      for m in ${methods//,/ }; do
        [[ "$m" == "OPTIONS" ]] && continue
        aws_ apigateway update-method --rest-api-id "$API_ID" --resource-id "$res_id" --http-method "$m" \
          --patch-operations "op=replace,path=/apiKeyRequired,value=true" >/dev/null
      done
    done
    aws_ apigateway create-deployment --rest-api-id "$API_ID" --stage-name "$STAGE" \
      --description "Issue 5.2: require API key" >/dev/null
    log "ใส่ค่า API key ใน config.js -> APP_CONFIG.api.apiKey:"
    aws_ apigateway get-api-key --api-key "$key_id" --include-value --query value --output text
  else
    log "Usage plan พร้อมแล้ว แต่ยังไม่บังคับ API key (REQUIRE_API_KEY=false)"
    log "  Stage throttling มีผลทันทีกับทุก request; quota ราย key จะมีผลเมื่อรันด้วย REQUIRE_API_KEY=true"
  fi
}

# -----------------------------------------------------------------------------
apply_http() {
  log "HTTP API $API_ID / stage $STAGE: default route throttling ${RATE} rps, burst ${BURST}"
  aws_ apigatewayv2 update-stage --api-id "$API_ID" --stage-name "$STAGE" \
    --default-route-settings "ThrottlingRateLimit=${RATE},ThrottlingBurstLimit=${BURST}" >/dev/null

  log "Route ${SENSITIVE_ROUTE_KEY}: ${SENSITIVE_RATE} rps, burst ${SENSITIVE_BURST}"
  aws_ apigatewayv2 update-stage --api-id "$API_ID" --stage-name "$STAGE" \
    --route-settings "{\"${SENSITIVE_ROUTE_KEY}\":{\"ThrottlingRateLimit\":${SENSITIVE_RATE},\"ThrottlingBurstLimit\":${SENSITIVE_BURST}}}" \
    >/dev/null || log "WARN: ไม่พบ route ${SENSITIVE_ROUTE_KEY} ข้ามขั้นตอนนี้"

  log "หมายเหตุ: HTTP API ไม่รองรับ Usage Plans/API keys — ถ้าต้องการ quota ราย client ต้องใช้ REST API"
}

# -----------------------------------------------------------------------------
if [[ "$DRY_RUN" == "true" ]]; then
  log "DRY_RUN: แสดงคำสั่งของ REST API"
  apply_rest
elif aws --region "$REGION" apigateway get-rest-api --rest-api-id "$API_ID" >/dev/null 2>&1; then
  apply_rest
elif aws --region "$REGION" apigatewayv2 get-api --api-id "$API_ID" >/dev/null 2>&1; then
  apply_http
else
  echo "ไม่พบ API ${API_ID} ใน region ${REGION} (หรือไม่มีสิทธิ์อ่าน)" >&2
  exit 1
fi
log "เสร็จสิ้น ทดสอบด้วย: node infra/load-test.mjs"
