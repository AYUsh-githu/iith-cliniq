from __future__ import annotations

import re
from typing import Dict


DISCHARGE_SECTIONS = {
    "chief_complaint": [
        r"\bchief\s+complaint\b",
        r"\bchief\s+complaints\b",
        r"\bcheif\s+complaint\b",
    ],
    "history_of_present_illness": [
        r"\bhistory\s+of\s+present\s+illness\b",
        r"\bHOPI\b",
    ],
    "past_medical_history": [
        r"\bpast\s+medical\s+history\b",
        r"\bPMH\b",
    ],
    "medications_on_admission": [
        r"\bmedications?\s+on\s+admission\b",
        r"\bdrugs\s+on\s+admission\b",
    ],
    "examination": [
        r"\bexamination\b",
        r"\bclinical\s+examination\b",
        r"\bgeneral\s+examination\b",
    ],
    "investigations": [
        r"\binvestigations\b",
        r"\blaboratory\s+investigations\b",
    ],
    "diagnosis": [
        r"\bdiagnosis\b",
        r"\bfinal\s+diagnosis\b",
        r"\bprovisional\s+diagnosis\b",
    ],
    "procedures": [
        r"\bprocedures?\b",
        r"\boperations?\b",
        r"\bsurger(?:y|ies)\b",
    ],
    "medications_on_discharge": [
        r"\bmedications?\s+on\s+discharge\b",
        r"\bdischarge\s+medications?\b",
    ],
    "discharge_instructions": [
        r"\bdischarge\s+instructions\b",
        r"\badvice\s+on\s+discharge\b",
    ],
    "follow_up": [
        r"\bfollow\s*[- ]?up\b",
        r"\bfollow\s*up\s+advice\b",
    ],
}


DIAGNOSTIC_SECTIONS = {
    "patient_info": [
        r"\bpatient\s+information\b",
        r"\bpatient\s+details\b",
    ],
    "test_details": [
        r"\btest\s+details\b",
        r"\btest\s+information\b",
        r"\binvestigation\s+details\b",
    ],
    "results_table": [
        r"\bresults?\b",
        r"\btest\s+results\b",
        r"\breport\s+details\b",
    ],
    "interpretation": [
        r"\binterpretation\b",
        r"\bimpression\b",
        r"\bcomments?\b",
    ],
    "authorised_by": [
        r"\bauthorised\s+by\b",
        r"\breported\s+by\b",
        r"\bsigned\s+by\b",
    ],
}


def _compile_patterns(section_map):
    compiled = {}
    for name, patterns in section_map.items():
        compiled[name] = [re.compile(p, re.IGNORECASE | re.MULTILINE) for p in patterns]
    return compiled


COMPILED_DISCHARGE = _compile_patterns(DISCHARGE_SECTIONS)
COMPILED_DIAGNOSTIC = _compile_patterns(DIAGNOSTIC_SECTIONS)


def detect_sections(text: str, doc_type: str) -> Dict[str, str]:
    doc_type = doc_type.lower()
    if "discharge" in doc_type:
        primary = COMPILED_DISCHARGE
    else:
        primary = COMPILED_DIAGNOSTIC

    sections = _regex_based_sections(text, primary)

    # LLM fallback hook – can be implemented once LLM pipeline is wired.
    missing = [name for name, value in sections.items() if not value.strip()]
    if missing:
        try:
            from backend.llm import infer_sections  # type: ignore[import]

            llm_suggestions = infer_sections(text=text, doc_type=doc_type, missing_sections=missing)
            for name, value in llm_suggestions.items():
                if name in sections and not sections[name].strip() and value:
                    sections[name] = value
        except Exception:
            # If LLM is not configured or fails, regex-only result is returned.
            pass

    return sections


def _regex_based_sections(text: str, compiled_map) -> Dict[str, str]:
    headings = []
    for name, patterns in compiled_map.items():
        for pattern in patterns:
            for match in pattern.finditer(text):
                headings.append((match.start(), match.end(), name))

    headings.sort(key=lambda x: x[0])

    sections: Dict[str, str] = {name: "" for name in compiled_map.keys()}
    if not headings:
        return sections

    for idx, (start, end, name) in enumerate(headings):
        section_start = start
        section_end = headings[idx + 1][0] if idx + 1 < len(headings) else len(text)
        section_text = text[section_start:section_end].strip()

        if sections[name]:
            sections[name] = f"{sections[name].rstrip()}\n\n{section_text}"
        else:
            sections[name] = section_text

    return sections

