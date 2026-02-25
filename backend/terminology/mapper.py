from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import yaml


BASE_LOINC: Dict[str, Tuple[str, str]] = {
    # Hematology
    "haemoglobin": ("718-7", "Hemoglobin [Mass/volume] in Blood"),
    "hemoglobin": ("718-7", "Hemoglobin [Mass/volume] in Blood"),
    "wbc": ("6690-2", "Leukocytes [#/volume] in Blood"),
    "total wbc": ("6690-2", "Leukocytes [#/volume] in Blood"),
    "leucocytes": ("6690-2", "Leukocytes [#/volume] in Blood"),
    "platelet count": ("777-3", "Platelets [#/volume] in Blood"),
    "rbc": ("789-8", "Erythrocytes [#/volume] in Blood"),
    "pcv": ("4544-3", "Hematocrit [Volume Fraction] of Blood"),
    "mcv": ("787-2", "MCV [Entitic volume] by Automated count"),
    "mch": ("785-6", "MCH [Entitic mass] by Automated count"),
    "mchc": ("786-4", "MCHC [Mass/volume] by Automated count"),
    "esr": ("30341-2", "Erythrocyte sedimentation rate"),
    # Renal
    "creatinine": ("2160-0", "Creatinine [Mass/volume] in Serum or Plasma"),
    "blood urea": ("3094-0", "Urea nitrogen [Mass/volume] in Serum or Plasma"),
    "urea": ("3094-0", "Urea nitrogen [Mass/volume] in Serum or Plasma"),
    "uric acid": ("3084-1", "Urate [Mass/volume] in Serum or Plasma"),
    # Glucose / Diabetes
    "blood glucose fasting": ("1558-6", "Glucose [Mass/volume] in Serum or Plasma -- fasting"),
    "fasting blood sugar": ("1558-6", "Glucose [Mass/volume] in Serum or Plasma -- fasting"),
    "fbs": ("1558-6", "Glucose [Mass/volume] in Serum or Plasma -- fasting"),
    "blood glucose pp": ("20436-2", "Glucose [Mass/volume] in Serum or Plasma -- post meal"),
    "ppbs": ("20436-2", "Glucose [Mass/volume] in Serum or Plasma -- post meal"),
    "random blood sugar": ("2339-0", "Glucose [Mass/volume] in Blood"),
    "rbs": ("2339-0", "Glucose [Mass/volume] in Blood"),
    "hba1c": ("4548-4", "Hemoglobin A1c/Hemoglobin.total in Blood"),
    # Thyroid
    "tsh": ("3016-3", "Thyrotropin [Units/volume] in Serum or Plasma"),
    "t3": ("3053-6", "Triiodothyronine (T3) [Mass/volume] in Serum or Plasma"),
    "t4": ("3026-2", "Thyroxine (T4) [Mass/volume] in Serum or Plasma"),
    "free t3": ("3051-0", "Triiodothyronine (T3) Free [Moles/volume] in Serum or Plasma"),
    "free t4": ("3024-7", "Thyroxine (T4) Free [Moles/volume] in Serum or Plasma"),
    # Electrolytes
    "sodium": ("2951-2", "Sodium [Moles/volume] in Serum or Plasma"),
    "potassium": ("2823-3", "Potassium [Moles/volume] in Serum or Plasma"),
    "chloride": ("2075-0", "Chloride [Moles/volume] in Serum or Plasma"),
    "calcium": ("17861-6", "Calcium [Mass/volume] in Serum or Plasma"),
    "magnesium": ("19123-9", "Magnesium [Mass/volume] in Serum or Plasma"),
    "phosphorus": ("2777-1", "Phosphate [Mass/volume] in Serum or Plasma"),
    # Liver function tests
    "alt": ("1742-6", "Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma"),
    "sgpt": ("1742-6", "Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma"),
    "ast": ("1920-8", "Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma"),
    "sgot": ("1920-8", "Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma"),
    "total bilirubin": ("1975-2", "Bilirubin.total [Mass/volume] in Serum or Plasma"),
    "direct bilirubin": ("1968-7", "Bilirubin.direct [Mass/volume] in Serum or Plasma"),
    "indirect bilirubin": ("1971-1", "Bilirubin.indirect [Mass/volume] in Serum or Plasma"),
    "alkaline phosphatase": ("6768-6", "Alkaline phosphatase [Enzymatic activity/volume] in Serum or Plasma"),
    "ggt": ("2324-2", "Gamma glutamyl transferase [Enzymatic activity/volume] in Serum or Plasma"),
    "total protein": ("2885-2", "Protein [Mass/volume] in Serum or Plasma"),
    "albumin": ("1751-7", "Albumin [Mass/volume] in Serum or Plasma"),
    # Lipid profile
    "total cholesterol": ("2093-3", "Cholesterol [Mass/volume] in Serum or Plasma"),
    "hdl": ("2085-9", "Cholesterol in HDL [Mass/volume] in Serum or Plasma"),
    "ldl": ("13457-7", "Cholesterol in LDL [Mass/volume] in Serum or Plasma"),
    "triglycerides": ("2571-8", "Triglyceride [Mass/volume] in Serum or Plasma"),
    "vldl": ("3043-7", "Cholesterol in VLDL [Mass/volume] in Serum or Plasma"),
    # Others
    "crp": ("1988-5", "C reactive protein [Mass/volume] in Serum or Plasma"),
    "vitamin d": ("62292-8", "25-hydroxyvitamin D3 [Mass/volume] in Serum or Plasma"),
    "vitamin b12": ("2132-9", "Cobalamin (Vitamin B12) [Mass/volume] in Serum or Plasma"),
    "serum iron": ("2498-4", "Iron [Mass/volume] in Serum or Plasma"),
    "tibc": ("2500-7", "Iron binding capacity.total [Mass/volume] in Serum or Plasma"),
    "ferritin": ("2276-4", "Ferritin [Mass/volume] in Serum or Plasma"),
}


