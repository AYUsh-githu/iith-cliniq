import { useState, useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Upload, FileText, Check,
  ChevronRight, Eye, Download, ToggleLeft, ToggleRight, Zap
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  uploadDocuments,
  pollJob,
  listJobs,
  getAnalyticsSummary,
  downloadFHIR,
  type JobSummary,
  type JobDetail,
  type AnalyticsSummary,
} from "@/lib/api";

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };

function UploadCard({
  title,
  description,
  useCase,
  onUpload,
}: {
  title: string;
  description: string;
  useCase: "claim_submission" | "pre_authorisation";
  onUpload: (files: File[], useCase: string) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).filter(
      (f) => f.name.endsWith(".pdf") || f.name.endsWith(".zip")
    );
    if (files.length === 0) return;
    setUploaded(true);
    onUpload(files, useCase);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      processFiles(e.dataTransfer.files);
    },
    [useCase]
  );

  const handleClick = () => fileInputRef.current?.click();

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.15 }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={handleClick}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
      className={`relative min-h-[200px] rounded-lg border-2 border-dashed cursor-pointer transition-all duration-200 overflow-hidden ${uploaded
          ? "border-success bg-success/5"
          : isDragging
            ? "border-primary bg-surface-elevated"
            : "border-border hover:border-primary/60 bg-surface"
        }`}
      style={{
        background: !uploaded
          ? `radial-gradient(circle at ${mousePos.x}px ${mousePos.y}px, hsl(243 76% 59% / 0.05), transparent 50%), hsl(var(--surface))`
          : undefined,
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.zip"
        multiple
        className="hidden"
        onChange={(e) => processFiles(e.target.files)}
      />
      <div className="absolute inset-0 card-shadow rounded-lg pointer-events-none" />
      <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-3">
        {uploaded ? (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-success/20 flex items-center justify-center">
              <Check className="w-6 h-6 text-success" />
            </div>
            <span className="text-body text-success font-medium">Uploaded — processing…</span>
          </motion.div>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Upload className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-body font-medium text-foreground">{title}</p>
              <p className="text-caption text-muted-foreground mt-1">{description}</p>
            </div>
            <p className="text-caption text-muted-foreground mt-2">
              Drop file or <span className="text-primary underline">click to browse</span>
            </p>
          </>
        )}
      </div>
    </motion.div>
  );
}

