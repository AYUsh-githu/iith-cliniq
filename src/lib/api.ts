/**
 * ClinIQ API Service Layer
 * All frontend → backend communication goes through these functions.
 */

const BASE = "/api";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE}${url}`, init);
    if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(body.detail || `API error ${res.status}`);
    }
    return res.json() as Promise<T>;
}

/* ─── Upload ─────────────────────────────────────────────── */

export interface UploadResponse {
    job_id: string;
    document_count: number;
    status: string;
}

export async function uploadDocuments(
    files: File[],
    useCase: "claim_submission" | "pre_authorisation" = "claim_submission"
): Promise<UploadResponse> {
    const form = new FormData();
    form.append("use_case", useCase);
    files.forEach((f) => form.append("files", f));
    return request<UploadResponse>("/upload", { method: "POST", body: form });
}

/* ─── Jobs ───────────────────────────────────────────────── */

export interface JobSummary {
    id: string;
    status: string;
    use_case: string;
    created_at: string;
    document_count: number;
    avg_confidence: number | null;
}

export interface JobListResponse {
    page: number;
    per_page: number;
    total: number;
    items: JobSummary[];
}

export async function listJobs(page = 1, perPage = 20): Promise<JobListResponse> {
    return request<JobListResponse>(`/jobs?page=${page}&per_page=${perPage}`);
}

export interface DocumentDetail {
    id: string;
    filename: string;
    status: string;
    doc_type: string;
    doc_type_confidence: number | null;
    created_at: string;
}

export interface JobDetail {
    id: string;
    status: string;
    use_case: string;
    created_at: string;
    updated_at: string;
    documents: DocumentDetail[];
}

export async function getJobDetail(jobId: string): Promise<JobDetail> {
    return request<JobDetail>(`/jobs/${jobId}`);
}

/* ─── Poll helper ────────────────────────────────────────── */

export async function pollJob(
    jobId: string,
    onProgress?: (job: JobDetail) => void,
    intervalMs = 2000,
    maxAttempts = 60
): Promise<JobDetail> {
    for (let i = 0; i < maxAttempts; i++) {
        const job = await getJobDetail(jobId);
        onProgress?.(job);
        if (job.status === "completed" || job.status === "failed") return job;
        await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error("Polling timed out");
}

/* ─── Analytics ──────────────────────────────────────────── */

export interface AnalyticsSummary {
    total_documents: number;
    total_jobs: number;
    avg_confidence: number;
    avg_processing_time_seconds: number;
    validation_pass_rate: number;
    doc_type_breakdown: Record<string, number>;
    time_saved_minutes: number;
    status_breakdown: Record<string, number>;
}

export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
    return request<AnalyticsSummary>("/analytics/summary");
}

/* ─── Extracted Data (Clinical Review) ───────────────────── */

export async function getExtractedData(docId: string): Promise<Record<string, any>> {
    return request<Record<string, any>>(`/documents/${docId}/extracted`);
}

export async function patchExtractedData(
    docId: string,
    data: Record<string, any>
): Promise<Record<string, any>> {
    return request<Record<string, any>>(`/documents/${docId}/extracted`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
}

/* ─── Validation ─────────────────────────────────────────── */

export interface ValidationReport {
    document_id: string;
    bundle_health_score: number;
    errors: any[];
    warnings: any[];
    info: any[];
    nhcx_compliance_checklist: any[];
    raw_report: any;
}

export async function triggerValidation(docId: string): Promise<{ status: string }> {
    return request<{ status: string }>(`/documents/${docId}/validate`, {
        method: "POST",
    });
}

export async function getValidationReport(docId: string): Promise<ValidationReport> {
    return request<ValidationReport>(`/documents/${docId}/validation`);
}

/* ─── Export / FHIR ──────────────────────────────────────── */

export async function downloadFHIR(docId: string): Promise<void> {
    const res = await fetch(`${BASE}/documents/${docId}/fhir/download`);
    if (!res.ok) throw new Error("Download failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${docId}_fhir_bundle.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export async function downloadJobBundle(jobId: string): Promise<void> {
    const res = await fetch(`${BASE}/jobs/${jobId}/fhir/bundle`);
    if (!res.ok) throw new Error("Download failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${jobId}_nhcx_claim_bundle.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export async function getDocumentFHIR(docId: string): Promise<any> {
    return request<any>(`/documents/${docId}/fhir`);
}

export interface ABDMSubmitResponse {
    status: string;
    abha_reference: string;
    timestamp: string;
}

export async function submitToABDM(docId: string): Promise<ABDMSubmitResponse> {
    return request<ABDMSubmitResponse>(`/documents/${docId}/submit-abdm`, {
        method: "POST",
    });
}

/* ─── Audit Log ──────────────────────────────────────────── */

export interface AuditEntry {
    timestamp: string;
    actor: string;
    action: string;
    field_path: string;
    old_value: string | null;
    new_value: string | null;
}

export async function getAuditLog(docId: string): Promise<AuditEntry[]> {
    return request<AuditEntry[]>(`/documents/${docId}/audit`);
}
