from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

from fhir.resources.bundle import Bundle


def build_diagnostic_report_bundle(extracted: Dict[str, Any], document_id: str) -> Dict[str, Any]:
    """
    Build a FHIR R4 document Bundle for a diagnostic report (lab).

    Returns a plain Python dict (Bundle.dict()) suitable for JSON serialization.
    """
    patient = extracted.get("patient") or {}
    physician = extracted.get("ordering_physician") or {}
    lab = extracted.get("lab") or {}
    specimen = extracted.get("specimen") or {}
    report_date = extracted.get("report_date") or ""
    results: List[Dict[str, Any]] = extracted.get("results") or []

    # Logical IDs
    patient_id = "patient-" + document_id
    practitioner_id = "practitioner-" + document_id
    org_id = "org-lab-" + document_id
    specimen_id = "specimen-" + document_id
    diag_report_id = "diagreport-" + document_id

    # Patient
    patient_resource: Dict[str, Any] = {
        "resourceType": "Patient",
        "id": patient_id,
        "name": [{"text": patient.get("name", "")}],
        "gender": (patient.get("gender") or "").lower() or None,
        "birthDate": patient.get("dob") or None,
        "identifier": [
            {"system": "urn:cliniq:patient-id", "value": patient.get("patient_id")}
        ]
        if patient.get("patient_id")
        else [],
        "telecom": [{"system": "phone", "value": patient.get("phone")}]
        if patient.get("phone")
        else [],
    }

    # Practitioner (ordering physician)
    practitioner_resource: Dict[str, Any] = {
        "resourceType": "Practitioner",
        "id": practitioner_id,
        "name": [{"text": physician.get("name", "")}],
        "identifier": [
            {
                "system": "urn:cliniq:registration-no",
                "value": physician.get("registration_no"),
            }
        ]
        if physician.get("registration_no")
        else [],
    }

    # Organization (lab)
    org_resource: Dict[str, Any] = {
        "resourceType": "Organization",
        "id": org_id,
        "name": lab.get("name", ""),
        "address": [{"text": lab.get("address", "")}] if lab.get("address") else [],
        "identifier": [
            {
                "system": "urn:cliniq:lab-accreditation",
                "value": lab.get("accreditation_no"),
            }
        ]
        if lab.get("accreditation_no")
        else [],
    }

    # Specimen
    specimen_resource: Dict[str, Any] = {
        "resourceType": "Specimen",
        "id": specimen_id,
        "type": {"text": specimen.get("type", "")} if specimen.get("type") else None,
        "subject": {"reference": f"Patient/{patient_id}"},
        "collection": {
            "collectedDateTime": specimen.get("collection_date") or None,
        },
        "receivedTime": specimen.get("received_date") or None,
    }

    # Observations for each lab result
    observation_entries: List[Dict[str, Any]] = []
    observation_refs: List[Dict[str, str]] = []
    for idx, res in enumerate(results):
        obs_id = f"observation-{idx + 1}-{document_id}"
        loinc_code = res.get("loinc_code") or ""
        test_name = res.get("test_name") or ""
        value_str = (res.get("value") or "").strip()
        unit = (res.get("unit") or "").strip()
        ref_range = (res.get("reference_range") or "").strip()
        flag = (res.get("flag") or "").upper()

        # Try to parse value as number if possible
        value_quantity: Dict[str, Any] | None = None
        if value_str:
            try:
                value_quantity = {
                    "value": float(value_str),
                    "unit": unit or None,
                }
            except ValueError:
                # Fallback: keep as text value
                value_quantity = None

        interpretation_coding: List[Dict[str, Any]] = []
        if flag in {"H", "L", "N"}:
            interpretation_coding.append(
                {
                    "system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
                    "code": flag,
                }
            )

        obs_resource: Dict[str, Any] = {
            "resourceType": "Observation",
            "id": obs_id,
            "status": "final",
            "category": [
                {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                            "code": "laboratory",
                        }
                    ]
                }
            ],
            "code": {
                "coding": [
                    {
                        "system": "http://loinc.org",
                        "code": loinc_code or None,
                        "display": test_name or None,
                    }
                ],
                "text": test_name or None,
            },
            "subject": {"reference": f"Patient/{patient_id}"},
            "effectiveDateTime": report_date or None,
            "valueQuantity": value_quantity,
            "referenceRange": [{"text": ref_range}] if ref_range else [],
            "interpretation": (
                [{"coding": interpretation_coding}] if interpretation_coding else []
            ),
        }

        observation_entries.append(
            {
                "fullUrl": f"urn:uuid:{obs_id}",
                "resource": obs_resource,
            }
        )
        observation_refs.append({"reference": f"Observation/{obs_id}"})

    # DiagnosticReport
    diag_report_resource: Dict[str, Any] = {
        "resourceType": "DiagnosticReport",
        "id": diag_report_id,
        "meta": {
            "profile": [
                "https://nrces.in/ndhm/fhir/r4/StructureDefinition/DiagnosticReportLab"
            ]
        },
        "status": "final",
        "category": [
            {
                "coding": [
                    {
                        "system": "http://loinc.org",
                        "code": "11502-2",
                        "display": "Laboratory studies (set)",
                    }
                ]
            }
        ],
        "code": {
            "coding": [
                {
                    "system": "http://loinc.org",
                    "code": "11502-2",
                    "display": "Laboratory studies (set)",
                }
            ]
        },
        "subject": {"reference": f"Patient/{patient_id}"},
        "performer": [{"reference": f"Organization/{org_id}"}],
        "effectiveDateTime": report_date or None,
        "result": observation_refs,
        "specimen": [{"reference": f"Specimen/{specimen_id}"}],
    }

    # Bundle (document)
    bundle_resource: Dict[str, Any] = {
        "resourceType": "Bundle",
        "type": "document",
        "identifier": {"value": document_id},
        "timestamp": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "entry": [
            {"fullUrl": f"urn:uuid:{patient_id}", "resource": patient_resource},
            {"fullUrl": f"urn:uuid:{practitioner_id}", "resource": practitioner_resource},
            {"fullUrl": f"urn:uuid:{org_id}", "resource": org_resource},
            {"fullUrl": f"urn:uuid:{specimen_id}", "resource": specimen_resource},
            {"fullUrl": f"urn:uuid:{diag_report_id}", "resource": diag_report_resource},
            *observation_entries,
        ],
    }

    # Validate via fhir.resources and return as dict
    return Bundle(**bundle_resource).dict()

