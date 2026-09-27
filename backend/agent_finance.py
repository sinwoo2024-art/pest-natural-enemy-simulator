"""Isolated preparation workflow. No provider, payment or blockchain I/O."""
from datetime import datetime, timezone, timedelta
from contextlib import closing
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import sqlite3
from typing import Literal, Protocol
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

try:
    from .kiln import KilnAdapter, KilnSettings, MODEL
except ImportError:
    from kiln import KilnAdapter, KilnSettings, MODEL

AUDIT_PATH = Path(__file__).resolve().parents[1] / "tmp/runtime/finance-audit.sqlite3"
Money = Decimal


class Policy(BaseModel):
    model_config = ConfigDict(extra="forbid")
    budget: Money | None = Field(default=None, ge=0, le=10**12, decimal_places=2)
    max_spend: Money | None = Field(default=None, ge=0, le=10**12, decimal_places=2)
    fee: Money | None = Field(default=None, ge=0, le=10**12, decimal_places=2)
    sellers: list[str] = Field(default_factory=list, max_length=50)
    items: list[str] = Field(default_factory=list, max_length=50)
    deadline: datetime | None = None
    forbid_auto_purchase: bool = True
    require_human_approval: bool = True

    @field_validator("sellers", "items")
    @classmethod
    def bounded_labels(cls, values):
        if any(not v.strip() or len(v) > 120 for v in values):
            raise ValueError("Invalid list")
        return [v.strip() for v in values]

    @field_validator("deadline")
    @classmethod
    def aware_deadline(cls, value):
        if value is not None and value.tzinfo is None:
            raise ValueError("Timezone required")
        return value


class Candidate(BaseModel):
    """Internal proposal contract, NOT the official Kiln response schema."""
    item: str
    seller: str
    amount: Money = Field(ge=0, le=10**12, decimal_places=2)


class FinanceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    session_id: UUID
    action: Literal["generate", "approve", "reject", "stop"]
    scenario: Literal["user", "normal", "over_budget", "unapproved_seller"] = "user"
    policy: Policy = Field(default_factory=Policy)


def check_rules(policy: Policy, candidate: Candidate | None, *,
                evidence_verified: bool = False, human_approved: bool = False,
                stopped: bool = False, now: datetime | None = None):
    """Deterministic checks; relative risk is never an input to purchasing rules."""
    now = now or datetime.now(timezone.utc)
    total = candidate.amount + policy.fee if candidate and policy.fee is not None else None
    return {
        "budget": total <= policy.budget if total is not None and policy.budget is not None else None,
        "max_spend": total <= policy.max_spend if total is not None and policy.max_spend is not None else None,
        "seller": candidate.seller in policy.sellers if candidate else None,
        "item": candidate.item in policy.items if candidate else None,
        "deadline": policy.deadline >= now if policy.deadline is not None else None,
        "evidence": evidence_verified,
        # Human approval remains mandatory even if the preference is unchecked.
        "human_approval": human_approved,
        "not_stopped": not stopped,
    }


def execution_allowed(checks: dict) -> bool:
    return bool(checks) and all(value is True for value in checks.values())


class TestnetTransport(Protocol):
    """TODO official network/account, signing, submit format, receipt and failure handling.

    No implementation, network, wallet or private key is chosen here. Approval must
    be bound to an immutable proposal, revalidated, and checked against persistent
    STOP state before submission. A missing/failed receipt must result in STOP.
    """
    async def record(self, approval_hash: str) -> object: ...
    async def receipt(self, result: object) -> object: ...


def approval_record_hash(record: dict) -> str:
    """Hash only allowlisted approval fields, not secrets or prompt text. Not a tx hash."""
    safe = {key: record.get(key) for key in ("audit_id", "final_state", "action", "created_at")}
    return hashlib.sha256(json.dumps(safe, sort_keys=True).encode()).hexdigest()


def _conditions(policy: Policy):
    # No free-text input, account data, evidence text or prompts are persisted.
    def digest(values):
        return hashlib.sha256(json.dumps(sorted(values), ensure_ascii=True).encode()).hexdigest()
    return {"budget": str(policy.budget) if policy.budget is not None else None,
            "max_spend": str(policy.max_spend) if policy.max_spend is not None else None,
            "fee": str(policy.fee) if policy.fee is not None else None,
            "deadline": policy.deadline.isoformat() if policy.deadline else None,
            "seller_count": len(policy.sellers), "seller_list_hash": digest(policy.sellers),
            "item_count": len(policy.items), "item_list_hash": digest(policy.items),
            "forbid_auto_purchase": policy.forbid_auto_purchase,
            "require_human_approval": policy.require_human_approval}


