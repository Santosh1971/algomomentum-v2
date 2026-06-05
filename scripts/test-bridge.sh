#!/bin/bash
# AlgoMomentum Bridge v2 — Automated End-to-End Test Script
# Usage: bash scripts/test-bridge.sh [BASE_URL] [WEBHOOK_TOKEN]

BASE_URL="${1:-https://algomomentum-v2-production-7e76.up.railway.app}"
WEBHOOK_TOKEN="${2:-}"

GREEN="\033[0;32m"; RED="\033[0;31m"; YELLOW="\033[1;33m"; NC="\033[0m"
PASS=0; FAIL=0

check() {
  local name="$1"; local result="$2"; local expected="$3"
  if echo "$result" | grep -q "$expected"; then
    echo -e "${GREEN}PASS${NC}: $name"; PASS=$((PASS+1))
  else
    echo -e "${RED}FAIL${NC}: $name"
    echo "   Expected to contain: $expected"
    echo "   Got: $(echo $result | cut -c1-200)"
    FAIL=$((FAIL+1))
  fi
}

echo ""
echo "======================================="
echo "  AlgoMomentum Bridge v2 - Test Suite"
echo "  Target: $BASE_URL"
echo "======================================="
echo ""

echo -e "${YELLOW}Phase 1: Infrastructure${NC}"
R=$(curl -s "$BASE_URL/api/v1/myip")
check "Server IP endpoint" "$R" "ip"
R=$(curl -s "$BASE_URL/api/v1/script")
check "Symbols list" "$R" "symbol"
R=$(curl -s "$BASE_URL/api/v1/candles?symbol=BTCUSD&resolution=15m&limit=5")
check "Candles API" "$R" "candles"

echo ""
echo -e "${YELLOW}Phase 2: Auth protection${NC}"
R=$(curl -s "$BASE_URL/api/v1/accounts")
check "Accounts requires auth" "$R" "Unauthorized"
R=$(curl -s "$BASE_URL/api/v1/tradeconfig")
check "TradeConfig requires auth" "$R" "Unauthorized"
R=$(curl -s "$BASE_URL/api/v1/admin/users")
check "Admin route requires auth" "$R" "Unauthorized\|Admin only"

echo ""
echo -e "${YELLOW}Phase 3: Webhook routing${NC}"
R=$(curl -s -X POST "$BASE_URL/api/v1/webhook/token/invalidtoken999" -H "Content-Type: application/json" -d "{"side":"buy","trade":"ENTRY 1 buy"}")
check "Invalid token rejected" "$R" "Invalid webhook token\|error"
R=$(curl -s -X POST "$BASE_URL/api/v1/webhook/BTCUSD" -H "Content-Type: application/json" -d "{"side":"buy","trade":"INVALID"}")
check "Invalid trade type rejected" "$R" "Invalid trade type"
R=$(curl -s -X POST "$BASE_URL/api/v1/webhook/BTCUSD" -H "Content-Type: application/json" -d "{"side":"buy","trade":"ENTRY 1 buy"}")
check "Symbol webhook responds" "$R" "success"

echo ""
if [ -n "$WEBHOOK_TOKEN" ]; then
  echo -e "${YELLOW}Phase 4: Live Token Webhook${NC}"
  R=$(curl -s -X POST "$BASE_URL/api/v1/webhook/token/$WEBHOOK_TOKEN" -H "Content-Type: application/json" -d "{"side":"buy","trade":"ENTRY 1 buy"}")
  check "Token webhook ENTRY" "$R" "success"
  echo "   Response: $R"
  sleep 3
  R=$(curl -s -X POST "$BASE_URL/api/v1/webhook/token/$WEBHOOK_TOKEN" -H "Content-Type: application/json" -d "{"side":"sell","trade":"EXIT 1 buy"}")
  check "Token webhook EXIT" "$R" "success\|No open position"
  echo "   Response: $R"
else
  echo -e "${YELLOW}Phase 4: Skipped - provide webhook token as 2nd argument${NC}"
fi

echo ""
echo "======================================="
echo -e "  PASS: ${GREEN}$PASS${NC}  FAIL: ${RED}$FAIL${NC}"
echo "======================================="
if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}All tests passed! Ready for live testing.${NC}"
else
  echo -e "${RED}$FAIL test(s) failed. Fix before going live.${NC}"
fi
