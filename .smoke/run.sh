#!/usr/bin/env bash
set -uo pipefail
cd /vercel/share/v0-project
DEPLOY="https://v0-rip-new-project-j3b6wekdk-kevinalyk-gmailcoms-projects.vercel.app"

login() {
  local email="$1" tok=""
  for attempt in 1 2 3 4 5; do
    resp=$(vercel curl "/api/mobile/v1/auth/login" --deployment "$DEPLOY" -- --silent --request POST --header "Content-Type: application/json" --data "{\"email\":\"$email\",\"password\":\"SmokeTest123!Aa\"}")
    tok=$(echo "$resp" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).accessToken||'')}catch(e){console.log('')}})")
    if [ -n "$tok" ]; then echo "$tok"; return 0; fi
    sleep 3
  done
  echo "LOGIN FAILED for $email: $resp" >&2
  return 1
}

echo "Logging in fresh (mobile access tokens are 15m TTL)..."
TOKEN_A=$(login "mobile_feed_filter_smoke_test_user_a@example.invalid")
sleep 2
TOKEN_B=$(login "mobile_feed_filter_smoke_test_user_b@example.invalid")
if [ -z "$TOKEN_A" ] || [ -z "$TOKEN_B" ]; then
  echo "LOGIN FAILED, aborting"
  exit 1
fi
echo "Login OK, tokens acquired."
E_REP="MOBILE_FEED_FILTER_SMOKE_TEST_entity_rep"
E_DEM="MOBILE_FEED_FILTER_SMOKE_TEST_entity_dem"
E_IND="MOBILE_FEED_FILTER_SMOKE_TEST_entity_ind"
E_INDLEG="MOBILE_FEED_FILTER_SMOKE_TEST_entity_ind_legacy"
E_ORG="MOBILE_FEED_FILTER_SMOKE_TEST_entity_org"
E_BROKER="MOBILE_FEED_FILTER_SMOKE_TEST_entity_broker"

# call <label> <token> <path-with-query>
call() {
  local label="$1" token="$2" path="$3"
  local out status attempt
  for attempt in 1 2 3; do
    out=$(vercel curl "$path" --deployment "$DEPLOY" -- --silent --write-out "\n__STATUS__%{http_code}" --header "Authorization: Bearer $token" 2>/tmp/curl_err.log)
    status=$(echo "$out" | grep -o '__STATUS__[0-9]*' | tail -1 | sed 's/__STATUS__//')
    if [ -n "$status" ]; then break; fi
    sleep 2
  done
  body=$(echo "$out" | sed 's/__STATUS__[0-9]*$//' | grep -v '^__STATUS__')
  echo "### $label -> HTTP $status"
  if [ -z "$status" ]; then cat /tmp/curl_err.log; fi
  echo "$body" | head -c 2000
  echo ""
  echo "---"
  sleep 1.5
}

echo "=========================================="
echo "1. FILTERS METADATA"
echo "=========================================="
call "GET /feed/filters (User A)" "$TOKEN_A" "/api/mobile/v1/feed/filters"

echo "=========================================="
echo "2. entityType (data_broker bypass attempt must yield ZERO rows)"
echo "=========================================="
call "entityType=data_broker" "$TOKEN_A" "/api/mobile/v1/feed?entityType=data_broker"
call "no filter (broker must never appear)" "$TOKEN_A" "/api/mobile/v1/feed"

echo "=========================================="
echo "3. party incl. independent/legacy 'ind' aliasing"
echo "=========================================="
call "party=independent" "$TOKEN_A" "/api/mobile/v1/feed?party=independent"
call "party=republican" "$TOKEN_A" "/api/mobile/v1/feed?party=republican"

echo "=========================================="
echo "4. state filter"
echo "=========================================="
call "state=CA" "$TOKEN_A" "/api/mobile/v1/feed?state=CA"

echo "=========================================="
echo "5. entityId repeatable filter"
echo "=========================================="
call "entityId=REP&entityId=DEM" "$TOKEN_A" "/api/mobile/v1/feed?entityId=$E_REP&entityId=$E_DEM"

echo "=========================================="
echo "6. messageType combinations"
echo "=========================================="
call "messageType=email" "$TOKEN_A" "/api/mobile/v1/feed?messageType=email"
call "messageType=sms" "$TOKEN_A" "/api/mobile/v1/feed?messageType=sms"
call "messageType=bogus (expect 400)" "$TOKEN_A" "/api/mobile/v1/feed?messageType=bogus"

