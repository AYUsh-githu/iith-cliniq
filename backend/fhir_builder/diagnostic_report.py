from typing import Any

from fhir.resources.diagnosticreport import DiagnosticReport


def build_diagnostic_report(data: dict[str, Any]) -> DiagnosticReport:
    return DiagnosticReport(**data)