BASE_ICD10: Dict[str, Tuple[str, str]] = {
    "type 2 diabetes": ("E11", "Type 2 diabetes mellitus"),
    "t2dm": ("E11", "Type 2 diabetes mellitus"),
    "diabetes mellitus type 2": ("E11", "Type 2 diabetes mellitus"),
    "hypertension": ("I10", "Essential (primary) hypertension"),
    "htn": ("I10", "Essential (primary) hypertension"),
    "acute myocardial infarction": ("I21", "Acute myocardial infarction"),
    "ami": ("I21", "Acute myocardial infarction"),
    "heart attack": ("I21", "Acute myocardial infarction"),
    "pneumonia": ("J18.9", "Pneumonia, unspecified organism"),
    "copd": ("J44.1", "Chronic obstructive pulmonary disease with acute exacerbation"),
    "chronic obstructive pulmonary disease": ("J44.9", "Chronic obstructive pulmonary disease, unspecified"),
    "ckd": ("N18", "Chronic kidney disease"),
    "chronic kidney disease": ("N18", "Chronic kidney disease"),
    "hypothyroidism": ("E03.9", "Hypothyroidism, unspecified"),
    "anaemia": ("D64.9", "Anemia, unspecified"),
    "anemia": ("D64.9", "Anemia, unspecified"),
    "dengue": ("A97", "Dengue"),
    "typhoid": ("A01.0", "Typhoid fever"),
    "acute gastroenteritis": ("A09", "Infectious gastroenteritis and colitis"),
    "urinary tract infection": ("N39.0", "Urinary tract infection, site not specified"),
    "uti": ("N39.0", "Urinary tract infection, site not specified"),
    "acute appendicitis": ("K35.80", "Acute appendicitis"),
    "acute pancreatitis": ("K85.9", "Acute pancreatitis, unspecified"),
    "cholelithiasis": ("K80.20", "Calculus of gallbladder without cholecystitis"),
    "cholecystitis": ("K81.0", "Acute cholecystitis"),
    "non alcoholic fatty liver disease": ("K76.0", "Fatty (change of) liver, not elsewhere classified"),
    "nafld": ("K76.0", "Fatty (change of) liver, not elsewhere classified"),
    "stroke": ("I63.9", "Cerebral infarction, unspecified"),
    "cva": ("I63.9", "Cerebral infarction, unspecified"),
    "tuberculosis": ("A16.9", "Respiratory tuberculosis, unspecified"),
    "pulmonary tuberculosis": ("A16.0", "Tuberculosis of lung"),
    "asthma": ("J45.9", "Asthma, unspecified"),
    "osteoarthritis knee": ("M17.9", "Osteoarthritis of knee, unspecified"),
    "osteoarthritis": ("M19.90", "Osteoarthritis, unspecified site"),
    "rheumatoid arthritis": ("M06.9", "Rheumatoid arthritis, unspecified"),
    "acute kidney injury": ("N17.9", "Acute kidney failure, unspecified"),
    "aki": ("N17.9", "Acute kidney failure, unspecified"),
    "myocardial infarction": ("I21", "Acute myocardial infarction"),
    "sepsis": ("A41.9", "Sepsis, unspecified organism"),
    "septic shock": ("R65.21", "Severe sepsis with septic shock"),
    "covid 19": ("U07.1", "COVID-19, virus identified"),
    "covid-19": ("U07.1", "COVID-19, virus identified"),
    "malaria": ("B54", "Malaria, unspecified"),
    "viral hepatitis b": ("B18.1", "Chronic viral hepatitis B"),
    "viral hepatitis c": ("B18.2", "Chronic viral hepatitis C"),
    "hyperlipidemia": ("E78.5", "Hyperlipidemia, unspecified"),
    "dyslipidemia": ("E78.5", "Hyperlipidemia, unspecified"),
    "obesity": ("E66.9", "Obesity, unspecified"),
    "iron deficiency anemia": ("D50.9", "Iron deficiency anemia, unspecified"),
    "migraine": ("G43.9", "Migraine, unspecified"),
    "depression": ("F32.9", "Major depressive disorder, single episode, unspecified"),
}


