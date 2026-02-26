def classify_document(text: str) -> str:
    lower = text.lower()
    if "laboratory" in lower or "radiology" in lower or "diagnostic" in lower:
        return "DiagnosticReport"
    return "DischargeSummary"

