from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass
class ClassificationResult:
    doc_type: str
    confidence: float
    method: str
    reasoning: str = ""


class DocumentClassifier:
    """Two-stage document classifier: rule-based, then LLM fallback."""

    def __init__(self, llm_client: Optional[Any] = None) -> None:
        """
        Optionally accept an LLM client with a `classify_document(text: str) -> str` method
        that returns the JSON response described in the prompt.
        If not provided, LLM classification will be skipped.
        """
        self.llm_client = llm_client

    def classify(self, text: str) -> Dict[str, Any]:
        text_snippet = (text or "")[:1000].lower()

        rule_result = self._rule_based_classify(text_snippet)
        if rule_result and rule_result.confidence >= 0.85:
            return self._to_dict(rule_result)

        # Fallback to LLM if available
        if self.llm_client is not None:
            llm_result = self._llm_classify(text)
            if llm_result:
                return self._to_dict(llm_result)

        # If no LLM or it failed, return best rule-based guess or unknown
        if rule_result:
            return self._to_dict(rule_result)

        return {
            "doc_type": "unknown",
            "confidence": 0.0,
            "method": "rule_based",
            "reasoning": "No indicative patterns found and LLM unavailable.",
        }

    def _rule_based_classify(self, text_snippet: str) -> Optional[ClassificationResult]:
        # Discharge summary
        discharge_keywords = [
            "discharge summary",
            "date of discharge",
            "discharge diagnosis",
        ]
        if any(k in text_snippet for k in discharge_keywords):
            return ClassificationResult(
                doc_type="discharge_summary",
                confidence=0.9,
                method="rule_based",
                reasoning="Matched discharge summary keywords.",
            )

        # Diagnostic lab report
        lab_keywords = [
            "lab report",
            "haemoglobin",
            "hemoglobin",
            "cbc",
            "pathology report",
            "biochemistry",
        ]
        if any(k in text_snippet for k in lab_keywords):
            return ClassificationResult(
                doc_type="diagnostic_report_lab",
                confidence=0.9,
                method="rule_based",
                reasoning="Matched lab/biochemistry keywords.",
            )

        # Diagnostic imaging report
        imaging_keywords = [
            "x-ray",
            "x ray",
            "mri",
            "ct scan",
            "radiology",
            "impression:",
        ]
        if any(k in text_snippet for k in imaging_keywords):
            return ClassificationResult(
                doc_type="diagnostic_report_imaging",
                confidence=0.9,
                method="rule_based",
                reasoning="Matched imaging/radiology keywords.",
            )

        # Prescription
        prescription_keywords = [
            "prescription",
            "rx",
            "dispensed",
        ]
        if any(k in text_snippet for k in prescription_keywords):
            return ClassificationResult(
                doc_type="prescription",
                confidence=0.9,
                method="rule_based",
                reasoning="Matched prescription-related keywords.",
            )

        return None

    def _llm_classify(self, text: str) -> Optional[ClassificationResult]:
        prompt = (
            "Classify this clinical document as one of: "
            "discharge_summary, diagnostic_report_lab, diagnostic_report_imaging, "
            "prescription, health_document_record.\n"
            'Respond with JSON only: {"type": "...", "confidence": 0.0-1.0, "reasoning": "..."}\n\n'
            f"Document:\n{text[:4000]}"
        )

        try:
            raw_response = self.llm_client.classify_document(prompt)  # type: ignore[attr-defined]
        except Exception:
            return None

        try:
            data = json.loads(raw_response)
        except Exception:
            return None

        doc_type = str(data.get("type") or "unknown")
        confidence = float(data.get("confidence") or 0.0)
        reasoning = str(data.get("reasoning") or "")

        return ClassificationResult(
            doc_type=doc_type,
            confidence=confidence,
            method="llm",
            reasoning=reasoning,
        )

    @staticmethod
    def _to_dict(result: ClassificationResult) -> Dict[str, Any]:
        return {
            "doc_type": result.doc_type,
            "confidence": result.confidence,
            "method": result.method,
            "reasoning": result.reasoning,
        }

