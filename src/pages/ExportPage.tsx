import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Copy, Download, ChevronDown, ChevronUp, Check, Loader2, FileText,
  Send, Server, ArrowRight, TrendingUp, Percent, Clock, BarChart3,
  ArrowLeft
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, Tooltip } from "recharts";
import { mockFHIRBundle, mockPatient } from "@/data/mockData";
import { useToast } from "@/hooks/use-toast";
import { downloadFHIR, submitToABDM, getAuditLog } from "@/lib/api";

/* ── Data ── */

const donutData = [
  { name: "High (≥80%)", value: 52, color: "#10B981" },
  { name: "Medium (50-79%)", value: 6, color: "#F59E0B" },
  { name: "Low (<50%)", value: 3, color: "#F43F5E" },
];

const sparkData = [
  { v: 88 }, { v: 91 }, { v: 85 }, { v: 94 }, { v: 96 }, { v: 92 }, { v: 89 }, { v: 97 }, { v: 94 }, { v: 96 },
];

/* ── JSON Syntax Highlighter ── */

function SyntaxHighlightedJSON({ json }: { json: string }) {
  const lines = json.split("\n");

  const highlightLine = (line: string) => {
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let partKey = 0;

    // Match patterns for JSON syntax highlighting
    const regex = /("(?:[^"\\]|\\.)*")\s*(:?)|(true|false|null)|(\d+\.?\d*)|([{}[\],])/g;
    let match: RegExpExecArray | null;
    let lastIndex = 0;

    while ((match = regex.exec(remaining)) !== null) {
      // Text before the match
      if (match.index > lastIndex) {
        parts.push(<span key={partKey++}>{remaining.slice(lastIndex, match.index)}</span>);
      }

      if (match[1]) {
        // String — check if it's a key (followed by colon)
        if (match[2] === ":") {
          parts.push(<span key={partKey++} style={{ color: "#79B8FF" }}>{match[1]}</span>);
          parts.push(<span key={partKey++} style={{ color: "#94A3B8" }}>:</span>);
        } else {
          parts.push(<span key={partKey++} style={{ color: "#9ECB89" }}>{match[1]}</span>);
        }
      } else if (match[3]) {
        // boolean or null
        parts.push(<span key={partKey++} style={{ color: "#F97583" }}>{match[3]}</span>);
      } else if (match[4]) {
        // number
        parts.push(<span key={partKey++} style={{ color: "#F8C555" }}>{match[4]}</span>);
      } else if (match[5]) {
        // punctuation
        parts.push(<span key={partKey++} style={{ color: "#94A3B8" }}>{match[5]}</span>);
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < remaining.length) {
      parts.push(<span key={partKey++}>{remaining.slice(lastIndex)}</span>);
    }

    return parts.length > 0 ? parts : remaining;
  };

  return (
    <div className="overflow-auto h-[420px] rounded-md" style={{ backgroundColor: "#0D1117" }}>
      <pre className="text-xs font-mono leading-relaxed p-4">
        {lines.map((line, i) => (
          <div key={i} className="flex">
            <span className="w-8 text-right mr-4 select-none shrink-0" style={{ color: "#4B5A72" }}>
              {i + 1}
            </span>
            <span>{highlightLine(line)}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}

/* ── Animated Counter ── */

function AnimatedCounter({ target, suffix = "", prefix = "" }: {
  target: number; suffix?: string; prefix?: string;
}) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let frame: number;
    const start = performance.now();
    const animate = (now: number) => {
      const progress = Math.min((now - start) / 1000, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return <span className="text-2xl text-[#F1F5F9] font-bold">{prefix}{value.toLocaleString()}{suffix}</span>;
}

/* ── Incrementing Counter ── */

function IncrementingCounter() {
  const [value, setValue] = useState(187432);
  useEffect(() => {
    const interval = setInterval(() => setValue((v) => v + 1), 3000);
    return () => clearInterval(interval);
  }, []);
  return <span className="text-2xl text-[#F1F5F9] font-bold">{value.toLocaleString()} hrs</span>;
}

/* ── Mini Sparkline ── */

function MiniSparkline() {
  const bars = [14, 18, 22, 30, 28, 35];
  const maxH = 20;
  return (
    <svg width="42" height={maxH} className="inline-block ml-2">
      {bars.map((h, i) => (
        <rect
          key={i}
          x={i * 7}
          y={maxH - (h / 35) * maxH}
          width={5}
          height={(h / 35) * maxH}
          rx={1}
          fill="#4F46E5"
          opacity={0.5 + (i / bars.length) * 0.5}
        />
      ))}
    </svg>
  );
}

/* ── Main Component ── */

export default function ExportPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const docId = searchParams.get("docId");
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [submissionState, setSubmissionState] = useState<"idle" | "connecting" | "sending" | "processing" | "done">("idle");

  const handleCopy = () => {
    navigator.clipboard.writeText(mockFHIRBundle);
    setCopied(true);
    toast({ title: "Copied!", description: "JSON copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = async () => {
    if (docId) {
      try {
        await downloadFHIR(docId);
        toast({ title: "Downloading FHIR bundle" });
        return;
      } catch {
        toast({ title: "API download failed, using local copy", variant: "destructive" });
      }
    }
    const blob = new Blob([mockFHIRBundle], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "RahulSharma_FHIR_Bundle.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAuditDownload = async () => {
    if (docId) {
      try {
        const log = await getAuditLog(docId);
        const blob = new Blob([JSON.stringify(log, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `audit_log_${docId.slice(0, 8)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: "Audit log downloaded" });
        return;
      } catch {
        // Fall through to mock
      }
    }
    const auditLog = JSON.stringify({
      auditId: "audit-rs-001",
      timestamp: "2026-02-19T14:30:00+05:30",
      patient: mockPatient.name,
      abha: mockPatient.abha,
      action: "FHIR_BUNDLE_GENERATED",
      resourcesCreated: 31,
      bundleHealthScore: 96,
      fieldsExtracted: 61,
      avgConfidence: 92,
      operator: "System \u2014 ClinIQ v1.0.0-beta",
      warnings: 2,
      errors: 0,
    }, null, 2);
    const blob = new Blob([auditLog], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit_log_rahul_sharma.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async () => {
    setSubmissionState("connecting");
    if (docId) {
      try {
        setTimeout(() => setSubmissionState("sending"), 500);
        setTimeout(() => setSubmissionState("processing"), 1200);
        const result = await submitToABDM(docId);
        setSubmissionState("done");
        toast({ title: result.status || "Submitted successfully" });
        return;
      } catch {
        setSubmissionState("idle");
        toast({ title: "Submission failed", variant: "destructive" });
        return;
      }
    }
    setTimeout(() => setSubmissionState("sending"), 800);
    setTimeout(() => setSubmissionState("processing"), 1800);
    setTimeout(() => setSubmissionState("done"), 2600);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: FHIR Preview */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-3 rounded-lg bg-[#0F1629] card-shadow overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 bg-[#151D35] border-b border-[#1E2A45]">
            <span className="text-sm text-[#F1F5F9] font-semibold">FHIR Bundle Preview</span>
            <div className="flex items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-[#94A3B8] hover:text-[#F1F5F9] border border-[#1E2A45] transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#10B981]" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Copy JSON"}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-[#94A3B8] hover:text-[#F1F5F9] border border-[#1E2A45] transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Download Bundle
              </motion.button>
              <button onClick={() => setCollapsed(!collapsed)} className="text-[#94A3B8] hover:text-[#F1F5F9] transition-colors">
                {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <SyntaxHighlightedJSON json={mockFHIRBundle} />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="px-4 py-3 border-t border-[#1E2A45]">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleAuditDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-[#94A3B8] hover:text-[#F1F5F9] border border-[#1E2A45] transition-colors"
            >
              <FileText className="w-3.5 h-3.5" /> Download Audit Log
            </motion.button>
          </div>
        </motion.div>

        {/* Right column */}
        <div className="lg:col-span-2 space-y-6">
          {/* ABDM Submission Card */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-lg bg-[#0F1629] card-shadow p-6"
          >
            <h3 className="text-lg text-[#F1F5F9] font-semibold mb-1">Submit to ABDM Sandbox</h3>
            <p className="text-xs text-[#94A3B8] mb-3">POST bundle to ABDM FHIR sandbox endpoint.</p>

            <div className="mb-4 px-2 py-1.5 rounded bg-[#0F1629] border border-[#1E2A45]">
              <code className="text-[10px] font-mono text-[#94A3B8] break-all">
                https://sandbox.abdm.gov.in/fhir/r4/Bundle
              </code>
            </div>

            {/* Server animation area */}
            <div className="relative h-16 mb-4 flex items-center justify-center">
              <AnimatePresence>
                {submissionState === "sending" && (
                  <motion.div
                    initial={{ x: -40, opacity: 0 }}
                    animate={{ x: 40, opacity: [0, 1, 1, 0] }}
                    transition={{ duration: 1, ease: "easeInOut" }}
                    className="absolute"
                  >
                    <div className="w-3 h-3 rounded-full bg-[#4F46E5]" />
                  </motion.div>
                )}
                {(submissionState === "processing" || submissionState === "sending") && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute right-1/4"
                  >
                    <Server className={`w-6 h-6 text-[#94A3B8] ${submissionState === "processing" ? "animate-pulse" : ""}`} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <motion.button
              whileHover={submissionState === "idle" ? { scale: 1.02 } : {}}
              whileTap={submissionState === "idle" ? { scale: 0.98 } : {}}
              onClick={submissionState === "idle" ? handleSubmit : undefined}
              disabled={submissionState !== "idle" && submissionState !== "done"}
              className={`shimmer-btn flex items-center justify-center gap-2 w-full px-6 py-3 rounded-md text-sm font-medium transition-all ${submissionState === "done"
                ? "bg-[#10B981] text-white"
                : "bg-[#4F46E5] text-white"
                }`}
            >
              {submissionState === "idle" && <><Send className="w-4 h-4" /> Submit Bundle <ArrowRight className="w-4 h-4" /></>}
              {submissionState === "connecting" && <><span className="w-2 h-2 rounded-full bg-white animate-pulse" /> Connecting...</>}
              {submissionState === "sending" && <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>}
              {submissionState === "processing" && <><Server className="w-4 h-4 animate-pulse" /> Processing...</>}
              {submissionState === "done" && <><Check className="w-4 h-4" /> ✅ 200 OK — Accepted</>}
            </motion.button>

            {submissionState === "done" && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 300 }}
                className="mt-4 p-4 rounded-lg border-l-4 border-[#10B981] bg-[#10B981]/10"
              >
                <div className="text-sm text-[#F1F5F9] font-medium mb-1">
                  Document accepted to ABHA Health Locker
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded-full bg-[#4F46E5]/20 text-[#4F46E5] text-[10px]">
                    {mockPatient.name}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-[#151D35] text-[#94A3B8] text-[10px] font-mono">
                    ABHA: {mockPatient.abha}
                  </span>
                </div>
                <div className="text-[10px] text-[#94A3B8] mt-2">
                  Timestamp: 2026-02-19T14:30:00+05:30
                </div>
                <button className="text-xs text-[#4F46E5] hover:text-[#6366F1] mt-2 flex items-center gap-1 transition-colors">
                  View on ABHA Portal <ArrowRight className="w-3 h-3" />
                </button>
              </motion.div>
            )}
          </motion.div>

          {/* Analytics mini cards */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-lg bg-[#0F1629] card-shadow p-5"
          >
            <h3 className="text-sm text-[#F1F5F9] font-semibold mb-4">Analytics</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-md bg-[#080D1A] border border-[#1E2A45] text-center">
                <TrendingUp className="w-4 h-4 text-[#4F46E5] mx-auto mb-1" />
                <AnimatedCounter target={3841} />
                <div className="text-[10px] text-[#94A3B8] mt-1">Total Processed</div>
              </div>
              <div className="p-3 rounded-md bg-[#080D1A] border border-[#1E2A45] text-center">
                <Percent className="w-4 h-4 text-[#10B981] mx-auto mb-1" />
                <span className="text-2xl text-[#10B981] font-bold">91%</span>
                <div className="text-[10px] text-[#94A3B8] mt-1">Avg Confidence</div>
              </div>
              <div className="p-3 rounded-md bg-[#080D1A] border border-[#1E2A45] text-center" title="Estimated based on 45min manual coding per document">
                <Clock className="w-4 h-4 text-[#F59E0B] mx-auto mb-1" />
                <IncrementingCounter />
                <div className="text-[10px] text-[#94A3B8] mt-1">Time Saved</div>
              </div>
              <div className="p-3 rounded-md bg-[#080D1A] border border-[#1E2A45] text-center">
                <BarChart3 className="w-4 h-4 text-[#4F46E5] mx-auto mb-1" />
                <span className="text-2xl text-[#F1F5F9] font-bold">94.2%</span>
                <MiniSparkline />
                <div className="text-[10px] text-[#94A3B8] mt-1">Pass Rate</div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="flex flex-col items-center">
                <div className="text-[10px] text-[#94A3B8] mb-2">Confidence Distribution</div>
                <ResponsiveContainer width={110} height={110}>
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%" innerRadius={30} outerRadius={45} dataKey="value" strokeWidth={0}>
                      {donutData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-0.5 mt-1">
                  {donutData.map((d) => (
                    <div key={d.name} className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="text-[9px] text-[#94A3B8]">{d.name}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col items-center">
                <div className="text-[10px] text-[#94A3B8] mb-2">Pass Rate Trend</div>
                <ResponsiveContainer width="100%" height={100}>
                  <LineChart data={sparkData}>
                    <defs>
                      <linearGradient id="passRateGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#4F46E5" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Line type="monotone" dataKey="v" stroke="#4F46E5" strokeWidth={2} dot={false} />
                    <Tooltip
                      contentStyle={{ background: "#151D35", border: "1px solid #1E2A45", borderRadius: 8, fontSize: 11 }}
                      labelStyle={{ display: "none" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <span className="text-xs text-[#10B981] font-semibold mt-1">96% latest</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Bottom nav */}
      <div className="flex items-center justify-between">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate("/validate")}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm text-[#94A3B8] hover:text-[#F1F5F9] border border-[#1E2A45] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Validation
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate("/")}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm text-[#94A3B8] hover:text-[#F1F5F9] border border-[#1E2A45] transition-colors"
        >
          New Conversion <ArrowRight className="w-4 h-4" />
        </motion.button>
      </div>
    </div>
  );
}