def review(request: FinanceRequest, path: Path = AUDIT_PATH):
    """Records a real user/rules action, NEVER an invented model call or transaction."""
    now = datetime.now(timezone.utc)
    policy, candidate = request.policy, None
    demo = request.scenario != "user"
    if demo:
        # Explicit rule-demo inputs, never returned as an AI proposal.
        policy = Policy(budget=100, max_spend=100, fee=5,
                        sellers=["규칙검사용 판매처"], items=["규칙검사용 품목"],
                        deadline=now + timedelta(days=1))
        candidate = Candidate(item=policy.items[0], seller=policy.sellers[0], amount=90)
        if request.scenario == "over_budget":
            candidate.amount = Decimal(101)
        if request.scenario == "unapproved_seller":
            candidate.seller = "허용되지 않은 규칙검사용 판매처"

    path.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(path, timeout=5)) as db:
        db.execute("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, stopped INTEGER NOT NULL)")
        db.execute("CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, payload TEXT NOT NULL)")
        db.execute("BEGIN IMMEDIATE")
        if db.execute("SELECT COUNT(*) FROM audit").fetchone()[0] >= 10000:
            raise sqlite3.OperationalError("Audit capacity reached")
        sid = str(request.session_id)
        db.execute("INSERT OR IGNORE INTO sessions VALUES (?, 0)", (sid,))
        if request.action in ("stop", "reject"):
            db.execute("UPDATE sessions SET stopped=1 WHERE id=?", (sid,))
        halted = bool(db.execute("SELECT stopped FROM sessions WHERE id=?", (sid,)).fetchone()[0])
        checks = check_rules(policy, candidate, stopped=halted, now=now)
        status = KilnAdapter(KilnSettings.load()).status()  # status only; never judge()
        code, message = status["code"], status["message"]
        concrete_failures = [key for key in ("budget", "max_spend", "seller", "item", "deadline")
                             if checks[key] is False]
        if concrete_failures:
            code, message = "RULE_" + concrete_failures[0].upper(), "일반 코드 구매 조건 검사에서 차단되었습니다."
        if halted:
            code = "USER_REJECTED" if request.action == "reject" else "AGENT_STOPPED"
            message = "에이전트가 중단되었습니다. 이 세션에서는 실행할 수 없습니다."
        elif request.action == "approve":
            code, message = "NO_VERIFIED_PROPOSAL", "검증된 실제 제안이 없어 구매 승인과 실행을 차단했습니다."
        # TODO only action=generate may call the official Kiln adapter, AFTER all
        # preflight checks and server-verified agricultural evidence. Validate its
        # parsed proposal AGAIN with check_rules. Never call from status/research.
        # TODO authenticated proposal-bound human approval, idempotency and durable
        # STOP checks are required before enabling the official testnet transport.
        record = {"audit_id": str(uuid4()), "created_at": now.isoformat(),
                  "conditions": _conditions(policy), "checks": checks,
                  "action": request.action, "scenario": request.scenario,
                  "kiln_called": False, "kiln_call_count": 0, "model": MODEL,
                  "purpose": "purchase_proposal", "tokens": "제공되지 않음",
                  "blockchain_execution": "없음", "final_state": code}
        db.execute("INSERT INTO audit VALUES (?, ?)",
                   (record["audit_id"], json.dumps(record, ensure_ascii=False)))
        db.commit()
    return {"status": "STOP", "code": code, "message": message,
            "proposal": None, "purchase_approved": False, "payment_allowed": False,
            "kiln_call_count": 0, "blockchain_execution": "없음",
            "testnet_status": "지정 테스트넷 정보 대기 중", "audit": record,
            "demo_notice": "규칙 검사용 입력입니다. AI 제안·실제 구매가 아닙니다." if demo else None}


router = APIRouter()


@router.post("/api/agent-finance/review")
async def finance_review(request: Request):
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > 32768:
            raise HTTPException(413, "입력 크기 제한을 초과했습니다.")
    try:
        data = FinanceRequest.model_validate_json(raw)
    except (ValidationError, ValueError):
        # Never echo the submitted body or validation input (may contain a secret).
        raise HTTPException(422, "입력 형식·금액·기한을 확인하세요.") from None
    try:
        return review(data)
    except (sqlite3.Error, OSError):
        raise HTTPException(503, "감사 기록을 저장할 수 없어 실행을 중단했습니다.") from None
