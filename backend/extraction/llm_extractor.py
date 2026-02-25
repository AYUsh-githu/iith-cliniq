from __future__ import annotations

import json
import time
from typing import Any, Dict

import httpx

from backend.config import settings


class LLMExtractor:
    """LLM-based structured data extractor for clinical documents."""

    def __init__(self) -> None:
        self.provider = settings.LLM_PROVIDER

    # -------------------------------------------------------------------------
    # Public API
    # -------------------------------------------------------------------------
    def extract_diagnostic_report(self, sections: Dict[str, Any], raw_text: str) -> Dict[str, Any]:
        """Extract structured data from a diagnostic report (lab or imaging)."""
        prompt = self._build_diagnostic_prompt(sections, raw_text)
        response_text = self._call_llm_with_retry(prompt)

        if not response_text:
            # Fallback minimal structure
            result: Dict[str, Any] = {
                "patient": {},
                "ordering_physician": {},
                "lab": {},
                "specimen": {},
                "report_date": "",
                "results": [],
                "interpretation": "",
                "overall_confidence": 0.0,
            }
            return result

        try:
            data = json.loads(response_text)
        except Exception:
            data = {}

        # Ensure base shape
        data.setdefault("patient", {})
        data.setdefault("ordering_physician", {})
        data.setdefault("lab", {})
        data.setdefault("specimen", {})
        data.setdefault("report_date", "")
        data.setdefault("results", [])
        data.setdefault("interpretation", "")
        data.setdefault("overall_confidence", 0.0)

        return self._validate_citations(raw_text, data)

    def extract_discharge_summary(self, sections: Dict[str, Any], raw_text: str) -> Dict[str, Any]:
        """Extract structured data from a discharge summary."""
        prompt = self._build_discharge_prompt(sections, raw_text)
        response_text = self._call_llm_with_retry(prompt)

        if not response_text:
            result: Dict[str, Any] = {
                "patient": {},
                "admission": {},
                "discharge": {},
                "attending_physician": {},
                "diagnoses": [],
                "procedures": [],
                "medications_discharge": [],
                "allergies": [],
                "vitals_at_discharge": {},
                "follow_up": {},
                "overall_confidence": 0.0,
            }
            return result

        try:
            data = json.loads(response_text)
        except Exception:
            data = {}

        data.setdefault("patient", {})
        data.setdefault("admission", {})
        data.setdefault("discharge", {})
        data.setdefault("attending_physician", {})
        data.setdefault("diagnoses", [])
        data.setdefault("procedures", [])
        data.setdefault("medications_discharge", [])
        data.setdefault("allergies", [])
        data.setdefault("vitals_at_discharge", {})
        data.setdefault("follow_up", {})
        data.setdefault("overall_confidence", 0.0)

        return self._validate_citations(raw_text, data)

    # -------------------------------------------------------------------------
    # Prompt builders
    # -------------------------------------------------------------------------
    def _build_diagnostic_prompt(self, sections: Dict[str, Any], raw_text: str) -> str:
        sections_json = json.dumps(sections, ensure_ascii=False, indent=2)
        truncated_text = self._truncate_text(raw_text)

        schema = """
{
  "patient": {"name": "", "age": "", "gender": "", "dob": "", "patient_id": "", "phone": ""},
  "ordering_physician": {"name": "", "registration_no": "", "department": ""},
  "lab": {"name": "", "address": "", "accreditation_no": ""},
  "specimen": {"type": "", "collection_date": "", "received_date": ""},
  "report_date": "",
  "results": [
    {
      "test_name": "",
      "value": "",
      "unit": "",
      "reference_range": "",
      "flag": "H"|"L"|"N"|"",
      "loinc_code": "",
      "confidence": 0.0
    }
  ],
  "interpretation": "",
  "overall_confidence": 0.0
}
""".strip()

        prompt = (
            "You are a clinical information extraction system.\n"
            "Extract key information from the following diagnostic report.\n"
            "Use both the raw text and pre-detected sections.\n\n"
            f"Sections JSON:\n```json\n{sections_json}\n```\n\n"
            f"Raw text (truncated):\n```text\n{truncated_text}\n```\n\n"
            "Return ONLY a JSON object in the following schema, no explanations:\n"
            f"{schema}\n"
            "All free-text values must be copied verbatim from the input text (no paraphrasing).\n"
            "For each result, set 'confidence' between 0 and 1 based on how certain you are.\n"
        )
        return prompt

    def _build_discharge_prompt(self, sections: Dict[str, Any], raw_text: str) -> str:
        sections_json = json.dumps(sections, ensure_ascii=False, indent=2)
        truncated_text = self._truncate_text(raw_text)

        schema = """
{
  "patient": {"name": "", "age": "", "gender": "", "dob": "", "patient_id": "", "abha_id": "", "address": ""},
  "admission": {"date": "", "time": "", "ward": "", "bed_no": "", "ip_no": ""},
  "discharge": {"date": "", "time": "", "condition": "improved"|"stable"|"expired"|"transferred"},
  "attending_physician": {"name": "", "registration_no": "", "department": "", "hospital": ""},
  "diagnoses": [{"description": "", "icd10_code": "", "type": "primary"|"secondary", "confidence": 0.0}],
  "procedures": [{"description": "", "snomed_code": "", "date": "", "confidence": 0.0}],
  "medications_discharge": [{"name": "", "dose": "", "route": "", "frequency": "", "duration": "", "rxnorm_code": "", "confidence": 0.0}],
  "allergies": [{"substance": "", "reaction": "", "severity": ""}],
  "vitals_at_discharge": {"bp": "", "pulse": "", "temp": "", "spo2": "", "weight": ""},
  "follow_up": {"instructions": "", "date": "", "with": ""},
  "overall_confidence": 0.0
}
""".strip()

        prompt = (
            "You are a clinical information extraction system.\n"
            "Extract key information from the following hospital discharge summary.\n"
            "Use both the raw text and pre-detected sections.\n\n"
            f"Sections JSON:\n```json\n{sections_json}\n```\n\n"
            f"Raw text (truncated):\n```text\n{truncated_text}\n```\n\n"
            "Return ONLY a JSON object in the following schema, no explanations:\n"
            f"{schema}\n"
            "All free-text values must be copied verbatim from the input text (no paraphrasing).\n"
            "For items with 'confidence', set a value between 0 and 1 based on how certain you are.\n"
        )
        return prompt

    # -------------------------------------------------------------------------
    # LLM invocation with retry
    # -------------------------------------------------------------------------
    def _call_llm_with_retry(self, prompt: str) -> str:
        max_retries = 3
        backoff_base = 1.0

        last_error: Exception | None = None

        for attempt in range(max_retries):
            try:
                return self._call_llm(prompt)
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                if attempt == max_retries - 1:
                    break
                sleep_for = backoff_base * (2 ** attempt)
                time.sleep(sleep_for)

        # If all retries fail, return empty string so caller can fall back.
        return ""

    def _call_llm(self, prompt: str) -> str:
        provider = (self.provider or "").lower()
        if provider == "anthropic":
            return self._call_anthropic(prompt)
        if provider == "openai":
            return self._call_openai(prompt)
        if provider == "ollama":
            return self._call_ollama(prompt)

        raise RuntimeError(f"Unsupported LLM_PROVIDER: {self.provider}")

    def _call_anthropic(self, prompt: str) -> str:
        if not settings.ANTHROPIC_API_KEY:
            raise RuntimeError("ANTHROPIC_API_KEY is not configured.")

        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": settings.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        payload = {
            "model": "claude-3-5-sonnet-latest",
            "max_tokens": 2048,
            "messages": [{"role": "user", "content": prompt}],
        }

        with httpx.Client(timeout=60.0) as client:
            resp = client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()

        content = data.get("content") or []
        if content and isinstance(content, list):
            first = content[0]
            if isinstance(first, dict):
                return first.get("text", "")
        return ""

    def _call_openai(self, prompt: str) -> str:
        if not settings.OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY is not configured.")

        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": "gpt-4o",
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {"type": "json_object"},
            "max_tokens": 2048,
        }

        with httpx.Client(timeout=60.0) as client:
            resp = client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()

        choices = data.get("choices") or []
        if choices:
            message = choices[0].get("message", {})
            return message.get("content", "") or ""
        return ""

    def _call_ollama(self, prompt: str) -> str:
        base_url = settings.OLLAMA_URL.rstrip("/")
        url = f"{base_url}/api/chat"

        payload = {
            "model": "llama3.1",
            "messages": [
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            "stream": False,
        }

        with httpx.Client(timeout=60.0) as client:
            resp = client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()

        message = data.get("message") or {}
        if isinstance(message, dict):
            return message.get("content", "") or ""
        return ""

    # -------------------------------------------------------------------------
    # Helpers
    # -------------------------------------------------------------------------
    @staticmethod
    def _truncate_text(text: str, max_chars: int = 4000) -> str:
        if not text:
            return ""
        if len(text) <= max_chars:
            return text
        return text[:max_chars]

    def _validate_citations(self, raw_text: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        For each extracted value, verify the exact string appears in raw_text.
        If not found, and the surrounding object has a 'confidence' field,
        set confidence to 0.3 (at most) and add 'unverified': true.
        """
        raw_text = raw_text or ""

        def walk(node: Any) -> bool:
            any_unverified_here = False

            if isinstance(node, dict):
                # First walk children
                for value in node.values():
                    if walk(value):
                        any_unverified_here = True

                # Then check local string fields
                for value in node.values():
                    if isinstance(value, str) and value.strip():
                        if value not in raw_text:
                            any_unverified_here = True

                if any_unverified_here and "confidence" in node:
                    conf = node.get("confidence")
                    if isinstance(conf, (int, float)) and conf > 0.3:
                        node["confidence"] = 0.3
                    node["unverified"] = True
                return any_unverified_here

            if isinstance(node, list):
                for item in node:
                    if walk(item):
                        any_unverified_here = True
                return any_unverified_here

            return False

        walk(data)
        return data