echo "=========================================="
echo "7. Third Party / House File incl. legacy null classification + both-selected"
echo "=========================================="
call "thirdParty=true" "$TOKEN_A" "/api/mobile/v1/feed?thirdParty=true"
call "houseFileOnly=true" "$TOKEN_A" "/api/mobile/v1/feed?houseFileOnly=true"
call "thirdParty=true&houseFileOnly=true (both=no restriction)" "$TOKEN_A" "/api/mobile/v1/feed?thirdParty=true&houseFileOnly=true"

echo "=========================================="
echo "8. donation platforms (all 6) + domain fallback"
echo "=========================================="
call "donationPlatform=winred" "$TOKEN_A" "/api/mobile/v1/feed?donationPlatform=winred"
call "donationPlatform=actblue" "$TOKEN_A" "/api/mobile/v1/feed?donationPlatform=actblue"
call "donationPlatform=anedot (ctaLinks domain fallback)" "$TOKEN_A" "/api/mobile/v1/feed?donationPlatform=anedot"
call "donationPlatform=psq" "$TOKEN_A" "/api/mobile/v1/feed?donationPlatform=psq"
call "donationPlatform=ngpvan (ctaLinks domain fallback)" "$TOKEN_A" "/api/mobile/v1/feed?donationPlatform=ngpvan"
call "donationPlatform=substack (sender-domain)" "$TOKEN_A" "/api/mobile/v1/feed?donationPlatform=substack"
call "donationPlatform=bogus (expect 400)" "$TOKEN_A" "/api/mobile/v1/feed?donationPlatform=bogus"

echo "=========================================="
echo "9. inclusive date range + validation"
echo "=========================================="
FROM=$(node -e "console.log(new Date(Date.now()-6*86400000).toISOString().slice(0,10))")
TO=$(node -e "console.log(new Date(Date.now()-3*86400000).toISOString().slice(0,10))")
call "fromDate=$FROM&toDate=$TO" "$TOKEN_A" "/api/mobile/v1/feed?fromDate=$FROM&toDate=$TO"
call "fromDate>toDate (expect 400)" "$TOKEN_A" "/api/mobile/v1/feed?fromDate=2026-09-10&toDate=2026-09-01"
call "malformed date (expect 400)" "$TOKEN_A" "/api/mobile/v1/feed?fromDate=not-a-date"

echo "=========================================="
echo "10. retention-window clamp (client dataRetentionDays=30, campaign at 40 days must be excluded)"
echo "=========================================="
call "entityId=REP no date filter (c6 @40d must be absent, c1 @5d + c2 @10d present)" "$TOKEN_A" "/api/mobile/v1/feed?entityId=$E_REP"

echo "=========================================="
echo "11. tag filter"
echo "=========================================="
call "tag=SmokeTag" "$TOKEN_A" "/api/mobile/v1/feed?tag=SmokeTag"

echo "=========================================="
echo "12. subscriptionsOnly incl. intersection + cross-client leakage"
echo "=========================================="
call "subscriptionsOnly=true (User A, subscribed to DEM)" "$TOKEN_A" "/api/mobile/v1/feed?subscriptionsOnly=true"
call "subscriptionsOnly=true (User B, no subs -> must be EMPTY, not User A's)" "$TOKEN_B" "/api/mobile/v1/feed?subscriptionsOnly=true"
call "tag=SmokeTag&subscriptionsOnly=true (intersection, expect EMPTY: tag=INDLEG, sub=DEM don't overlap)" "$TOKEN_A" "/api/mobile/v1/feed?tag=SmokeTag&subscriptionsOnly=true"

echo "=========================================="
echo "13. search"
echo "=========================================="
call "search=house%20file" "$TOKEN_A" "/api/mobile/v1/feed?search=house%20file"

echo "=========================================="
echo "14. cursor pagination"
echo "=========================================="
call "no filter page 1 (small feed, expect all items no cursor needed)" "$TOKEN_A" "/api/mobile/v1/feed"
call "malformed cursor (expect 400)" "$TOKEN_A" "/api/mobile/v1/feed?cursor=not-base64json"

echo "=========================================="
echo "15. auth edge cases"
echo "=========================================="
echo "### missing Authorization header"
out=$(vercel curl "/api/mobile/v1/feed" --deployment "$DEPLOY" -- --silent --write-out "\n__STATUS__%{http_code}" 2>/tmp/curl_err2.log)
echo "$out" | tail -c 500
echo "---"
call "malformed bearer token" "not-a-real-token" "/api/mobile/v1/feed"