function PipelineTracker({ active, label }: { active: number; label?: string }) {
  const steps = ["OCR Extract", "Classify", "LLM Parse", "FHIR Build", "Validate"];
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-2"
    >
      {label && (
        <p className="text-caption text-muted-foreground">{label}</p>
      )}
      <div className="flex items-center gap-1">
        {steps.map((step, i) => (
          <div key={step} className="flex items-center gap-1 flex-1">
            <div
              className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-[11px] font-medium transition-all duration-300 w-full ${i < active
                  ? "bg-success/20 text-success"
                  : i === active
                    ? "bg-primary/20 text-primary animate-pulse"
                    : "bg-surface-elevated text-muted-foreground"
                }`}
            >
              {i < active ? (
                <Check className="w-3 h-3" />
              ) : i === active ? (
                <Zap className="w-3 h-3" />
              ) : null}
              {step}
            </div>
            {i < steps.length - 1 && (
              <ChevronRight
                className={`w-3 h-3 flex-shrink-0 ${i < active ? "text-success" : "text-muted-foreground/30"
                  }`}
              />
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function getConfidenceColor(c: number) {
  if (c >= 90) return "text-success";
  if (c >= 70) return "text-warning";
  return "text-destructive";
}

function getStatusStyle(s: string) {
  switch (s) {
    case "completed":
      return "bg-success/20 text-success";
    case "processing":
      return "bg-warning/20 text-warning";
    case "queued":
      return "bg-primary/20 text-primary";
    case "failed":
      return "bg-destructive/20 text-destructive";
    default:
      return "bg-muted/20 text-muted-foreground";
  }
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [stats, setStats] = useState<AnalyticsSummary | null>(null);
  const [claimMode, setClaimMode] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pipelineStage, setPipelineStage] = useState(-1);
  const [pipelineLabel, setPipelineLabel] = useState("");

  // Load recent jobs + analytics on mount
  useEffect(() => {
    listJobs(1, 12)
      .then((res) => setJobs(res.items))
      .catch(() => { });
    getAnalyticsSummary()
      .then(setStats)
      .catch(() => { });
  }, []);

  const handleUpload = async (files: File[], useCase: string) => {
    if (uploading) return;
    setUploading(true);
    setPipelineStage(0);
    setPipelineLabel(`Processing ${files.map((f) => f.name).join(", ")}`);
    try {
      const { job_id } = await uploadDocuments(
        files,
        useCase as "claim_submission" | "pre_authorisation"
      );
      toast({ title: "Upload successful", description: `Job ${job_id} created` });

      // Poll for completion
      const job = await pollJob(job_id, (j) => {
        // Map statuses to pipeline stages
        const docStatuses = j.documents.map((d) => d.status);
        if (docStatuses.some((s) => s === "extracting")) setPipelineStage(0);
        else if (docStatuses.some((s) => s === "classifying")) setPipelineStage(1);
        else if (docStatuses.some((s) => s === "parsing")) setPipelineStage(2);
        else if (docStatuses.some((s) => s === "building_fhir")) setPipelineStage(3);
        else if (docStatuses.some((s) => s === "validating")) setPipelineStage(4);
        else if (j.status === "completed" || j.status === "failed") setPipelineStage(5);
        else setPipelineStage(0);
      });

      if (job.status === "completed" && job.documents.length > 0) {
        toast({ title: "Processing complete!", description: "Navigating to review…" });
        navigate(`/review?docId=${job.documents[0].id}`);
      } else if (job.status === "failed") {
        toast({ title: "Processing failed", description: "Check server logs", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Upload error", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (job: JobSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // We need a document ID; fetch job detail to get first doc
      const detail = await (await fetch(`/api/jobs/${job.id}`)).json();
      if (detail.documents?.length > 0) {
        await downloadFHIR(detail.documents[0].id);
        toast({ title: "Downloading FHIR bundle" });
      }
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="min-h-[280px] flex flex-col justify-center">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-display gradient-text mb-3"
        >
          Turn Clinical PDFs into FHIR — Instantly
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-body text-muted-foreground max-w-xl"
        >
          Upload discharge summaries and diagnostic reports. Get ABDM/NHCX-compliant FHIR R4 bundles in seconds.
        </motion.p>
      </section>

      {/* Upload Zone */}
      <section>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <UploadCard
            title="Discharge Summary"
            description="Hospital discharge summary PDF"
            useCase="claim_submission"
            onUpload={handleUpload}
          />
          <UploadCard
            title="Diagnostic Report"
            description="Lab / imaging diagnostic report PDF"
            useCase="pre_authorisation"
            onUpload={handleUpload}
          />
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={() => setClaimMode(!claimMode)}
            className="flex items-center gap-2 text-caption text-muted-foreground hover:text-foreground transition-colors"
          >
            {claimMode ? <ToggleRight className="w-5 h-5 text-primary" /> : <ToggleLeft className="w-5 h-5" />}
            <span>Claim Bundle Mode</span>
          </button>
          {claimMode && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-caption text-primary">
              Both files will merge into one FHIR transaction bundle
            </motion.span>
          )}
        </div>
      </section>

      {/* Pipeline */}
      {pipelineStage >= 0 && <PipelineTracker active={pipelineStage} label={pipelineLabel} />}

      {/* Recent Jobs */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-h2 text-foreground">Recent Conversions</h2>
          <button onClick={() => navigate("/history")} className="text-xs text-primary hover:text-primary/80 transition-colors">
            View all →
          </button>
        </div>
        {jobs.length === 0 ? (
          <div className="rounded-lg card-shadow p-8 text-center text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-body">No documents processed yet.</p>
            <p className="text-caption mt-1">Upload a PDF above to get started!</p>
          </div>
        ) : (
          <div className="rounded-lg card-shadow overflow-hidden">
            <table className="w-full text-body">
              <thead>
                <tr className="bg-surface-elevated text-muted-foreground text-caption text-left">
                  <th className="px-4 py-3 font-medium">Job ID</th>
                  <th className="px-4 py-3 font-medium">Use Case</th>
                  <th className="px-4 py-3 font-medium">Documents</th>
                  <th className="px-4 py-3 font-medium">Confidence</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <motion.tr
                    key={job.id}
                    whileHover={{ x: 1, backgroundColor: "hsl(224 42% 14% / 0.5)" }}
                    className="border-t border-border transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{job.id.slice(0, 8)}…</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary/20 text-primary">
                        {job.use_case?.replace("_", " ") || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{job.document_count}</td>
                    <td className={`px-4 py-3 font-mono font-medium ${job.avg_confidence != null ? getConfidenceColor(job.avg_confidence * 100) : "text-muted-foreground"
                      }`}>
                      {job.avg_confidence != null ? `${Math.round(job.avg_confidence * 100)}%` : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {new Date(job.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${getStatusStyle(job.status)}`}>
                        {job.status === "processing" && <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />}
                        {job.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/review?jobId=${job.id}`);
                          }}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => handleDownload(job, e)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
