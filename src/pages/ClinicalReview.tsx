import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ChevronLeft, ZoomIn, ZoomOut, Eye, Check, AlertTriangle,
  ArrowRight, Loader2, GripVertical, Stethoscope, Pill,
  FlaskConical, Heart, ClipboardList, FileText, Activity, Calendar
} from "lucide-react";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import {
  mockPatient, mockDiagnoses, mockMedications, mockLabValues,
  mockVitals, mockProcedures, mockDischargeInstructions, mockFollowUp
} from "@/data/mockData";
import {
  ResizableHandle, ResizablePanel, ResizablePanelGroup,
} from "@/components/ui/resizable";
import { getExtractedData, patchExtractedData, triggerValidation } from "@/lib/api";

/* ── helpers ── */

function getConfBg(c: number) {
  if (c >= 80) return "bg-[#10B981]/20 text-[#10B981]";
  if (c >= 50) return "bg-[#F59E0B]/20 text-[#F59E0B]";
  return "bg-[#F43F5E]/20 text-[#F43F5E]";
}

function getConfDot(c: number) {
  if (c >= 80) return "bg-[#10B981]";
  if (c >= 50) return "bg-[#F59E0B]";
  return "bg-[#F43F5E]";
}

function avgConf(items: { confidence: number }[]) {
  return Math.round(items.reduce((s, i) => s + i.confidence, 0) / items.length);
}

function hasLowConf(items: { confidence: number }[]) {
  return items.some((i) => i.confidence < 50);
}

/* ── Confidence Badge ── */

