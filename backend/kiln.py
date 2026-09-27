"""Internal contracts only. No official Kiln wire protocol is implemented."""
from dataclasses import dataclass, field
from datetime import datetime
from math import isfinite
import os
from typing import Mapping, Protocol
from fastapi import APIRouter

MODEL = "Qwen3-32B"
WAITING = "Kiln 팀 계정 및 API 접근권한을 기다리고 있습니다."


@dataclass(frozen=True)
class KilnSettings:
    base_url: str = field(default="", repr=False)
    api_key: str = field(default="", repr=False)
    model: str = MODEL
    timeout_seconds: float = 30.0
    valid: bool = True

    @classmethod
    def load(cls, env: Mapping[str, str] | None = None):
        source = os.environ if env is None else env
        model = source.get("KILN_MODEL", "").strip() or MODEL
        try:
            timeout = float(source.get("KILN_API_TIMEOUT_SECONDS", "").strip() or "30")
            valid = isfinite(timeout) and timeout > 0 and model == MODEL
        except ValueError:
            timeout, valid = 30.0, False
        return cls(source.get("KILN_API_BASE_URL", "").strip(),
                   source.get("KILN_API_KEY", "").strip(), MODEL, timeout, valid)

    @property
    def configured(self):
        return self.valid and bool(self.base_url and self.api_key)


@dataclass(frozen=True)
class KilnInput:
    """Internal domain input, NOT an official request JSON schema. Never log it."""
    purchase_instruction: str = field(repr=False)
    agricultural_evidence: tuple[str, ...] = field(repr=False)
    purpose: str = "purchase_review"


@dataclass(frozen=True)
class TokenUsage:
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None

    def for_audit(self):
        # Preserve absence, including total: do not estimate or sum missing values.
        return {name: value if value is not None else "제공되지 않음"
                for name, value in vars(self).items()}


@dataclass(frozen=True)
class KilnJudgment:
    """Future parsed result. Provider content is not log-safe by default."""
    decision: str = field(repr=False)
    usage: TokenUsage = field(default_factory=TokenUsage)


class KilnTransport(Protocol):
    """TODO official docs: URL, auth, payload, response mapping, enforced timeout.

    Implement only after docs and permission arrive. No production implementation
    or transport injection is enabled today. Do not log prompts or exceptions.
    """
    async def judge(self, request: KilnInput, settings: KilnSettings) -> KilnJudgment: ...


@dataclass(frozen=True)
class KilnAuditRecord:
    """Future real-call record schema only; never instantiated by the stub.

    TODO persist only an actual attempted provider call, with genuine timestamp/ID,
    verified provider usage and an allowlisted decision summary (not raw content).
    No prompt, credential, account, personal data or energy fields are permitted.
    """
    audit_id: str
    called_at: datetime
    stage: str
    purpose: str
    model: str
    usage: TokenUsage
    decision_summary: str
    success: bool


def stopped(code: str, message: str):
    return {"status": "STOP", "code": code, "message": message,
            "purchase_approved": False, "payment_allowed": False}


def safe_failure(error: Exception):
    # Never serialize str(error), endpoint, headers, body, or partial credentials.
    if isinstance(error, TimeoutError):
        return stopped("KILN_TIMEOUT", "Kiln 요청 시간이 초과되었습니다.")
    return stopped("KILN_ERROR", "Kiln 호출 오류로 중단되었습니다.")


class KilnAdapter:
    def __init__(self, settings: KilnSettings):
        self.settings = settings

    def status(self):
        return {"configured": self.settings.configured, "model": MODEL,
                "callable": False, "integration_implemented": False,
                "last_call_success": None, "last_error_summary": None,
                **self._unavailable()}

    def _unavailable(self):
        if not self.settings.configured:
            return stopped("KILN_NOT_CONFIGURED", WAITING)
        return stopped("KILN_PROTOCOL_NOT_IMPLEMENTED",
                       "공식 Kiln API 문서 확인 및 어댑터 구현이 필요합니다.")

    async def judge(self, request: KilnInput):
        # TODO connect official transport, timeout and safe_failure after review.
        # No network, alternate AI, audit records or purchasing side effects here.
        return self._unavailable()


router = APIRouter()


@router.get("/api/kiln/status")
def kiln_status():
    return KilnAdapter(KilnSettings.load()).status()
