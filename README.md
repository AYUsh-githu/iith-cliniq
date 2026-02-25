# ClinIQ  
### AI-Assisted PDF to NHCX-Aligned FHIR Bundle Converter

---

## 1. Problem Statement

Healthcare institutions generate discharge summaries and diagnostic reports in PDF format.  
For ABDM interoperability and claim submission under NHCX, these documents must be converted into structured FHIR bundles aligned with NRCeS NHCX profiles.

Manual conversion is:

- Time-consuming  
- Error-prone  
- Technically complex  
- Not scalable  

### Objective

To significantly reduce manual effort required to convert PDF-based healthcare information into NHCX-aligned FHIR bundles, enabling faster onboarding and interoperability within the ABDM ecosystem.

---

## 2. Our Solution

**ClinIQ** is a full-stack system that:

1. Accepts discharge summaries or diagnostic reports (PDF/ZIP)
2. Extracts structured clinical data
3. Builds FHIR R4 bundles aligned to NHCX profiles
4. Validates bundles with compliance checks
5. Provides a review interface for human correction
6. Exports final FHIR bundle for submission

---

## 3. Key Features

### 1️⃣ PDF & ZIP Upload
- Supports 1–10 PDFs or a single ZIP
- File size validation
- Job-based processing

### 2️⃣ AI-Assisted Data Extraction
- NLP-based document type classification
- Structured field extraction
- Confidence scoring per document

### 3️⃣ FHIR Bundle Generation
- Diagnostic Report Builder
- Discharge Summary Builder
- Auto-mapping extracted fields to FHIR R4 resources
- Configurable and reusable architecture

### 4️⃣ NHCX Compliance Validation
- Required field checklist
- Error / Warning classification
- Bundle health score calculation
- Structured validation report

### 5️⃣ Human Review & Audit Logging
- Edit extracted fields
- Auto-regenerate FHIR bundle
- Field-level audit trail

### 6️⃣ Analytics Dashboard
- Job statistics
- Confidence averages
- Status distribution

---

## 4. System Architecture

### Frontend
- React
- TypeScript
- TailwindCSS
- Framer Motion

### Backend
- FastAPI
- SQLAlchemy
- Alembic
- PostgreSQL 
- Celery 
- Redis 

### Processing Flow

```text
PDF Upload → Extraction → FHIR Builder → Validation → Review → Export
```


---

## 5. How It Works (Processing Pipeline)

### Step 1 – Upload
User uploads discharge summary or diagnostic report.

### Step 2 – Job Creation
System:
- Creates Job record
- Stores Document entries
- Queues processing

### Step 3 – Data Extraction
- PDF parsing
- NLP-based classification
- Structured field generation
- Confidence scoring

### Step 4 – FHIR Generation
Depending on document type:
- DiagnosticReport Bundle
- DischargeSummary Bundle

### Step 5 – Validation
System checks:
- Required NHCX profile fields
- Structural integrity
- Resource references
- Severity categorization

### Step 6 – Human Review
User can:
- Edit extracted fields
- Trigger regeneration
- Revalidate

### Step 7 – Export
Final FHIR bundle generated as structured JSON file.

---

## 6. API Endpoints

| Endpoint | Method | Purpose |
|-----------|--------|----------|
| `/health` | GET | Health check |
| `/api/upload` | POST | Upload PDF/ZIP |
| `/api/jobs` | GET | List jobs |
| `/api/jobs/{id}` | GET | Job details |
| `/api/documents/{id}/validate` | POST | Trigger validation |
| `/api/documents/{id}/validation` | GET | Get validation report |
| `/api/documents/{id}/extracted` | PATCH | Edit extracted data |
| `/api/analytics` | GET | Dashboard metrics |
| `/api/export` | POST | Export FHIR bundle |

---

## 7. Setup Instructions

### 1️⃣ Clone Repository

```bash
git clone <repo-url>
cd iith-cliniq
```

### 2️⃣ Backend Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate   # Windows
pip install -r requirements.txt
python -m spacy download en_core_web_sm
alembic upgrade head
```

Create a .env file in the project root:

```bash
DATABASE_URL=postgresql://cliniq:cliniq@localhost/cliniq
REDIS_URL=redis://localhost:6379/0
ANTHROPIC_API_KEY=your_key_here
LLM_PROVIDER=anthropic
HAPI_VALIDATOR_URL=http://localhost:8090
```

Run backend:

```bash
uvicorn backend.main:app --reload
```

### 3️⃣ Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

---

## 8. Deliverables Included

- Complete Source Code (ZIP)
- Output FHIR JSON Bundles
- FHIR Mapping Excel Sheet
- Detailed README
- End-to-End Demo Video

---

## 9. Innovation & Value

- Reduces manual FHIR conversion effort significantly
- Configuration-driven architecture
- NHCX profile-aware validation
- Human-in-the-loop correction
- Extensible for other HMIS systems
- Production-ready scalable architecture

---

## 10. Conclusion

ClinIQ provides a scalable, interoperable, and AI-assisted framework to convert unstructured healthcare PDFs into NHCX-aligned FHIR bundles, accelerating ABDM ecosystem adoption and enabling faster claim processing.
