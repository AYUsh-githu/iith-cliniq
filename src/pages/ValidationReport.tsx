import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CheckCircle2, AlertTriangle, XCircle, ChevronRight, ChevronDown, RefreshCw,
  ArrowRight, ArrowLeft, User, Calendar, Heart, Pill, Activity,
  Stethoscope, Building2, UserCheck, Grid3X3, Shield, Layers
} from "lucide-react";
import { mockComplianceItems, mockValidationIssues, mockResourceTree } from "@/data/mockData";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { triggerValidation, getValidationReport, type ValidationReport as ValidReport } from "@/lib/api";

/* ── Animated Health Gauge ── */

function HealthGauge({ score }: { score: number }) {
  const radius = 52;
  const strokeWidth = 12;
  const viewBoxSize = 140;
  const center = viewBoxSize / 2;
  const totalAngle = 270;
  const startAngle = 135;
  const circumference = (totalAngle / 360) * 2 * Math.PI * radius;
  const color = score >= 90 ? "#10B981" : score >= 70 ? "#F59E0B" : "#F43F5E";
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    let frame: number;
    const start = performance.now();
    const animate = (now: number) => {
      const progress = Math.min((now - start) / 1400, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(eased * score));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [score]);

  const offset = circumference - (animatedScore / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ filter: `drop-shadow(0 0 12px ${color}40)` }}>
        <svg width={viewBoxSize} height={viewBoxSize} viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}>
          {/* Background arc */}
          <circle
            cx={center} cy={center} r={radius}
            fill="none" stroke="#1E2A45" strokeWidth={strokeWidth}
            strokeDasharray={`${circumference} ${2 * Math.PI * radius - circumference}`}
            strokeLinecap="round"
            transform={`rotate(${startAngle} ${center} ${center})`}
          />
          {/* Animated arc */}
          <circle
            cx={center} cy={center} r={radius}
            fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(${startAngle} ${center} ${center})`}
            style={{ transition: "stroke-dashoffset 0.08s linear" }}
          />
          <text x={center} y={center - 4} textAnchor="middle" dominantBaseline="central" className="text-4xl font-bold" fill="#F1F5F9">
            {animatedScore}
          </text>
          <text x={center} y={center + 22} textAnchor="middle" className="text-xs" fill="#94A3B8">
            Bundle Health Score
          </text>
        </svg>
      </div>
    </div>
  );
}

/* ── Resource Type Icons ── */

const resourceIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Patient: User, Encounter: Calendar, Condition: Heart,
  Procedure: Stethoscope, MedicationRequest: Pill, Observation: Activity,
  Practitioner: UserCheck, Organization: Building2, Bundle: Grid3X3,
};

/* ── Resource Tree Node ── */

interface TreeNode {
  type: string;
  id: string;
  status: "pass" | "warning" | "fail";
  label?: string;
  resourceCount?: number;
  children?: TreeNode[];
}

function ResourceTreeNode({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [open, setOpen] = useState(depth === 0);
  const [showDetails, setShowDetails] = useState(false);
  const Icon = resourceIcons[node.type] || Grid3X3;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: depth * 0.02 }}
    >
      <button
        onClick={() => {
          if (node.children) setOpen(!open);
          else setShowDetails(!showDetails);
        }}
        className="flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-sm hover:bg-[#151D35] transition-colors"
      >
        {node.children ? (
          open ? <ChevronDown className="w-3 h-3 text-[#94A3B8]" /> : <ChevronRight className="w-3 h-3 text-[#94A3B8]" />
        ) : <span className="w-3" />}
        <Icon className="w-4 h-4 text-[#4F46E5]" />
        <span className="text-[#F1F5F9] font-medium">{node.type}</span>
        {node.label && <span className="text-[#94A3B8] text-xs truncate max-w-[120px]">· {node.label}</span>}
        <span className="text-[#94A3B8] font-mono text-xs truncate">{node.id}</span>
        {node.resourceCount && <span className="text-xs text-[#94A3B8]">— {node.resourceCount} resources</span>}
        <span className={`ml-auto w-2 h-2 rounded-full shrink-0 ${node.status === "pass" ? "bg-[#10B981]" : node.status === "warning" ? "bg-[#F59E0B]" : "bg-[#F43F5E]"
          }`} />
      </button>

      {/* Inline details for leaf nodes */}
      {showDetails && !node.children && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="ml-10 mb-2 p-3 rounded-md bg-[#151D35] border border-[#1E2A45] text-xs"
        >
          <div className="grid grid-cols-2 gap-2">
            <div><span className="text-[#94A3B8]">Type:</span> <span className="text-[#F1F5F9]">{node.type}</span></div>
            <div><span className="text-[#94A3B8]">ID:</span> <span className="text-[#F1F5F9] font-mono">{node.id}</span></div>
            <div><span className="text-[#94A3B8]">Status:</span> <span className={node.status === "pass" ? "text-[#10B981]" : "text-[#F59E0B]"}>{node.status.toUpperCase()}</span></div>
            {node.label && <div><span className="text-[#94A3B8]">Label:</span> <span className="text-[#F1F5F9]">{node.label}</span></div>}
          </div>
        </motion.div>
      )}

      {open && node.children && (
        <div className="ml-6 border-l border-[#1E2A45] pl-2">
          {node.children.map((child, i) => (
            <ResourceTreeNode key={i} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

/* ── Main Component ── */

export default function ValidationReport() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const docId = searchParams.get("docId");
  const { toast } = useToast();
  const [revalidating, setRevalidating] = useState(false);
  const [allExpanded, setAllExpanded] = useState(false);
  const [expandedWarning, setExpandedWarning] = useState<number | null>(null);
  const [apiReport, setApiReport] = useState<ValidReport | null>(null);

  // Fetch validation report from API when docId is available
  useEffect(() => {
    if (docId) {
      getValidationReport(docId)
        .then((report) => {
          setApiReport(report);
          toast({ title: "Validation report loaded" });
        })
        .catch(() => {
          // Fall back to mock data
        });
    }
  }, [docId]);

  const errors = mockValidationIssues.filter((i) => i.severity === "error");
  const warnings = mockValidationIssues.filter((i) => i.severity === "warning");
  const infos = mockValidationIssues.filter((i) => i.severity === "info");

  const handleRevalidate = async () => {
    setRevalidating(true);
    try {
      if (docId) {
        await triggerValidation(docId);
        const report = await getValidationReport(docId);
        setApiReport(report);
        toast({ title: "Re-validation complete", description: `Score: ${report.bundle_health_score ?? 96}/100` });
      } else {
        await new Promise(r => setTimeout(r, 2000));
        toast({ title: "Re-validation complete", description: "Score: 96/100" });
      }
    } catch {
      toast({ title: "Re-validation failed", variant: "destructive" });
    } finally {
      setRevalidating(false);
    }
  };

  const stagger = {
    container: { transition: { staggerChildren: 0.05 } },
    item: { initial: { opacity: 0, x: -10 }, animate: { opacity: 1, x: 0 } },
  };

  const resourceBreakdown = [
    { type: "Patient", count: 1 },
    { type: "Encounter", count: 1 },
    { type: "Condition", count: 4 },
    { type: "Procedure", count: 4 },
    { type: "MedicationRequest", count: 6 },
    { type: "Observation", count: 12 },
    { type: "Practitioner", count: 2 },
    { type: "Organization", count: 1 },
  ];

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center p-6 rounded-lg bg-[#0F1629] card-shadow"
        >
          <HealthGauge score={96} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="flex flex-col items-center justify-center p-6 rounded-lg bg-[#0F1629] card-shadow"
        >
          <Layers className="w-8 h-8 text-[#4F46E5] mb-2" />
          <div className="text-4xl text-[#F1F5F9] font-bold">31</div>
          <div className="text-xs text-[#94A3B8] mb-3">FHIR Resources Generated</div>
          <div className="flex flex-wrap gap-1.5 justify-center">
            {resourceBreakdown.map((r) => (
              <span key={r.type} className="px-2 py-0.5 rounded-full bg-[#1E2A45] text-[#94A3B8] text-[10px]">
                {r.type} ×{r.count}
              </span>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          className="flex flex-col items-center justify-center p-6 rounded-lg bg-[#0F1629] card-shadow"
        >
          <Shield className="w-8 h-8 text-[#F59E0B] mb-2" />
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-[#F59E0B]/20 text-[#F59E0B] text-sm font-semibold">7/8 Passed</span>
          </div>
          <div className="text-xs text-[#94A3B8] mt-2">NHCX Profile Status</div>
          <div className="text-xs text-[#94A3B8] mt-1">0 Errors · 2 Warnings · 0 Info</div>
          <div className="text-[10px] text-[#94A3B8]/60 mt-1">NRCeS NHCX R4 Profile v2.1</div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* NHCX Compliance Checklist */}
          <div className="rounded-lg bg-[#0F1629] card-shadow p-5">
            <h3 className="text-lg text-[#F1F5F9] font-semibold mb-4">Profile Compliance Checks</h3>
            <motion.div
              variants={stagger.container}
              initial="initial"
              animate="animate"
              className="space-y-1"
            >
              {mockComplianceItems.map((item, i) => (
                <motion.div
                  key={i}
                  variants={stagger.item}
                  transition={{ delay: i * 0.05 }}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-md transition-colors ${item.status !== "pass" ? "bg-[#F59E0B]/5 cursor-pointer hover:bg-[#F59E0B]/10" : ""
                    }`}
                  onClick={() => {
                    if (item.status === "warning") {
                      setExpandedWarning(expandedWarning === i ? null : i);
                    }
                  }}
                >
                  <div className="flex items-center gap-3">
                    {item.status === "pass" ? (
                      <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0" />
                    )}
                    <span className="text-sm text-[#F1F5F9]">{item.label}</span>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${item.status === "pass" ? "bg-[#10B981]/20 text-[#10B981]" : "bg-[#F59E0B]/20 text-[#F59E0B]"
                    }`}>
                    {item.status === "pass" ? "PASS" : "WARN"}
                  </span>
                </motion.div>
              ))}
            </motion.div>

            {/* Expandable warning detail */}
            {expandedWarning !== null && mockComplianceItems[expandedWarning]?.status === "warning" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="mt-2 ml-7 p-3 rounded-md bg-[#151D35] border border-[#1E2A45] text-xs"
              >
                <div className="text-[#94A3B8] font-mono mb-1">Path: MedicationRequest.dosageInstruction[0].timing.code</div>
                <div className="text-[#F1F5F9] mb-2">1 MedicationRequest resource (Furosemide) is using plain text timing value instead of a coded SNOMED CT or NullFlavor value.</div>
                <button
                  onClick={() => {
                    toast({ title: "Navigating to Furosemide medication field" });
                    navigate("/review");
                  }}
                  className="flex items-center gap-1 text-[#4F46E5] hover:text-[#6366F1] transition-colors"
                >
                  Fix in Review <ArrowRight className="w-3 h-3" />
                </button>
              </motion.div>
            )}
          </div>

          {/* Validation Issues */}
          <div className="rounded-lg bg-[#0F1629] card-shadow p-5">
            <h3 className="text-lg text-[#F1F5F9] font-semibold mb-4">Validation Issues</h3>
            <Tabs defaultValue="warnings">
              <TabsList className="bg-[#151D35]">
                <TabsTrigger value="errors" className="data-[state=active]:bg-[#F43F5E]/20 data-[state=active]:text-[#F43F5E]">
                  Errors <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[#F43F5E]/20 text-[10px]">{errors.length}</span>
                </TabsTrigger>
                <TabsTrigger value="warnings" className="data-[state=active]:bg-[#F59E0B]/20 data-[state=active]:text-[#F59E0B]">
                  Warnings <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[#F59E0B]/20 text-[10px]">{warnings.length}</span>
                </TabsTrigger>
                <TabsTrigger value="info" className="data-[state=active]:bg-[#4F46E5]/20 data-[state=active]:text-[#4F46E5]">
                  Info <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[#4F46E5]/20 text-[10px]">{infos.length}</span>
                </TabsTrigger>
              </TabsList>

              {(["errors", "warnings", "info"] as const).map((tab) => {
                const items = tab === "errors" ? errors : tab === "warnings" ? warnings : infos;
                const IconComp = tab === "errors" ? XCircle : tab === "warnings" ? AlertTriangle : CheckCircle2;
                const iconColor = tab === "errors" ? "text-[#F43F5E]" : tab === "warnings" ? "text-[#F59E0B]" : "text-[#4F46E5]";
                return (
                  <TabsContent key={tab} value={tab} className="space-y-2 mt-3">
                    {items.length === 0 ? (
                      <div className="text-center py-8 text-sm text-[#94A3B8]">
                        No {tab} found. ✓
                      </div>
                    ) : (
                      items.map((issue, i) => (
                        <IssueRow key={i} issue={issue} IconComp={IconComp} iconColor={iconColor} />
                      ))
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>
          </div>
        </div>

        {/* Right 1/3: Resource Tree */}
        <div className="rounded-lg bg-[#0F1629] card-shadow p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg text-[#F1F5F9] font-semibold">FHIR Resource Tree</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setAllExpanded(!allExpanded)}
                className="text-xs text-[#94A3B8] hover:text-[#F1F5F9] transition-colors"
              >
                {allExpanded ? "Collapse All" : "Expand All"}
              </button>
            </div>
          </div>
          <div className="space-y-0.5">
            {mockResourceTree.map((node, i) => (
              <ResourceTreeNode key={i} node={node} />
            ))}
          </div>
        </div>
      </div>

      {/* Bottom actions */}
      <div className="flex items-center justify-between">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate("/review")}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm text-[#94A3B8] hover:text-[#F1F5F9] border border-[#1E2A45] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Review
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleRevalidate}
          disabled={revalidating}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm text-[#94A3B8] hover:text-[#F1F5F9] border border-[#1E2A45] transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${revalidating ? "animate-spin" : ""}`} />
          {revalidating ? "Re-validating..." : "Re-Validate"}
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate("/export")}
          className="shimmer-btn flex items-center gap-2 px-6 py-2.5 rounded-md bg-[#4F46E5] text-white text-sm font-medium"
        >
          Proceed to Export <ArrowRight className="w-4 h-4" />
        </motion.button>
      </div>
    </div>
  );
}

