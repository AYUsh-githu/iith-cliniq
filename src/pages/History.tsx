import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Search, Download, FileSearch, Eye, ChevronLeft, ChevronRight,
    ArrowRight
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import {
    listJobs,
    getJobDetail,
    downloadFHIR,
    downloadJobBundle,
    type JobSummary,
    type JobDetail,
} from "@/lib/api";

/* ── Status Badge ── */

function StatusBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
        completed: "bg-[#10B981]/20 text-[#10B981]",
        processing: "bg-[#F59E0B]/20 text-[#F59E0B]",
        failed: "bg-[#F43F5E]/20 text-[#F43F5E]",
        queued: "bg-[#4F46E5]/20 text-[#4F46E5]",
    };
    return (
        <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${styles[status] || styles.queued}`}>
            {status === "processing" && <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] animate-pulse" />}
            {status}
        </span>
    );
}

/* ── Main Component ── */

export default function History() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const [jobs, setJobs] = useState<JobSummary[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("All");
    const [selectedJob, setSelectedJob] = useState<JobDetail | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 12;

    // Fetch jobs from API
    useEffect(() => {
        setLoading(true);
        listJobs(currentPage, pageSize)
            .then((res) => {
                setJobs(res.items);
                setTotal(res.total);
            })
            .catch(() => {
                toast({ title: "Failed to load history", variant: "destructive" });
            })
            .finally(() => setLoading(false));
    }, [currentPage]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    // Client-side filtering for search + status
    const filtered = jobs.filter((job) => {
        if (search && !job.id.toLowerCase().includes(search.toLowerCase()) && !job.use_case.toLowerCase().includes(search.toLowerCase())) return false;
        if (statusFilter !== "All" && job.status !== statusFilter.toLowerCase()) return false;
        return true;
    });

    const handleViewDetails = async (job: JobSummary) => {
        try {
            const detail = await getJobDetail(job.id);
            setSelectedJob(detail);
        } catch {
            toast({ title: "Failed to load details", variant: "destructive" });
        }
    };

    const handleDownload = async (job: JobSummary, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await downloadJobBundle(job.id);
            toast({ title: "Downloading FHIR bundle" });
        } catch {
            toast({ title: "Download failed", variant: "destructive" });
        }
    };

    const handleExportCSV = () => {
        const header = "Job ID,Status,Use Case,Documents,Confidence,Created\n";
        const rows = filtered.map(j =>
            `"${j.id}","${j.status}","${j.use_case}","${j.document_count}","${j.avg_confidence != null ? Math.round(j.avg_confidence * 100) + '%' : '-'}","${new Date(j.created_at).toLocaleString()}"`
        ).join("\n");
        const csv = header + rows;
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "ClinIQ_History.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast({ title: "CSV exported", description: `${filtered.length} records exported.` });
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
        >
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl text-[#F1F5F9] font-bold">Conversion History</h1>
                    <p className="text-sm text-[#94A3B8] mt-1">Browse and manage all clinical document conversions</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by job ID or use case..."
                            className="pl-10 pr-4 py-2 w-72 rounded-md bg-[#0F1629] border border-[#1E2A45] text-sm text-[#F1F5F9] placeholder:text-[#94A3B8]/60 focus:border-[#4F46E5] focus:outline-none transition-colors"
                        />
                    </div>
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleExportCSV}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs text-[#94A3B8] hover:text-[#F1F5F9] border border-[#1E2A45] transition-colors"
                    >
                        <Download className="w-3.5 h-3.5" /> Export CSV
                    </motion.button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-36 h-8 text-xs bg-[#0F1629] border-[#1E2A45] text-[#F1F5F9]">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#151D35] border-[#1E2A45]">
                        {["All", "Completed", "Processing", "Queued", "Failed"].map((s) => (
                            <SelectItem key={s} value={s} className="text-[#F1F5F9] text-xs">{s}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Data Table */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 rounded-lg bg-[#0F1629] card-shadow">
                    <div className="w-8 h-8 border-2 border-[#4F46E5] border-t-transparent rounded-full animate-spin mb-4" />
                    <div className="text-sm text-[#94A3B8]">Loading history...</div>
                </div>
            ) : filtered.length > 0 ? (
                <div className="rounded-lg bg-[#0F1629] card-shadow overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="bg-[#151D35] text-[#94A3B8] text-left">
                                    <th className="px-4 py-3 font-medium">Job ID</th>
                                    <th className="px-4 py-3 font-medium">Use Case</th>
                                    <th className="px-4 py-3 font-medium">Documents</th>
                                    <th className="px-4 py-3 font-medium">Avg Confidence</th>
                                    <th className="px-4 py-3 font-medium">Created</th>
                                    <th className="px-4 py-3 font-medium">Status</th>
                                    <th className="px-4 py-3 font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((job, i) => (
                                    <motion.tr
                                        key={job.id}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.03 }}
                                        onClick={() => handleViewDetails(job)}
                                        className="border-t border-[#1E2A45] cursor-pointer hover:bg-[#151D35] transition-colors"
                                    >
                                        <td className="px-4 py-3 font-mono text-[#F1F5F9]">{job.id.slice(0, 8)}…</td>
                                        <td className="px-4 py-3">
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#4F46E5]/20 text-[#4F46E5]">
                                                {job.use_case?.replace("_", " ") || "—"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-[#F1F5F9]">{job.document_count}</td>
                                        <td className="px-4 py-3">
                                            {job.avg_confidence != null ? (
                                                <div className="flex items-center gap-2">
                                                    <span className={`font-medium ${job.avg_confidence * 100 >= 90 ? "text-[#10B981]" : job.avg_confidence * 100 >= 80 ? "text-[#F59E0B]" : "text-[#F43F5E]"}`}>
                                                        {Math.round(job.avg_confidence * 100)}%
                                                    </span>
                                                    <div className="w-16 h-1 rounded-full bg-[#1E2A45] overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${job.avg_confidence * 100 >= 90 ? "bg-[#10B981]" : job.avg_confidence * 100 >= 80 ? "bg-[#F59E0B]" : "bg-[#F43F5E]"}`}
                                                            style={{ width: `${job.avg_confidence * 100}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-[#94A3B8]">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-[#94A3B8]">{new Date(job.created_at).toLocaleString()}</td>
                                        <td className="px-4 py-3"><StatusBadge status={job.status} /></td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleViewDetails(job); }}
                                                    className="p-1 rounded hover:bg-[#1E2A45] text-[#94A3B8] hover:text-[#F1F5F9] transition-colors"
                                                    title="View"
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={(e) => handleDownload(job, e)}
                                                    className="p-1 rounded hover:bg-[#1E2A45] text-[#94A3B8] hover:text-[#F1F5F9] transition-colors"
                                                    title="Download"
                                                >
                                                    <Download className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between px-4 py-3 border-t border-[#1E2A45]">
                        <span className="text-xs text-[#94A3B8]">
                            Showing {Math.min((currentPage - 1) * pageSize + 1, total)}-{Math.min(currentPage * pageSize, total)} of {total} results
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                                disabled={currentPage === 1}
                                className="p-1 rounded text-[#94A3B8] hover:text-[#F1F5F9] disabled:opacity-30 transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-xs text-[#F1F5F9]">Page {currentPage} of {totalPages}</span>
                            <button
                                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                                disabled={currentPage >= totalPages}
                                className="p-1 rounded text-[#94A3B8] hover:text-[#F1F5F9] disabled:opacity-30 transition-colors"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                /* Empty state */
                <div className="flex flex-col items-center justify-center py-20 rounded-lg bg-[#0F1629] card-shadow">
                    <FileSearch className="w-12 h-12 text-[#94A3B8]/40 mb-4" />
                    <div className="text-lg text-[#F1F5F9] font-medium mb-2">No conversions found</div>
                    <div className="text-sm text-[#94A3B8] mb-4">
                        {total === 0 ? "Upload a document to get started" : "Try adjusting your search or filters"}
                    </div>
                    {search || statusFilter !== "All" ? (
                        <button
                            onClick={() => { setSearch(""); setStatusFilter("All"); }}
                            className="px-4 py-2 rounded-md text-sm text-[#4F46E5] hover:bg-[#4F46E5]/10 transition-colors"
                        >
                            Clear filters
                        </button>
                    ) : null}
                </div>
            )}

            {/* Detail Sheet */}
            <Sheet open={!!selectedJob} onOpenChange={() => setSelectedJob(null)}>
                <SheetContent className="bg-[#0F1629] border-l border-[#1E2A45] text-[#F1F5F9]">
                    <SheetHeader>
                        <SheetTitle className="text-[#F1F5F9]">Job Details</SheetTitle>
                    </SheetHeader>
                    {selectedJob && (
                        <div className="mt-6 space-y-4">
                            <div className="rounded-md bg-[#080D1A] border border-[#1E2A45] p-4 space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-xs text-[#94A3B8]">Job ID</span>
                                    <span className="text-sm text-[#F1F5F9] font-mono">{selectedJob.id.slice(0, 12)}…</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-xs text-[#94A3B8]">Use Case</span>
                                    <span className="text-sm text-[#F1F5F9]">{selectedJob.use_case?.replace("_", " ")}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-xs text-[#94A3B8]">Status</span>
                                    <StatusBadge status={selectedJob.status} />
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-xs text-[#94A3B8]">Created</span>
                                    <span className="text-sm text-[#F1F5F9]">{new Date(selectedJob.created_at).toLocaleString()}</span>
                                </div>
                            </div>

                            {/* Documents list */}
                            <div className="space-y-2">
                                <h4 className="text-xs text-[#94A3B8] font-medium">Documents ({selectedJob.documents.length})</h4>
                                {selectedJob.documents.map((doc) => (
                                    <div key={doc.id} className="rounded-md bg-[#080D1A] border border-[#1E2A45] p-3 flex items-center justify-between">
                                        <div>
                                            <div className="text-sm text-[#F1F5F9] font-medium">{doc.filename}</div>
                                            <div className="text-[10px] text-[#94A3B8]">{doc.doc_type} · {doc.status}</div>
                                        </div>
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => { setSelectedJob(null); navigate(`/review?docId=${doc.id}`); }}
                                                className="p-1.5 rounded hover:bg-[#1E2A45] text-[#94A3B8] hover:text-[#F1F5F9] transition-colors"
                                            >
                                                <Eye className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={async () => { try { await downloadFHIR(doc.id); toast({ title: "Downloading…" }); } catch { toast({ title: "Failed", variant: "destructive" }); } }}
                                                className="p-1.5 rounded hover:bg-[#1E2A45] text-[#94A3B8] hover:text-[#F1F5F9] transition-colors"
                                            >
                                                <Download className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => {
                                    setSelectedJob(null);
                                    if (selectedJob.documents.length > 0) {
                                        navigate(`/review?docId=${selectedJob.documents[0].id}`);
                                    }
                                }}
                                className="shimmer-btn flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-md bg-[#4F46E5] text-white text-sm font-medium"
                            >
                                Open Full Review <ArrowRight className="w-4 h-4" />
                            </motion.button>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </motion.div>
    );
}
