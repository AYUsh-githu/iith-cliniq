from typing import Any

from fhir.resources.bundle import Bundle


def build_discharge_summary_bundle(data: dict[str, Any]) -> Bundle:
    return Bundle(**data)