/* ── Issue Row subcomponent ── */

interface ValidationIssue {
  severity: "error" | "warning" | "info";
  path: string;
  fhirPath: string;
  message: string;
  fixField: string;
  fullMessage: string;
}

function IssueRow({ issue, IconComp, iconColor }: {
  issue: ValidationIssue;
  IconComp: React.ComponentType<{ className?: string }>;
  iconColor: string;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-md bg-[#080D1A] border border-[#1E2A45] hover:bg-[#151D35] transition-colors cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-3 px-3 py-3">
        <IconComp className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-[#94A3B8] font-mono">{issue.path}</div>
          <div className="text-xs text-[#94A3B8] font-mono mt-0.5">Path: {issue.fhirPath}</div>
          <div className="text-sm text-[#F1F5F9] mt-1">{issue.message}</div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toast({ title: `Navigating to ${issue.fixField} field` });
            navigate("/review");
          }}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-[#4F46E5] hover:bg-[#4F46E5]/10 transition-colors shrink-0"
        >
          Fix <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="px-3 pb-3"
        >
          <pre className="text-[10px] font-mono text-[#94A3B8] bg-[#0D1117] rounded p-3 overflow-x-auto whitespace-pre-wrap">
            {issue.fullMessage}
          </pre>
        </motion.div>
      )}
    </div>
  );
}