function ConfBadge({ value }: { value: number }) {
  return (
    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-medium ${getConfBg(value)}`}>
      {value}%
    </span>
  );
}

/* ── Code Chip with Popover ── */

interface CodeChipProps {
  system: string;
  code: string;
  description?: string;
}

function CodeChip({ system, code, description }: CodeChipProps) {
  const colors: Record<string, string> = {
    ICD: "bg-blue-500/20 text-blue-400",
    LOINC: "bg-[#F59E0B]/20 text-[#F59E0B]",
    SNOMED: "bg-purple-500/20 text-purple-400",
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={`px-1.5 py-0.5 rounded-sm text-[10px] font-mono cursor-pointer hover:brightness-125 transition ${colors[system] || "bg-[#1E2A45] text-[#94A3B8]"}`}>
          {system}: {code}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 bg-[#151D35] border-[#1E2A45] text-[#F1F5F9] text-xs p-3">
        <div className="font-semibold mb-1">{system} Code: {code}</div>
        <div className="text-[#94A3B8]">{description || `Standard ${system} terminology code for clinical documentation.`}</div>
      </PopoverContent>
    </Popover>
  );
}

/* ── Field Row ── */

interface FieldRowProps {
  label: string;
  value: string;
  confidence: number;
  codes?: CodeChipProps[];
  onSource?: () => void;
  index?: number;
  accepted?: boolean;
  onAccept?: () => void;
}

function FieldRow({ label, value, confidence, codes, onSource, index = 0, accepted = false, onAccept }: FieldRowProps) {
  const [editedValue, setEditedValue] = useState(value);
  const modified = editedValue !== value;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02, duration: 0.2 }}
      className={`py-2.5 px-3 border-b border-[#1E2A45] group ${accepted ? "border-l-2 border-l-[#10B981]" : confidence < 50 ? "border-l-2 border-l-[#F43F5E]" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-xs text-[#94A3B8] mb-1">{label}</div>
          <input
            value={editedValue}
            onChange={(e) => setEditedValue(e.target.value)}
            className="w-full bg-transparent text-sm text-[#F1F5F9] border-none outline-none focus:border focus:border-[#4F46E5] focus:rounded focus:bg-[#151D35] focus:px-2 focus:-mx-2 transition-all"
          />
        </div>
        <div className="flex items-center gap-1.5 shrink-0 pt-4">
          {codes?.map((c) => <CodeChip key={c.code} {...c} />)}
          {modified && <span className="px-1.5 py-0.5 rounded-sm text-[10px] bg-[#F59E0B]/20 text-[#F59E0B]">Modified</span>}
          {accepted ? (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-[#10B981]/20 text-[#10B981]">✓ Accepted</span>
          ) : (
            <ConfBadge value={confidence} />
          )}
          {onSource && (
            <button
              onClick={onSource}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-[#94A3B8] hover:text-[#4F46E5] p-0.5"
              title="View source"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          )}
          {!accepted && onAccept && (
            <button
              onClick={onAccept}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-[#94A3B8] hover:text-[#10B981] p-0.5"
              title="Accept field"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ── Section Header helper ── */

interface SectionHeaderProps {
  icon: React.ReactNode;
  name: string;
  count: number;
  items: { confidence: number }[];
}

function SectionHeader({ icon, name, count, items }: SectionHeaderProps) {
  const avg = avgConf(items);
  const warn = hasLowConf(items);
  return (
    <div className="flex items-center gap-2 w-full">
      <span className="text-[#94A3B8]">{icon}</span>
      <span className="text-sm font-semibold text-[#F1F5F9]">{name}</span>
      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#1E2A45] text-[#94A3B8]">{count}</span>
      <span className={`w-2 h-2 rounded-full ${getConfDot(avg)}`} />
      {warn && <AlertTriangle className="w-3 h-3 text-[#F43F5E]" />}
    </div>
  );
}

/* ── PDF Viewer (Simulated Discharge Summary) ── */

function PDFViewer({ activeHighlight, onHighlightClick }: {
  activeHighlight: string | null;
  onHighlightClick: (id: string) => void;
}) {
  const [zoom, setZoom] = useState(100);
  const containerRef = useRef<HTMLDivElement>(null);

  const Highlight = ({ id, color, borderColor, children }: {
    id: string; color: string; borderColor: string; children: React.ReactNode;
  }) => {
    const isActive = activeHighlight === id;
    return (
      <span
        id={`hl-${id}`}
        onClick={() => onHighlightClick(id)}
        className="relative cursor-pointer inline"
        style={{ transition: "all 0.3s ease" }}
      >
        {children}
        <span
          className="absolute inset-0 rounded -mx-0.5 -my-0.5 pointer-events-none"
          style={{
            backgroundColor: color,
            border: isActive ? "3px solid #FBBF24" : `2px solid ${borderColor}`,
            transform: isActive ? "scale(1.01)" : "scale(1)",
            animation: isActive ? "pulse-glow 0.6s ease-in-out infinite" : "none",
          }}
        />
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#0F1629] rounded-lg overflow-hidden" style={{ boxShadow: "0 0 0 1px #1E2A45, 0 4px 24px rgba(0,0,0,0.4)" }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#151D35] border-b border-[#1E2A45]">
        <span className="text-xs font-medium text-[#F1F5F9]">Source Document</span>
        <span className="text-xs text-[#94A3B8]">Page 1 of 3</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setZoom(Math.max(50, zoom - 10))} className="text-[#94A3B8] hover:text-[#F1F5F9] transition-colors">
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-[#94A3B8] w-8 text-center">{zoom}%</span>
          <button onClick={() => setZoom(Math.min(150, zoom + 10))} className="text-[#94A3B8] hover:text-[#F1F5F9] transition-colors">
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Paper document */}
      <div ref={containerRef} className="flex-1 overflow-auto p-6 bg-[#0A0F1E]">
        <div
          className="mx-auto rounded-sm shadow-2xl"
          style={{
            transform: `scale(${zoom / 100})`,
            transformOrigin: "top center",
            transition: "transform 0.2s ease",
            maxWidth: "680px",
            backgroundColor: "#F8F9FA",
            color: "#1a1a2e",
          }}
        >
          <div className="p-8 text-[13px] leading-relaxed font-serif">
            {/* Hospital Letterhead */}
            <div className="text-center border-b-2 border-gray-400 pb-4 mb-5">
              <div className="text-lg font-bold tracking-wide text-gray-900">ALL INDIA INSTITUTE OF MEDICAL SCIENCES</div>
              <div className="text-xs text-gray-500 mt-0.5">Ansari Nagar, New Delhi – 110029</div>
              <div className="text-xs text-gray-500">Department of General Medicine</div>
              <div className="text-sm font-bold text-indigo-800 mt-2 tracking-wider">DISCHARGE SUMMARY</div>
            </div>

            {/* Patient Demographics Table */}
            <table className="w-full text-xs mb-5 border border-gray-300" cellPadding={6}>
              <tbody>
                <tr className="border-b border-gray-300">
                  <td className="font-semibold text-gray-600 w-1/4 bg-gray-100">Patient Name</td>
                  <td className="w-1/4"><Highlight id="patient-name" color="#10B98133" borderColor="#10B981">{mockPatient.name}</Highlight></td>
                  <td className="font-semibold text-gray-600 w-1/4 bg-gray-100">Age / Sex</td>
                  <td className="w-1/4">{mockPatient.age}Y / {mockPatient.gender}</td>
                </tr>
                <tr className="border-b border-gray-300">
                  <td className="font-semibold text-gray-600 bg-gray-100">ABHA ID</td>
                  <td className="font-mono text-xs">{mockPatient.abha}</td>
                  <td className="font-semibold text-gray-600 bg-gray-100">Blood Group</td>
                  <td>{mockPatient.bloodGroup}</td>
                </tr>
                <tr className="border-b border-gray-300">
                  <td className="font-semibold text-gray-600 bg-gray-100">Ward / Bed</td>
                  <td>{mockPatient.ward}</td>
                  <td className="font-semibold text-gray-600 bg-gray-100">Hospital</td>
                  <td>{mockPatient.hospital}</td>
                </tr>
                <tr className="border-b border-gray-300">
                  <td className="font-semibold text-gray-600 bg-gray-100">Date of Admission</td>
                  <td>{mockPatient.admission}</td>
                  <td className="font-semibold text-gray-600 bg-gray-100">Date of Discharge</td>
                  <td>{mockPatient.discharge}</td>
                </tr>
                <tr>
                  <td className="font-semibold text-gray-600 bg-gray-100">Attending Physician</td>
                  <td>{mockPatient.attending}, {mockPatient.attendingSpecialty}</td>
                  <td className="font-semibold text-gray-600 bg-gray-100">Resident</td>
                  <td>{mockPatient.resident}</td>
                </tr>
              </tbody>
            </table>

            {/* Chief Complaint */}
            <div className="mb-5">
              <div className="font-bold text-gray-800 text-sm mb-1 border-b border-gray-300 pb-1">CHIEF COMPLAINT</div>
              <p className="text-gray-700">
                <Highlight id="chief-complaint" color="#10B98133" borderColor="#10B981">
                  {mockPatient.chiefComplaint}
                </Highlight>
              </p>
            </div>

            {/* History of Present Illness */}
            <div className="mb-5">
              <div className="font-bold text-gray-800 text-sm mb-1 border-b border-gray-300 pb-1">HISTORY OF PRESENT ILLNESS</div>
              <p className="text-gray-700">
                A 45-year-old male patient presented with complaints of progressive fatigue, breathlessness on exertion (NYHA Class II), and bilateral pedal oedema of 3 weeks duration. Patient is a known case of Type 2 Diabetes Mellitus for 8 years and Hypertension for 5 years, on irregular medication. He reports decreased urine output and nocturia (2-3 episodes/night). No history of chest pain, orthopnoea, or PND. No history of haematuria or dysuria.
              </p>
            </div>

            {/* Past History */}
            <div className="mb-5">
              <div className="font-bold text-gray-800 text-sm mb-1 border-b border-gray-300 pb-1">PAST HISTORY</div>
              <p className="text-gray-700">
                Known case of Type 2 Diabetes Mellitus – 8 years (on OHA, irregular). Hypertension – 5 years. No known drug allergies. No prior surgical history. Non-smoker, occasional alcohol use.
              </p>
            </div>

            {/* Physical Examination */}
            <div className="mb-5">
              <div className="font-bold text-gray-800 text-sm mb-1 border-b border-gray-300 pb-1">PHYSICAL EXAMINATION</div>
              <p className="text-gray-700">
                General: Conscious, oriented, afebrile, pallor ++ . Vitals: BP {mockVitals[0].value}, Pulse {mockVitals[1].value}, SpO₂ {mockVitals[2].value}, Temp {mockVitals[3].value}. CVS: S1S2 normal, no murmurs. RS: Bilateral air entry equal, occasional basal crepitations. P/A: Soft, non-tender, no organomegaly. CNS: No focal neurological deficit. Extremities: Bilateral pedal oedema +, non-pitting.
              </p>
            </div>

            {/* Investigations */}
            <div className="mb-5">
              <div className="font-bold text-gray-800 text-sm mb-1 border-b border-gray-300 pb-1">INVESTIGATIONS</div>
              <table className="w-full text-xs border border-gray-300 mt-2" cellPadding={4}>
                <thead>
                  <tr className="bg-gray-200 text-gray-700 font-semibold">
                    <th className="text-left border-b border-gray-300">Test</th>
                    <th className="text-left border-b border-gray-300">Value</th>
                    <th className="text-left border-b border-gray-300">Unit</th>
                    <th className="text-left border-b border-gray-300">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {mockLabValues.map((l) => (
                    <tr key={l.test} className="border-b border-gray-200">
                      <td className="text-gray-700">{l.test}</td>
                      <td>
                        <Highlight
                          id={`lab-${l.loinc}`}
                          color="#F59E0B33"
                          borderColor="#F59E0B"
                        >
                          <span className={l.status !== "N" ? "font-bold" : ""}>
                            {l.value}
                          </span>
                        </Highlight>
                      </td>
                      <td className="text-gray-500">{l.unit}</td>
                      <td className="text-gray-500">{l.ref}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Diagnosis */}
            <div className="mb-5">
              <div className="font-bold text-gray-800 text-sm mb-1 border-b border-gray-300 pb-1">DIAGNOSIS</div>
              <ol className="list-decimal pl-5 space-y-1 text-gray-700">
                {mockDiagnoses.map((d) => (
                  <li key={d.icd}>
                    <Highlight id={`dx-${d.icd}`} color="#10B98133" borderColor="#10B981">
                      {d.name} (ICD: {d.icd})
                    </Highlight>
                  </li>
                ))}
              </ol>
            </div>

            {/* Treatment Given / Procedures */}
            <div className="mb-5">
              <div className="font-bold text-gray-800 text-sm mb-1 border-b border-gray-300 pb-1">TREATMENT GIVEN</div>
              <ul className="list-disc pl-5 space-y-1 text-gray-700">
                {mockProcedures.map((p) => (
                  <li key={p.snomed}>
                    <Highlight id={`proc-${p.snomed}`} color="#A855F733" borderColor="#A855F7">
                      {p.name} ({p.day}){p.findings ? ` — ${p.findings}` : ""}
                    </Highlight>
                  </li>
                ))}
              </ul>
            </div>

            {/* Discharge Medications */}
            <div className="mb-5">
              <div className="font-bold text-gray-800 text-sm mb-1 border-b border-gray-300 pb-1">DISCHARGE MEDICATIONS</div>
              <table className="w-full text-xs border border-gray-300 mt-2" cellPadding={4}>
                <thead>
                  <tr className="bg-gray-200 text-gray-700 font-semibold">
                    <th className="text-left border-b border-gray-300">Medication</th>
                    <th className="text-left border-b border-gray-300">Dosage</th>
                    <th className="text-left border-b border-gray-300">Route</th>
                  </tr>
                </thead>
                <tbody>
                  {mockMedications.map((m) => (
                    <tr key={m.name} className="border-b border-gray-200">
                      <td>
                        <Highlight id={`med-${m.name.split(" ")[0].toLowerCase()}`} color="#6366F133" borderColor="#6366F1">
                          {m.name}
                        </Highlight>
                      </td>
                      <td className="text-gray-600">{m.dosage}</td>
                      <td className="text-gray-600">{m.route}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Discharge Instructions */}
            <div className="mb-5">
              <div className="font-bold text-gray-800 text-sm mb-1 border-b border-gray-300 pb-1">DISCHARGE INSTRUCTIONS</div>
              <ul className="list-disc pl-5 space-y-1 text-gray-700">
                <li>Low salt diet (&lt;2g/day), diabetic diet</li>
                <li>Fluid restriction 1.5L/day</li>
                <li>Monitor BP twice daily</li>
                <li>Avoid NSAIDs</li>
              </ul>
            </div>

            {/* Follow-Up */}
            <div className="mb-5">
              <div className="font-bold text-gray-800 text-sm mb-1 border-b border-gray-300 pb-1">FOLLOW-UP</div>
              <ul className="list-disc pl-5 space-y-1 text-gray-700">
                <li>Nephrology OPD in 2 weeks</li>
                <li>Repeat labs (CBC, RFT, HbA1c, Urine ACR) in 4 weeks</li>
              </ul>
            </div>

            {/* Signatures */}
            <div className="mt-8 pt-4 border-t border-gray-300 flex justify-between text-xs text-gray-600">
              <div>
                <div className="font-semibold">{mockPatient.resident}</div>
                <div>Junior Resident, General Medicine</div>
              </div>
              <div className="text-right">
                <div className="font-semibold">{mockPatient.attending}</div>
                <div>{mockPatient.attendingSpecialty}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ── */

export default function ClinicalReview() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const docId = searchParams.get("docId");
  const { toast } = useToast();
  const [activeHighlight, setActiveHighlight] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [acceptedFields, setAcceptedFields] = useState<Set<string>>(new Set());
  const [extractedData, setExtractedData] = useState<Record<string, any> | null>(null);

  // Fetch extracted data from API when docId is available
  useEffect(() => {
    if (docId) {
      getExtractedData(docId)
        .then((data) => {
          if (data && Object.keys(data).length > 0) {
            setExtractedData(data);
            toast({ title: "Extracted data loaded", description: `Document ${docId.slice(0, 8)}…` });
          }
        })
        .catch(() => {
          toast({ title: "Using demo data", description: "Could not fetch extracted data from API" });
        });
    }
  }, [docId]);

  // Collect all fields with their IDs and confidences for the Accept All logic
  const allFields = useMemo(() => {
    const fields: { id: string; confidence: number }[] = [];
    fields.push({ id: 'chief-complaint', confidence: 93 });
    mockDiagnoses.forEach(d => fields.push({ id: `dx-${d.icd}`, confidence: d.confidence }));
    mockProcedures.forEach(p => fields.push({ id: `proc-${p.snomed}`, confidence: p.confidence }));
    mockMedications.forEach(m => fields.push({ id: `med-${m.name}`, confidence: m.confidence }));
    mockLabValues.forEach(l => fields.push({ id: `lab-${l.loinc}`, confidence: l.confidence }));
    mockVitals.forEach(v => fields.push({ id: `vital-${v.name}`, confidence: v.confidence }));
    mockDischargeInstructions.forEach(d => fields.push({ id: `discharge-${d.label}`, confidence: d.confidence }));
    mockFollowUp.forEach(f => fields.push({ id: `followup-${f.label}`, confidence: f.confidence }));
    return fields;
  }, []);

  const totalFields = allFields.length;
  const needReview = Math.max(0, totalFields - acceptedFields.size);
  const highConfCount = allFields.filter(f => f.confidence >= 80).length;

  const handleAcceptAll = () => {
    const toAccept = new Set(allFields.filter(f => f.confidence >= 80).map(f => f.id));
    setAcceptedFields(toAccept);
    toast({ title: `${toAccept.size} fields accepted`, description: 'All fields with confidence ≥80% marked as accepted.' });
  };

  const scrollToHighlight = useCallback((id: string) => {
    setActiveHighlight(id);
    const el = document.getElementById(`hl-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setTimeout(() => setActiveHighlight(null), 3000);
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      if (docId) {
        await triggerValidation(docId);
        toast({ title: "FHIR Bundle generated", description: "Validation triggered via API" });
        navigate(`/validate?docId=${docId}`);
      } else {
        // Mock flow
        setTimeout(() => {
          setIsGenerating(false);
          toast({ title: "FHIR Bundle generated", description: "31 resources created successfully." });
          navigate("/validate");
        }, 2000);
        return;
      }
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="h-[calc(100vh-80px)] -mx-6 -my-6 flex flex-col"
    >
      {/* Split panels */}
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* LEFT: PDF Panel */}
          <ResizablePanel defaultSize={50} minSize={30}>
            <div className="h-full p-3">
              <PDFViewer activeHighlight={activeHighlight} onHighlightClick={setActiveHighlight} />
            </div>
          </ResizablePanel>

          {/* Resizable Handle */}
          <ResizableHandle withHandle className="w-2 bg-[#1E2A45]/50 hover:bg-[#4F46E5]/30 transition-colors data-[resize-handle-active]:bg-[#4F46E5]/50">
            <div className="flex flex-col items-center justify-center h-full">
              <GripVertical className="w-4 h-4 text-[#94A3B8]" />
            </div>
          </ResizableHandle>

          {/* RIGHT: Extraction Form */}
          <ResizablePanel defaultSize={50} minSize={30}>
            <div className="h-full flex flex-col">
              {/* Sticky action bar */}
              <div className="flex items-center justify-between px-4 py-3 bg-[#151D35] border-b border-[#1E2A45] shrink-0">
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 rounded-md bg-[#4F46E5]/20 text-[#4F46E5] text-xs font-medium">
                    {totalFields} fields extracted
                  </span>
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#F59E0B]/20 text-[#F59E0B] text-xs font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] animate-pulse" />
                    {needReview} need review
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleAcceptAll}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#10B981]/20 text-[#10B981] text-xs font-medium hover:bg-[#10B981]/30 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Accept All ≥80%
                    <span className="ml-1 px-1 py-0.5 rounded bg-[#10B981]/30 text-[10px]">{highConfCount}</span>
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => { setAcceptedFields(new Set()); toast({ title: 'Reset to AI output', description: 'All field acceptances cleared.' }); }}
                    className="px-3 py-1.5 rounded-md text-xs text-[#94A3B8] hover:text-[#F1F5F9] border border-[#1E2A45] transition-colors"
                  >
                    Reset to AI Output
                  </motion.button>
                </div>
              </div>

              {/* Scrollable sections */}
              <div className="flex-1 overflow-auto px-4 py-3">
                <Accordion
                  type="multiple"
                  defaultValue={["chief", "diagnoses", "procedures", "medications", "labs", "vitals", "discharge", "followup"]}
                  className="space-y-2"
                >
                  {/* Chief Complaint */}
                  <AccordionItem value="chief" className="border border-[#1E2A45] rounded-lg overflow-hidden">
                    <AccordionTrigger className="px-4 py-3 bg-[#0F1629] hover:bg-[#151D35] text-sm">
                      <SectionHeader
                        icon={<ClipboardList className="w-4 h-4" />}
                        name="Chief Complaint"
                        count={1}
                        items={[{ confidence: 93 }]}
                      />
                    </AccordionTrigger>
                    <AccordionContent className="px-2 py-2 bg-[#080D1A]">
                      <FieldRow
                        label="Chief Complaint"
                        value={mockPatient.chiefComplaint}
                        confidence={93}
                        onSource={() => scrollToHighlight("chief-complaint")}
                        accepted={acceptedFields.has('chief-complaint')}
                        onAccept={() => setAcceptedFields(prev => new Set([...prev, 'chief-complaint']))}
                      />
                    </AccordionContent>
                  </AccordionItem>

                  {/* Diagnoses */}
                  <AccordionItem value="diagnoses" className="border border-[#1E2A45] rounded-lg overflow-hidden">
                    <AccordionTrigger className="px-4 py-3 bg-[#0F1629] hover:bg-[#151D35] text-sm">
                      <SectionHeader
                        icon={<Heart className="w-4 h-4" />}
                        name="Diagnoses"
                        count={mockDiagnoses.length}
                        items={mockDiagnoses}
                      />
                    </AccordionTrigger>
                    <AccordionContent className="px-2 py-2 bg-[#080D1A]">
                      {mockDiagnoses.map((d, i) => (
                        <FieldRow
                          key={d.icd}
                          label="Diagnosis"
                          value={d.name}
                          confidence={d.confidence}
                          index={i}
                          codes={[
                            { system: "ICD", code: d.icd, description: `ICD-10: ${d.name}` },
                            { system: "SNOMED", code: d.snomed, description: `SNOMED CT: ${d.name}` },
                          ]}
                          onSource={() => scrollToHighlight(`dx-${d.icd}`)}
                          accepted={acceptedFields.has(`dx-${d.icd}`)}
                          onAccept={() => setAcceptedFields(prev => new Set([...prev, `dx-${d.icd}`]))}
                        />
                      ))}
                    </AccordionContent>
                  </AccordionItem>

                  {/* Procedures */}
                  <AccordionItem value="procedures" className="border border-[#1E2A45] rounded-lg overflow-hidden">
                    <AccordionTrigger className="px-4 py-3 bg-[#0F1629] hover:bg-[#151D35] text-sm">
                      <SectionHeader
                        icon={<Stethoscope className="w-4 h-4" />}
                        name="Procedures"
                        count={mockProcedures.length}
                        items={mockProcedures}
                      />
                    </AccordionTrigger>
                    <AccordionContent className="px-2 py-2 bg-[#080D1A]">
                      {mockProcedures.map((p, i) => (
                        <FieldRow
                          key={p.snomed}
                          label={p.day}
                          value={`${p.name}${p.findings ? ` — ${p.findings}` : ""}`}
                          confidence={p.confidence}
                          index={i}
                          codes={[{ system: "SNOMED", code: p.snomed, description: `SNOMED CT procedure code for ${p.name}` }]}
                          onSource={() => scrollToHighlight(`proc-${p.snomed}`)}
                          accepted={acceptedFields.has(`proc-${p.snomed}`)}
                          onAccept={() => setAcceptedFields(prev => new Set([...prev, `proc-${p.snomed}`]))}
                        />
                      ))}
                    </AccordionContent>
                  </AccordionItem>

                  {/* Medications */}
                  <AccordionItem value="medications" className="border border-[#1E2A45] rounded-lg overflow-hidden">
                    <AccordionTrigger className="px-4 py-3 bg-[#0F1629] hover:bg-[#151D35] text-sm">
                      <SectionHeader
                        icon={<Pill className="w-4 h-4" />}
                        name="Medications"
                        count={mockMedications.length}
                        items={mockMedications}
                      />
                    </AccordionTrigger>
                    <AccordionContent className="px-2 py-2 bg-[#080D1A]">
                      {mockMedications.map((m, i) => (
                        <FieldRow
                          key={m.name}
                          label={`${m.route} · ${m.dosage}`}
                          value={m.name}
                          confidence={m.confidence}
                          index={i}
                          onSource={() => scrollToHighlight(`med-${m.name.split(" ")[0].toLowerCase()}`)}
                          accepted={acceptedFields.has(`med-${m.name}`)}
                          onAccept={() => setAcceptedFields(prev => new Set([...prev, `med-${m.name}`]))}
                        />
                      ))}
                    </AccordionContent>
                  </AccordionItem>

                  {/* Lab Investigations (table) */}
                  <AccordionItem value="labs" className="border border-[#1E2A45] rounded-lg overflow-hidden">
                    <AccordionTrigger className="px-4 py-3 bg-[#0F1629] hover:bg-[#151D35] text-sm">
                      <SectionHeader
                        icon={<FlaskConical className="w-4 h-4" />}
                        name="Lab Investigations"
                        count={mockLabValues.length}
                        items={mockLabValues}
                      />
                    </AccordionTrigger>
                    <AccordionContent className="px-2 py-2 bg-[#080D1A]">
                      <div className="rounded-md overflow-hidden border border-[#1E2A45]">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-[#151D35] text-[#94A3B8] text-left">
                              <th className="px-3 py-2 font-medium">Test</th>
                              <th className="px-3 py-2 font-medium">Value</th>
                              <th className="px-3 py-2 font-medium">Unit</th>
                              <th className="px-3 py-2 font-medium">Reference</th>
                              <th className="px-3 py-2 font-medium">Status</th>
                              <th className="px-3 py-2 font-medium">Confidence</th>
                              <th className="px-3 py-2 font-medium">LOINC</th>
                            </tr>
                          </thead>
                          <tbody>
                            {mockLabValues.map((l, i) => (
                              <tr
                                key={l.test}
                                onClick={() => scrollToHighlight(`lab-${l.loinc}`)}
                                className={`border-t border-[#1E2A45] cursor-pointer hover:bg-[#151D35] transition-colors ${i % 2 === 0 ? "bg-[#0F1629]" : "bg-[#080D1A]"
                                  } ${l.status === "H" ? "bg-rose-950/20" : l.status === "L" ? "bg-blue-950/20" : ""
                                  }`}
                              >
                                <td className="px-3 py-2 text-[#F1F5F9] font-medium">{l.test}</td>
                                <td className={`px-3 py-2 font-mono font-medium ${l.status === "H" ? "text-[#F43F5E]" : l.status === "L" ? "text-blue-400" : "text-[#94A3B8]"
                                  }`}>
                                  {l.value}
                                </td>
                                <td className="px-3 py-2 text-[#94A3B8]">{l.unit}</td>
                                <td className="px-3 py-2 text-[#94A3B8] font-mono">{l.ref}</td>
                                <td className="px-3 py-2">
                                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${l.status === "H" ? "bg-[#F43F5E]/20 text-[#F43F5E]"
                                    : l.status === "L" ? "bg-blue-500/20 text-blue-400"
                                      : "bg-[#1E2A45] text-[#94A3B8]"
                                    }`}>
                                    {l.status}
                                  </span>
                                </td>
                                <td className="px-3 py-2"><ConfBadge value={l.confidence} /></td>
                                <td className="px-3 py-2"><CodeChip system="LOINC" code={l.loinc} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Vitals */}
                  <AccordionItem value="vitals" className="border border-[#1E2A45] rounded-lg overflow-hidden">
                    <AccordionTrigger className="px-4 py-3 bg-[#0F1629] hover:bg-[#151D35] text-sm">
                      <SectionHeader
                        icon={<Activity className="w-4 h-4" />}
                        name="Vitals"
                        count={mockVitals.length}
                        items={mockVitals}
                      />
                    </AccordionTrigger>
                    <AccordionContent className="px-2 py-2 bg-[#080D1A]">
                      {mockVitals.map((v, i) => (
                        <FieldRow
                          key={v.name}
                          label={v.name}
                          value={v.value}
                          confidence={v.confidence}
                          index={i}
                          accepted={acceptedFields.has(`vital-${v.name}`)}
                          onAccept={() => setAcceptedFields(prev => new Set([...prev, `vital-${v.name}`]))}
                        />
                      ))}
                    </AccordionContent>
                  </AccordionItem>

                  {/* Discharge Instructions */}
                  <AccordionItem value="discharge" className="border border-[#1E2A45] rounded-lg overflow-hidden">
                    <AccordionTrigger className="px-4 py-3 bg-[#0F1629] hover:bg-[#151D35] text-sm">
                      <SectionHeader
                        icon={<FileText className="w-4 h-4" />}
                        name="Discharge Instructions"
                        count={mockDischargeInstructions.length}
                        items={mockDischargeInstructions}
                      />
                    </AccordionTrigger>
                    <AccordionContent className="px-2 py-2 bg-[#080D1A]">
                      {mockDischargeInstructions.map((d, i) => (
                        <FieldRow
                          key={d.label}
                          label={d.label}
                          value={d.value}
                          confidence={d.confidence}
                          index={i}
                          accepted={acceptedFields.has(`discharge-${d.label}`)}
                          onAccept={() => setAcceptedFields(prev => new Set([...prev, `discharge-${d.label}`]))}
                        />
                      ))}
                    </AccordionContent>
                  </AccordionItem>

                  {/* Follow-Up */}
                  <AccordionItem value="followup" className="border border-[#1E2A45] rounded-lg overflow-hidden">
                    <AccordionTrigger className="px-4 py-3 bg-[#0F1629] hover:bg-[#151D35] text-sm">
                      <SectionHeader
                        icon={<Calendar className="w-4 h-4" />}
                        name="Follow-Up"
                        count={mockFollowUp.length}
                        items={mockFollowUp}
                      />
                    </AccordionTrigger>
                    <AccordionContent className="px-2 py-2 bg-[#080D1A]">
                      {mockFollowUp.map((f, i) => (
                        <FieldRow
                          key={f.label}
                          label={f.label}
                          value={f.value}
                          confidence={f.confidence}
                          index={i}
                          accepted={acceptedFields.has(`followup-${f.label}`)}
                          onAccept={() => setAcceptedFields(prev => new Set([...prev, `followup-${f.label}`]))}
                        />
                      ))}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>

              {/* Sticky bottom bar */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-[#1E2A45] bg-[#151D35] shrink-0">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate("/")}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm text-[#94A3B8] hover:text-[#F1F5F9] border border-[#1E2A45] transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> Back to Upload
                </motion.button>
                <div className="text-xs text-[#94A3B8] hidden lg:block">
                  Avg Confidence: <span className="text-[#10B981] font-medium">92%</span> · {totalFields}/{totalFields} fields extracted
                </div>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="shimmer-btn flex items-center gap-2 px-6 py-2.5 rounded-md bg-[#4F46E5] text-white text-sm font-medium disabled:opacity-70"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Generating...
                    </>
                  ) : (
                    <>
                      Generate FHIR Bundle <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Loading overlay */}
      <AnimatePresence>
        {isGenerating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center gap-4 p-8 rounded-xl bg-[#151D35] border border-[#1E2A45]"
            >
              <Loader2 className="w-10 h-10 text-[#4F46E5] animate-spin" />
              <div className="text-lg font-semibold text-[#F1F5F9]">Generating FHIR Bundle</div>
              <div className="text-sm text-[#94A3B8]">Converting 61 fields into 31 FHIR resources...</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
