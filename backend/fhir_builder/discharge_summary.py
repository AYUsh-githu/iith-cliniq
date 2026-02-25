from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

from fhir.resources.bundle import Bundle


def build_discharge_summary_bundle(extracted: Dict[str, Any], document_id: str) -> Dict[str, Any]:
    """
    Build a FHIR R4 document Bundle for a hospital discharge summary.

    Returns a plain Python dict (Bundle.dict()) suitable for JSON serialization.
    """
    patient = extracted.get("patient") or {}
    admission = extracted.get("admission") or {}
    discharge = extracted.get("discharge") or {}
    physician = extracted.get("attending_physician") or {}
    diagnoses: List[Dict[str, Any]] = extracted.get("diagnoses") or []
    procedures: List[Dict[str, Any]] = extracted.get("procedures") or []
    medications: List[Dict[str, Any]] = extracted.get("medications_discharge") or []
    allergies: List[Dict[str, Any]] = extracted.get("allergies") or []
    vitals = extracted.get("vitals_at_discharge") or {}
    follow_up = extracted.get("follow_up") or {}

    # Logical IDs
    patient_id = "patient-" + document_id
    practitioner_id = "practitioner-" + document_id
    org_id = "org-hospital-" + document_id
    encounter_id = "encounter-" + document_id
    composition_id = "composition-" + document_id

    # Common references
    patient_ref = {"reference": f"Patient/{patient_id}"}
    practitioner_ref = {"reference": f"Practitioner/{practitioner_id}"}
    encounter_ref = {"reference": f"Encounter/{encounter_id}"}

    # Patient
    patient_resource: Dict[str, Any] = {
        "resourceType": "Patient",
        "id": patient_id,
        "name": [{"text": patient.get("name")}],
        "gender": (patient.get("gender") or "").lower() or None,
        "birthDate": patient.get("dob") or None,
        "address": [{"text": patient.get("address", "")}] if patient.get("address") else [],
        "identifier": [
            {"system": "urn:cliniq:patient-id", "value": patient.get("patient_id")},
            {"system": "urn:ndhm:abha-id", "value": patient.get("abha_id")},
        ],
    }

    # Practitioner (attending physician)
    practitioner_resource: Dict[str, Any] = {
        "resourceType": "Practitioner",
        "id": practitioner_id,
        "name": [{"text": physician.get("name")}],
        "identifier": [
            {
                "system": "urn:cliniq:registration-no",
                "value": physician.get("registration_no"),
            }
        ]
        if physician.get("registration_no")
        else [],
    }

    # Organization (hospital)
    org_resource: Dict[str, Any] = {
        "resourceType": "Organization",
        "id": org_id,
        "name": physician.get("hospital"),
    }

    # Encounter
    enc_resource: Dict[str, Any] = {
    "resourceType": "Encounter",
    "id": encounter_id,
    "status": "finished",
    "class": [
        {
            "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
            "code": "IMP",
            "display": "inpatient encounter",
        }
    ],
    "subject": patient_ref,
}
    # Conditions (diagnoses)
    condition_entries: List[Dict[str, Any]] = []
    condition_refs: List[Dict[str, str]] = []
    for idx, diag in enumerate(diagnoses):
        cond_id = f"condition-{idx + 1}-{document_id}"
        icd_code = diag.get("icd10_code") or ""
        description = diag.get("description") or ""
        diag_type = (diag.get("type") or "").lower()  # primary / secondary

        category_text = "primary" if diag_type == "primary" else "secondary"

        cond_resource: Dict[str, Any] = {
            "resourceType": "Condition",
            "id": cond_id,
            "clinicalStatus": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                        "code": "active",
                    }
                ]
            },
            "verificationStatus": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/condition-ver-status",
                        "code": "confirmed",
                    }
                ]
            },
            "category": [{"text": category_text}],
            "code": {
                "coding": [
                    {
                        "system": "http://hl7.org/fhir/sid/icd-10",
                        "code": icd_code or None,
                        "display": description or None,
                    }
                ],
                "text": description or None,
            },
            "subject": patient_ref,
            "encounter": encounter_ref,
        }

        condition_entries.append(
            {"fullUrl": f"urn:uuid:{cond_id}", "resource": cond_resource}
        )
        condition_refs.append({"reference": f"Condition/{cond_id}"})

    # Procedures
    procedure_entries: List[Dict[str, Any]] = []
    procedure_refs: List[Dict[str, str]] = []
    for idx, proc in enumerate(procedures):
        proc_id = f"procedure-{idx + 1}-{document_id}"
        snomed_code = proc.get("snomed_code") or ""
        description = proc.get("description") or ""

        proc_resource: Dict[str, Any] = {
            "resourceType": "Procedure",
            "id": proc_id,
            "status": "completed",
            "code": {
                "coding": [
                    {
                        "system": "http://snomed.info/sct",
                        "code": snomed_code or None,
                        "display": description or None,
                    }
                ],
                "text": description or None,
            },
            "subject": patient_ref,
            "encounter": encounter_ref,
            "performedDateTime": proc.get("date") or None,
        }

        procedure_entries.append(
            {"fullUrl": f"urn:uuid:{proc_id}", "resource": proc_resource}
        )
        procedure_refs.append({"reference": f"Procedure/{proc_id}"})

    # MedicationRequests (discharge medications)
    med_entries: List[Dict[str, Any]] = []
    med_refs: List[Dict[str, str]] = []
    for idx, med in enumerate(medications):
        med_id = f"medrequest-{idx + 1}-{document_id}"
        rxnorm = med.get("rxnorm_code") or ""
        name = med.get("name") or ""

        dose = med.get("dose") or ""
        route = med.get("route") or ""
        frequency = med.get("frequency") or ""
        duration = med.get("duration") or ""

        dosage_text_parts = [p for p in [dose, route, frequency, duration] if p]
        dosage_text = ", ".join(dosage_text_parts)

        medication_codeable: Dict[str, Any] = {
            "coding": [
                {
                    "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
                    "code": rxnorm or None,
                    "display": name or None,
                }
            ]
        }

        med_resource: Dict[str, Any] = {
            "resourceType": "MedicationRequest",
            "id": med_id,
            "status": "active",
            "intent": "order",
            "medicationCodeableConcept": medication_codeable,
            "subject": patient_ref,
            "encounter": encounter_ref,
            "dosageInstruction": [
                {
                    "text": dosage_text or None,
                }
            ],
        }

        med_entries.append({"fullUrl": f"urn:uuid:{med_id}", "resource": med_resource})
        med_refs.append({"reference": f"MedicationRequest/{med_id}"})

    # AllergyIntolerance
    allergy_entries: List[Dict[str, Any]] = []
    allergy_refs: List[Dict[str, str]] = []
    for idx, allergy in enumerate(allergies):
        allergy_id = f"allergy-{idx + 1}-{document_id}"

        reaction_text = allergy.get("reaction") or ""
        severity = allergy.get("severity") or ""

        allergy_resource: Dict[str, Any] = {
            "resourceType": "AllergyIntolerance",
            "id": allergy_id,
            "clinicalStatus": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
                        "code": "active",
                    }
                ]
            },
            "code": {
                "text": allergy.get("substance") or "",
            },
            "patient": patient_ref,
            "reaction": [
                {
                    "description": reaction_text or None,
                    "severity": severity or None,
                }
            ]
            if reaction_text or severity
            else [],
        }

        allergy_entries.append(
            {"fullUrl": f"urn:uuid:{allergy_id}", "resource": allergy_resource}
        )
        allergy_refs.append({"reference": f"AllergyIntolerance/{allergy_id}"})

    # Discharge vitals as Observations
    vitals_entries: List[Dict[str, Any]] = []
    vitals_refs: List[Dict[str, str]] = []

    def _add_vital(code: str, display: str, value: str, idx_suffix: str) -> None:
        if not value:
            return
        obs_id = f"vital-{idx_suffix}-{document_id}"
        obs_resource = {
            "resourceType": "Observation",
            "id": obs_id,
            "status": "final",
            "category": [
                {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                            "code": "vital-signs",
                        }
                    ]
                }
            ],
            "code": {
                "coding": [
                    {
                        "system": "http://loinc.org",
                        "code": code,
                        "display": display,
                    }
                ],
                "text": display,
            },
            "subject": patient_ref,
            "encounter": encounter_ref,
            "valueString": value,
        }
        vitals_entries.append(
            {"fullUrl": f"urn:uuid:{obs_id}", "resource": obs_resource}
        )
        vitals_refs.append({"reference": f"Observation/{obs_id}"})

    _add_vital("85354-9", "Blood pressure panel", vitals.get("bp", ""), "bp")
    _add_vital("8867-4", "Heart rate", vitals.get("pulse", ""), "pulse")
    _add_vital("8310-5", "Body temperature", vitals.get("temp", ""), "temp")
    _add_vital("59408-5", "Oxygen saturation", vitals.get("spo2", ""), "spo2")
    _add_vital("29463-7", "Body weight", vitals.get("weight", ""), "weight")

    # CarePlan for follow-up instructions
    careplan_id = "careplan-" + document_id
    careplan_resource: Dict[str, Any] = {
        "resourceType": "CarePlan",
        "id": careplan_id,
        "status": "active",
        "intent": "plan",
        "subject": patient_ref,
        "encounter": encounter_ref,
        "description": follow_up.get("instructions") or "",
    }
    careplan_entry = {
        "fullUrl": f"urn:uuid:{careplan_id}",
        "resource": careplan_resource,
    }
    careplan_ref = {"reference": f"CarePlan/{careplan_id}"}

    # Composition (Discharge Summary)
    composition_resource: Dict[str, Any] = {
        "resourceType": "Composition",
        "id": composition_id,
        "meta": {
            "profile": [
                "https://nrces.in/ndhm/fhir/r4/StructureDefinition/DischargeSummary"
            ]
        },
        "status": "final",
        "type": {
            "coding": [
                {
                    "system": "http://loinc.org",
                    "code": "18842-5",
                    "display": "Discharge summary",
                }
            ]
        },
        "date": discharge.get("date") or datetime.utcnow().date().isoformat(),
        "title": "Discharge Summary",
        "subject": [patient_ref],
        "encounter": encounter_ref,
        "author": [practitioner_ref],
        "section": [
            {
                "title": "Diagnoses",
                "code": {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": "11535-2",
                            "display": "Hospital discharge diagnosis",
                        }
                    ]
                },
                "entry": condition_refs,
            },
            {
                "title": "Procedures",
                "entry": procedure_refs,
            },
            {
                "title": "Medications on Discharge",
                "entry": med_refs,
            },
            {
                "title": "Allergies",
                "entry": allergy_refs,
            },
            {
                "title": "Vitals at Discharge",
                "entry": vitals_refs,
            },
            {
                "title": "Follow-up Plan",
                "entry": [careplan_ref],
            },
        ],
    }

    # Bundle (type=document) – Composition must be the first entry
    bundle_resource: Dict[str, Any] = {
        "resourceType": "Bundle",
        "type": "document",
        "identifier": {"value": document_id},
        "timestamp": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "entry": [
            {"fullUrl": f"urn:uuid:{composition_id}", "resource": composition_resource},
            {"fullUrl": f"urn:uuid:{patient_id}", "resource": patient_resource},
            {"fullUrl": f"urn:uuid:{practitioner_id}", "resource": practitioner_resource},
            {"fullUrl": f"urn:uuid:{org_id}", "resource": org_resource},
            {"fullUrl": f"urn:uuid:{encounter_id}", "resource": enc_resource},
            *condition_entries,
            *procedure_entries,
            *med_entries,
            *allergy_entries,
            *vitals_entries,
            careplan_entry,
        ],
    }

    def clean_bundle(obj):
        if isinstance(obj, dict):
            new = {}
            for k, v in obj.items():
                if v in ("", None, [], {}):
                    continue
                new[k] = clean_bundle(v)
            return new
        if isinstance(obj, list):
            return [clean_bundle(i) for i in obj if i not in ("", None, [], {})]
        return obj

    bundle_resource = clean_bundle(bundle_resource)

    return Bundle(**bundle_resource).dict()