@dataclass
class MappingResult:
    code: Optional[str]
    display: str
    confidence: float


class TerminologyMapper:
    """Terminology mapper for lab tests (LOINC) and diagnoses (ICD-10)."""

    def __init__(self, configs_dir: Optional[Path] = None) -> None:
        if configs_dir is None:
            configs_dir = Path(__file__).resolve().parents[1] / "configs"
        self.configs_dir = configs_dir

        self._loinc_overrides: Dict[str, Tuple[str, str]] = {}
        self._icd10_overrides: Dict[str, Tuple[str, str]] = {}

        self._load_yaml_configs()

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #
    def map_lab_test(self, test_name: str) -> Dict[str, Any]:
        """Map a lab test name to LOINC using fuzzy matching + overrides."""
        normalized = self._normalize(test_name)

        result = self._lookup_with_fuzzy(
            normalized=normalized,
            original=test_name,
            base_map=BASE_LOINC,
            overrides=self._loinc_overrides,
        )

        return {
            "loinc_code": result.code,
            "display": result.display,
            "confidence": result.confidence,
        }

    def map_diagnosis(self, diagnosis: str) -> Dict[str, Any]:
        """Map a diagnosis description to ICD-10 using fuzzy matching + overrides."""
        normalized = self._normalize(diagnosis)

        result = self._lookup_with_fuzzy(
            normalized=normalized,
            original=diagnosis,
            base_map=BASE_ICD10,
            overrides=self._icd10_overrides,
        )

        return {
            "icd10_code": result.code,
            "display": result.display,
            "confidence": result.confidence,
        }

    # ------------------------------------------------------------------ #
    # Internal helpers
    # ------------------------------------------------------------------ #
    def _load_yaml_configs(self) -> None:
        """Load additional mappings from YAML files under configs/."""
        if not self.configs_dir.exists():
            return

        for path in sorted(self.configs_dir.glob("*.yaml")):
            try:
                content = path.read_text(encoding="utf-8")
                data = yaml.safe_load(content) or {}
            except Exception:
                continue

            loinc_over = data.get("loinc_overrides", {}) or {}
            for name, info in loinc_over.items():
                if isinstance(info, dict):
                    code = str(info.get("code") or "")
                    display = str(info.get("display") or name)
                else:
                    code = str(info)
                    display = name
                if code:
                    self._loinc_overrides[self._normalize(name)] = (code, display)

            icd_over = data.get("icd10_overrides", {}) or {}
            for name, info in icd_over.items():
                if isinstance(info, dict):
                    code = str(info.get("code") or "")
                    display = str(info.get("display") or name)
                else:
                    code = str(info)
                    display = name
                if code:
                    self._icd10_overrides[self._normalize(name)] = (code, display)

            hospital_terms = data.get("hospital_specific_terms", {}) or {}
            for name, info in hospital_terms.items():
                if not isinstance(info, dict):
                    continue
                norm = self._normalize(name)
                loinc_code = info.get("loinc_code")
                icd_code = info.get("icd10_code")
                display = info.get("display") or name
                if loinc_code:
                    self._loinc_overrides[norm] = (str(loinc_code), str(display))
                if icd_code:
                    self._icd10_overrides[norm] = (str(icd_code), str(display))

    @staticmethod
    def _normalize(text: str) -> str:
        return " ".join(text.lower().strip().replace("_", " ").split())

    def _lookup_with_fuzzy(
        self,
        normalized: str,
        original: str,
        base_map: Dict[str, Tuple[str, str]],
        overrides: Dict[str, Tuple[str, str]],
    ) -> MappingResult:
        # 1. Overrides first
        best = self._best_match(normalized, overrides)
        if best:
            code, display, conf = best
            return MappingResult(code=code, display=display, confidence=conf)

        # 2. Base mappings
        best = self._best_match(normalized, base_map)
        if best:
            code, display, conf = best
            return MappingResult(code=code, display=display, confidence=conf)

        return MappingResult(code=None, display=original, confidence=0.0)

    def _best_match(
        self,
        normalized: str,
        mapping: Dict[str, Tuple[str, str]],
    ) -> Optional[Tuple[str, str, float]]:
        """
        Fuzzy matching: check if query is substring of key or vice versa, case-insensitive.
        Prefer exact matches; then substring matches.
        """
        if not normalized:
            return None

        exact_match: Optional[Tuple[str, str]] = None
        substring_match: Optional[Tuple[str, str]] = None

        for key, (code, display) in mapping.items():
            key_norm = self._normalize(key)

            if normalized == key_norm:
                exact_match = (code, display)
                break

            if normalized in key_norm or key_norm in normalized:
                if not substring_match:
                    substring_match = (code, display)

        if exact_match:
            code, display = exact_match
            return code, display, 0.98
        if substring_match:
            code, display = substring_match
            return code, display, 0.9
        return None

