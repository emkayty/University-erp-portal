"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/erp/confirm-action";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useCycles,
  useApplications,
  useApplication,
  useUpdateApplicationStatus,
  useCreateCycle,
  useActivateCycle,
  useScreenBulk,
  useOLevelEligibility,
  useAdmissionEligibility,
  useVerifyOLevelResults,
  useVerifyJamb,
  useVerifyApplicationDocument,
  useRecordOLevelResults,
  useAdmissionRequirements,
  useCreateAdmissionRequirement,
  useAccessibilitySupport,
  useUpdateAccessibilitySupport,
  useApplicationChangeRequests,
  useUpdateApplicationChangeRequest,
} from "@/hooks/use-admissions";
import { useAuthStore } from "@/stores/auth.store";
import { useProgrammes } from "@/hooks/use-curriculum";
import { cn, formatDate } from "@/lib/utils";
import type { ApplicantV1 } from "@uniportal/types";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "badge-neutral",
  SCREENED: "badge-info",
  OFFERED: "badge-warning",
  ACCEPTED: "badge-success",
  REJECTED: "badge-danger",
  WITHDRAWN: "badge-neutral",
  MATRICULATED: "badge-success",
};

const ADMISSION_TYPES = [
  "UTME",
  "DE",
  "TRANSFER",
  "POSTGRADUATE",
  "SANDWICH",
  "INTERNATIONAL",
  "REMEDIAL",
];
const SUPPORT_STATUS_OPTIONS = [
  "REQUESTED",
  "CONTACTED",
  "ARRANGED",
  "DECLINED",
  "CLOSED",
] as const;

const cycleSchema = z.object({
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/, "Format: YYYY/YYYY"),
  cycleName: z.string().min(2),
  admissionType: z.string().min(1),
  openDate: z.string().min(1),
  closeDate: z.string().min(1),
  utmeMinScore: z.coerce.number().min(0).max(400).optional(),
});
type CycleForm = z.infer<typeof cycleSchema>;

export default function AdmissionsPage() {
  const user = useAuthStore((s) => s.user);
  const effectiveRoles = user?.effectiveRoles?.length
    ? user.effectiveRoles
    : user?.primaryRole
      ? [user.primaryRole]
      : [];
  const canManage = effectiveRoles.some((role) =>
    ["SUPER_ADMIN", "REGISTRAR"].includes(role),
  );
  const isStaff = effectiveRoles.some((role) =>
    ["SUPER_ADMIN", "REGISTRAR", "STAFF", "SUPPORT_STAFF"].includes(role),
  );

  const [tab, setTab] = useState<"cycles" | "applications">("applications");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [selectedCycleId, setSelectedCycle] = useState("");
  const [selectedApp, setSelectedApp] = useState<ApplicantV1 | null>(null);
  const [showCycleForm, setShowCycleForm] = useState(false);
  const [actionError, setActionError] = useState("");
  const [screenResult, setScreenResult] = useState<{
    screened: number;
    rejected: number;
    skipped: number;
    dryRun: boolean;
  } | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectionForm, setShowRejectionForm] = useState(false);
  const [pendingRejection, setPendingRejection] = useState<ApplicantV1 | null>(
    null,
  );
  const [supportOfficerId, setSupportOfficerId] = useState("");
  const [changeNote, setChangeNote] = useState<Record<string, string>>({});
  const [pendingScreenCycleId, setPendingScreenCycleId] = useState<
    string | null
  >(null);
  const [jambScore, setJambScore] = useState("");
  const [verificationRemarks, setVerificationRemarks] = useState("");
  const [requirementProgrammeId, setRequirementProgrammeId] = useState("");
  const [requirementYear, setRequirementYear] = useState("");
  const [requirementType, setRequirementType] = useState("UTME");
  const [requirementMinUtme, setRequirementMinUtme] = useState("");
  const [requirementMinCredits, setRequirementMinCredits] = useState("5");
  const [requirementMaxSittings, setRequirementMaxSittings] = useState("2");
  const [requirementEnglish, setRequirementEnglish] = useState(true);
  const [requirementMath, setRequirementMath] = useState(true);
  const [requirementDocuments, setRequirementDocuments] = useState("");
  const [olevelSubject, setOlevelSubject] = useState("");
  const [olevelGrade, setOlevelGrade] = useState("C6");
  const [olevelExamType, setOlevelExamType] = useState("WAEC");
  const [olevelCandidateNumber, setOlevelCandidateNumber] = useState("");
  const [olevelExaminationNumber, setOlevelExaminationNumber] = useState("");
  const [olevelCentreNumber, setOlevelCentreNumber] = useState("");
  const [olevelExamYear, setOlevelExamYear] = useState(
    String(new Date().getFullYear()),
  );
  const [olevelSitting, setOlevelSitting] = useState("1");

  const { data: cycles = [] } = useCycles();
  const { data: programmes = [] } = useProgrammes();

  const { data: apps = [], isLoading } = useApplications({
    status: statusFilter || undefined,
    admissionType: typeFilter || undefined,
    cycleId: selectedCycleId || undefined,
    pageSize: 100,
  });

  const { data: selectedApplication } = useApplication(selectedApp?.id ?? "");
  const { data: oLevelEligibility } = useOLevelEligibility(selectedApp?.id);
  const { data: admissionEligibility } = useAdmissionEligibility(
    selectedApp?.id,
  );
  const { data: accessibilitySupport, isLoading: supportLoading } =
    useAccessibilitySupport(selectedApp?.id);
  const { data: changeRequests = [], isLoading: changeRequestsLoading } =
    useApplicationChangeRequests(selectedApp?.id);
  const { mutate: updateSupport, isPending: updatingSupport } =
    useUpdateAccessibilitySupport();
  const { mutate: updateChangeRequest, isPending: updatingChangeRequest } =
    useUpdateApplicationChangeRequest();
  const { mutate: createCycle, isPending: creating } = useCreateCycle();
  const { mutate: activateCycle, isPending: activating } = useActivateCycle();
  const { mutate: updateStatus, isPending: updating } =
    useUpdateApplicationStatus();
  const { mutate: screenBulk, isPending: screening } = useScreenBulk();
  const { mutate: verifyOLevel, isPending: verifyingOLevel } =
    useVerifyOLevelResults();
  const { mutate: recordOLevel, isPending: recordingOLevel } =
    useRecordOLevelResults();
  const { mutate: verifyJamb, isPending: verifyingJamb } = useVerifyJamb();
  const { mutate: verifyDocument, isPending: verifyingDocument } =
    useVerifyApplicationDocument();
  const { data: admissionRequirements = [] } = useAdmissionRequirements(
    {
      programmeId: requirementProgrammeId || undefined,
      academicYear: requirementYear || undefined,
    },
    { enabled: canManage && Boolean(requirementProgrammeId) },
  );
  const { mutate: createRequirement, isPending: creatingRequirement } =
    useCreateAdmissionRequirement();

  const cycleForm = useForm<CycleForm>({ resolver: zodResolver(cycleSchema) });

  const handleCreateCycle = cycleForm.handleSubmit((data) => {
    setActionError("");
    createCycle(data, {
      onSuccess: () => {
        setShowCycleForm(false);
        cycleForm.reset();
      },
      onError: (e) => setActionError(e.message),
    });
  });

  const handleCreateRequirement = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !requirementProgrammeId ||
      !/^[0-9]{4}\/[0-9]{4}$/.test(requirementYear.trim())
    ) {
      setActionError(
        "Select a programme and provide an academic year such as 2026/2027.",
      );
      return;
    }
    setActionError("");
    createRequirement(
      {
        programmeId: requirementProgrammeId,
        admissionType: requirementType,
        academicYear: requirementYear.trim(),
        minUtmeScore: requirementMinUtme
          ? Number(requirementMinUtme)
          : undefined,
        minOLevelCredits: requirementMinCredits
          ? Number(requirementMinCredits)
          : undefined,
        maxOLevelSittings: requirementMaxSittings
          ? Number(requirementMaxSittings)
          : undefined,
        requireEnglish: requirementEnglish,
        requireMathematics: requirementMath,
        requiredDocuments: requirementDocuments
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      },
      {
        onSuccess: () => setActionError("Admission requirement draft saved."),
        onError: (error) => setActionError(error.message),
      },
    );
  };

  const handleRecordOLevel = () => {
    if (
      !selectedApp ||
      !olevelSubject.trim() ||
      !["WAEC", "NECO", "NABTEB", "NBAIS", "GCE"].includes(olevelExamType) ||
      !/^[0-9]{4}$/.test(olevelExamYear) ||
      !["1", "2"].includes(olevelSitting)
    ) {
      setActionError(
        "Provide a subject, exam type, four-digit exam year, and sitting 1 or 2 before recording the result.",
      );
      return;
    }
    setActionError("");
    recordOLevel(
      {
        applicantId: selectedApp.id,
        replaceExisting: false,
        results: [
          {
            subject: olevelSubject.trim(),
            grade: olevelGrade,
            examType: olevelExamType,
            candidateNumber: olevelCandidateNumber.trim() || undefined,
            examinationNumber: olevelExaminationNumber.trim() || undefined,
            centreNumber: olevelCentreNumber.trim() || undefined,
            examYear: Number(olevelExamYear),
            sittingNumber: Number(olevelSitting),
          },
        ],
      },
      {
        onSuccess: () => {
          setActionError(
            "O’Level subject result recorded. Add the remaining verified subjects, then verify the complete sitting.",
          );
          setOlevelSubject("");
          setOlevelCandidateNumber("");
          setOlevelExaminationNumber("");
          setOlevelCentreNumber("");
        },
        onError: (error) => setActionError(error.message),
      },
    );
  };

  const handleStatusUpdate = (id: string, status: string, reason?: string) => {
    setActionError("");
    updateStatus(
      { id, status, rejectionReason: reason },
      {
        onSuccess: () => {
          setSelectedApp(null);
          setShowRejectionForm(false);
          setRejectionReason("");
        },
        onError: (e) => setActionError(e.message),
      },
    );
  };

  const handleSupportUpdate = (
    status: NonNullable<typeof accessibilitySupport>["status"],
  ) => {
    if (!selectedApp || !status) return;
    setActionError("");
    updateSupport(
      {
        applicantId: selectedApp.id,
        status,
        assignedSupportOfficerId:
          supportOfficerId ||
          accessibilitySupport?.assignedSupportOfficerId ||
          undefined,
      },
      {
        onSuccess: () => setSupportOfficerId(""),
        onError: (error) => setActionError(error.message),
      },
    );
  };

  const handleChangeRequestUpdate = (
    requestId: string,
    status: "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "COMPLETED",
  ) => {
    if (!selectedApp) return;
    setActionError("");
    updateChangeRequest(
      {
        applicantId: selectedApp.id,
        requestId,
        status,
        note: changeNote[requestId] || undefined,
      },
      {
        onSuccess: () =>
          setChangeNote((current) => ({ ...current, [requestId]: "" })),
        onError: (error) => setActionError(error.message),
      },
    );
  };

  const handleScreenBulk = (cycleId: string, dry = false) => {
    setActionError("");
    setScreenResult(null);
    screenBulk(
      { admissionCycleId: cycleId, dryRun: dry },
      {
        onSuccess: (r) => setScreenResult(r),
        onError: (e) => setActionError(e.message),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Admissions</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setTab("applications")}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              tab === "applications"
                ? "bg-[--color-primary] text-white"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            Applications
          </button>
          <button
            onClick={() => setTab("cycles")}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              tab === "cycles"
                ? "bg-[--color-primary] text-white"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            Cycles
          </button>
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-[--color-danger]"
        >
          {actionError}
        </div>
      )}
      <ConfirmAction
        open={!!pendingScreenCycleId}
        title="Screen pending applicants"
        description="Screen all pending applicants in this UTME cycle against the configured cut-off? This will update applicant screening outcomes and record the operation."
        confirmLabel="Screen applicants"
        onCancel={() => setPendingScreenCycleId(null)}
        onConfirm={() => {
          if (!pendingScreenCycleId) return;
          handleScreenBulk(pendingScreenCycleId, false);
          setPendingScreenCycleId(null);
        }}
      />
      <ConfirmAction
        open={!!pendingRejection}
        title="Reject admission application"
        description={`Confirm rejection of ${pendingRejection?.applicationNo ?? "this application"}. The applicant-facing decision and the supplied reason will be recorded.`}
        confirmLabel="Confirm rejection"
        destructive
        onCancel={() => setPendingRejection(null)}
        onConfirm={() => {
          if (!pendingRejection) return;
          handleStatusUpdate(
            pendingRejection.id,
            "REJECTED",
            rejectionReason.trim(),
          );
          setPendingRejection(null);
        }}
      />

      {/* ── Cycles tab ──────────────────────────────────────────────────── */}
      {tab === "cycles" && (
        <div className="space-y-4">
          {canManage && (
            <Button size="sm" onClick={() => setShowCycleForm(!showCycleForm)}>
              {showCycleForm ? "Cancel" : "+ New Cycle"}
            </Button>
          )}
          {showCycleForm && (
            <Card className="border-[--color-primary]/30">
              <CardContent className="pt-4">
                <form
                  onSubmit={handleCreateCycle}
                  className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                >
                  {[
                    {
                      id: "academicYear",
                      label: "Academic Year",
                      ph: "2025/2026",
                    },
                    {
                      id: "cycleName",
                      label: "Cycle Name",
                      ph: "Main Admission 2025",
                    },
                    { id: "openDate", label: "Open Date", type: "date" },
                    { id: "closeDate", label: "Close Date", type: "date" },
                    {
                      id: "utmeMinScore",
                      label: "UTME Min Score",
                      type: "number",
                    },
                  ].map(({ id, label, ph, type = "text" }) => (
                    <div key={id} className="space-y-1">
                      <Label htmlFor={id}>{label}</Label>
                      <Input
                        id={id}
                        type={type}
                        placeholder={ph}
                        {...cycleForm.register(id as keyof CycleForm)}
                      />
                    </div>
                  ))}
                  <div className="space-y-1">
                    <Label htmlFor="admissionType">Type</Label>
                    <select
                      id="admissionType"
                      {...cycleForm.register("admissionType")}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">Select…</option>
                      {ADMISSION_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <Button type="submit" size="sm" loading={creating}>
                      Create Cycle
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
          {canManage && (
            <Card className="border-[--color-primary]/30">
              <CardHeader>
                <CardTitle className="text-base">
                  Programme admission requirements
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Configure the Nigerian and international entry evidence used
                  by screening and complete eligibility evaluation. Requirements
                  are versioned by programme, admission type, and academic year.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <form
                  onSubmit={handleCreateRequirement}
                  className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                >
                  <label className="text-xs font-medium text-muted-foreground lg:col-span-2">
                    Programme
                    <select
                      value={requirementProgrammeId}
                      onChange={(event) =>
                        setRequirementProgrammeId(event.target.value)
                      }
                      required
                      className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                    >
                      <option value="">Select programme</option>
                      {programmes
                        .filter((programme) => programme.isActive)
                        .map((programme) => (
                          <option key={programme.id} value={programme.id}>
                            {programme.code} · {programme.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-muted-foreground">
                    Academic year
                    <input
                      value={requirementYear}
                      onChange={(event) =>
                        setRequirementYear(event.target.value)
                      }
                      placeholder="2026/2027"
                      required
                      pattern="\\d{4}/\\d{4}"
                      className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                    />
                  </label>
                  <label className="text-xs font-medium text-muted-foreground">
                    Admission type
                    <select
                      value={requirementType}
                      onChange={(event) =>
                        setRequirementType(event.target.value)
                      }
                      className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                    >
                      {ADMISSION_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-muted-foreground">
                    Minimum UTME score
                    <input
                      type="number"
                      min="0"
                      max="400"
                      value={requirementMinUtme}
                      onChange={(event) =>
                        setRequirementMinUtme(event.target.value)
                      }
                      placeholder="Optional"
                      className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                    />
                  </label>
                  <label className="text-xs font-medium text-muted-foreground">
                    Minimum O’Level credits
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={requirementMinCredits}
                      onChange={(event) =>
                        setRequirementMinCredits(event.target.value)
                      }
                      className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                    />
                  </label>
                  <label className="text-xs font-medium text-muted-foreground">
                    Maximum sittings
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={requirementMaxSittings}
                      onChange={(event) =>
                        setRequirementMaxSittings(event.target.value)
                      }
                      className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={requirementEnglish}
                      onChange={(event) =>
                        setRequirementEnglish(event.target.checked)
                      }
                    />{" "}
                    Require English
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={requirementMath}
                      onChange={(event) =>
                        setRequirementMath(event.target.checked)
                      }
                    />{" "}
                    Require Mathematics
                  </label>
                  <label className="text-xs font-medium text-muted-foreground lg:col-span-2">
                    Required document codes
                    <input
                      value={requirementDocuments}
                      onChange={(event) =>
                        setRequirementDocuments(event.target.value)
                      }
                      placeholder="OLEVEL_CERTIFICATE, JAMB_RESULT"
                      className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                    />
                  </label>
                  <div className="lg:col-span-4">
                    <Button
                      type="submit"
                      size="sm"
                      loading={creatingRequirement}
                    >
                      Save requirement
                    </Button>
                  </div>
                </form>
                {requirementProgrammeId && (
                  <div className="border-t pt-3">
                    <p className="mb-2 text-xs font-semibold">
                      Existing requirements
                    </p>
                    {admissionRequirements.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No requirement configured for this programme and year
                        filter.
                      </p>
                    ) : (
                      <div className="grid gap-2 md:grid-cols-2">
                        {admissionRequirements.map((requirement) => (
                          <div
                            key={requirement.id}
                            className="rounded-md border p-3 text-xs"
                          >
                            <p className="font-medium">
                              {requirement.admissionType} ·{" "}
                              {requirement.academicYear}
                            </p>
                            <p className="mt-1 text-muted-foreground">
                              UTME {requirement.minUtmeScore ?? "—"} · O’Level
                              credits {requirement.minOLevelCredits ?? "—"} ·
                              sittings {requirement.maxOLevelSittings ?? "—"}
                            </p>
                            <p className="mt-1 text-muted-foreground">
                              English{" "}
                              {requirement.requireEnglish
                                ? "required"
                                : "not required"}{" "}
                              · Mathematics{" "}
                              {requirement.requireMathematics
                                ? "required"
                                : "not required"}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cycles.map((c) => (
              <Card key={c.id} className="border-border">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {c.cycleName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.academicYear} · {c.admissionType}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(c.openDate)} → {formatDate(c.closeDate)}
                      </p>
                      {c.utmeMinScore && (
                        <p className="text-xs text-muted-foreground">
                          Cut-off: {c.utmeMinScore}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {c._count?.applicants ?? 0} applicant(s)
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        c.isActive ? "badge-success" : "badge-neutral",
                      )}
                    >
                      {c.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {canManage && !c.isActive && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        loading={activating}
                        onClick={() =>
                          activateCycle(c.id, {
                            onError: (e) => setActionError(e.message),
                          })
                        }
                      >
                        Activate
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        loading={screening}
                        onClick={() => handleScreenBulk(c.id, true)}
                      >
                        Dry-run Screen
                      </Button>
                      {c.admissionType === "UTME" && (
                        <Button
                          size="sm"
                          loading={screening}
                          onClick={() => setPendingScreenCycleId(c.id)}
                        >
                          Screen Applicants
                        </Button>
                      )}
                    </div>
                  )}
                  {screenResult && (
                    <div className="mt-2 rounded-md bg-blue-50 border border-blue-200 p-2 text-xs dark:bg-blue-950/20">
                      {screenResult.dryRun ? "(Dry run) " : ""}
                      Screened: {screenResult.screened} · Rejected:{" "}
                      {screenResult.rejected} · Skipped: {screenResult.skipped}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {cycles.length === 0 && (
              <p className="col-span-3 text-sm text-muted-foreground">
                No admission cycles yet.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Applications tab ─────────────────────────────────────────────── */}
      {tab === "applications" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All Statuses</option>
              {[
                "PENDING",
                "SCREENED",
                "OFFERED",
                "ACCEPTED",
                "REJECTED",
                "WITHDRAWN",
                "MATRICULATED",
              ].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All Types</option>
              {ADMISSION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={selectedCycleId}
              onChange={(e) => setSelectedCycle(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All Cycles</option>
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.cycleName} ({c.academicYear})
                </option>
              ))}
            </select>
          </div>

          {/* Application detail panel */}
          {selectedApp && (
            <Card className="border-[--color-primary]/30">
              <CardHeader className="pb-3 flex-row items-start justify-between">
                <CardTitle className="text-sm">
                  {selectedApp.firstName} {selectedApp.lastName} —{" "}
                  {selectedApp.applicationNo}
                </CardTitle>
                <button
                  onClick={() => setSelectedApp(null)}
                  className="text-muted-foreground hover:text-foreground text-lg leading-none"
                >
                  &times;
                </button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Email:</span>{" "}
                    {selectedApp.email}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Phone:</span>{" "}
                    {selectedApp.phone}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Type:</span>{" "}
                    {selectedApp.admissionType}
                  </div>
                  <div>
                    <span className="text-muted-foreground">JAMB:</span>{" "}
                    {selectedApp.jambRegNo ?? "—"} (
                    {selectedApp.jambScore ?? "?"} pts){" "}
                    {selectedApp.jambVerified ? "✓" : "⏳"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Programme:</span>{" "}
                    {selectedApp.programmeChoice1Name ??
                      selectedApp.programmeChoice1Id.slice(0, 8)}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status:</span>{" "}
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs",
                        STATUS_COLORS[selectedApp.status],
                      )}
                    >
                      {selectedApp.status}
                    </span>
                  </div>
                </div>
                {isStaff && (
                  <section className="space-y-3 rounded-md border border-indigo-200 bg-indigo-50 p-3 dark:bg-indigo-950/20">
                    <div>
                      <h3 className="text-sm font-semibold">
                        Eligibility and document verification
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Record evidence decisions separately from the applicant
                        status. The backend re-evaluates eligibility before an
                        offer or screening decision.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3 text-xs">
                      <div>
                        <span className="text-muted-foreground">O’Level</span>
                        <p className="font-medium">
                          {oLevelEligibility
                            ? oLevelEligibility.eligible
                              ? "Eligible"
                              : "Blocked"
                            : selectedApp.oLevelVerified
                              ? "Verified on file"
                              : "Not verified"}
                        </p>
                        {oLevelEligibility?.reasons?.length ? (
                          <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                            {oLevelEligibility.reasons
                              .slice(0, 3)
                              .map((reason) => (
                                <li key={reason}>{reason}</li>
                              ))}
                          </ul>
                        ) : null}
                      </div>
                      <div>
                        <span className="text-muted-foreground">JAMB</span>
                        <p className="font-medium">
                          {selectedApp.jambVerified
                            ? `Verified · ${selectedApp.jambScore ?? "—"}`
                            : "Not verified"}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">
                          Complete eligibility
                        </span>
                        <p className="font-medium">
                          {admissionEligibility
                            ? admissionEligibility.eligible
                              ? "Eligible"
                              : "Blocked"
                            : "Not evaluated"}
                        </p>
                        {admissionEligibility?.reasons?.length ? (
                          <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                            {admissionEligibility.reasons
                              .slice(0, 3)
                              .map((reason) => (
                                <li key={reason}>{reason}</li>
                              ))}
                          </ul>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="text-xs">
                        Verified JAMB score
                        <input
                          type="number"
                          min="0"
                          max="400"
                          value={
                            jambScore || String(selectedApp.jambScore ?? "")
                          }
                          onChange={(event) => setJambScore(event.target.value)}
                          className="mt-1 h-9 w-32 rounded-md border bg-background px-2 text-sm"
                        />
                      </label>
                      <label className="text-xs">
                        Verification note
                        <input
                          value={verificationRemarks}
                          onChange={(event) =>
                            setVerificationRemarks(event.target.value)
                          }
                          placeholder="Reference or note"
                          className="mt-1 h-9 w-56 rounded-md border bg-background px-2 text-sm"
                        />
                      </label>
                      <Button
                        size="sm"
                        variant="outline"
                        loading={verifyingJamb}
                        onClick={() =>
                          verifyJamb({
                            applicantId: selectedApp.id,
                            verified: true,
                            score: Number(
                              jambScore || selectedApp.jambScore || 0,
                            ),
                            remarks: verificationRemarks || undefined,
                          })
                        }
                      >
                        Verify JAMB
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        loading={verifyingJamb}
                        onClick={() =>
                          verifyJamb({
                            applicantId: selectedApp.id,
                            verified: false,
                            score: Number(
                              jambScore || selectedApp.jambScore || 0,
                            ),
                            remarks: verificationRemarks || undefined,
                          })
                        }
                      >
                        Reject JAMB
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        loading={verifyingOLevel}
                        onClick={() =>
                          verifyOLevel({
                            applicantId: selectedApp.id,
                            status: "VERIFIED",
                            remarks: verificationRemarks || undefined,
                          })
                        }
                      >
                        Verify O’Level
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        loading={verifyingOLevel}
                        onClick={() =>
                          verifyOLevel({
                            applicantId: selectedApp.id,
                            status: "REJECTED",
                            remarks: verificationRemarks || undefined,
                          })
                        }
                      >
                        Reject O’Level
                      </Button>
                    </div>
                    <div className="grid gap-2 border-t pt-3 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="text-xs">
                        Subject
                        <input
                          value={olevelSubject}
                          onChange={(event) =>
                            setOlevelSubject(event.target.value)
                          }
                          placeholder="English Language"
                          className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                        />
                      </label>
                      <label className="text-xs">
                        Grade
                        <select
                          value={olevelGrade}
                          onChange={(event) =>
                            setOlevelGrade(event.target.value)
                          }
                          className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                        >
                          {[
                            "A1",
                            "B2",
                            "B3",
                            "C4",
                            "C5",
                            "C6",
                            "D7",
                            "E8",
                            "F9",
                          ].map((grade) => (
                            <option key={grade} value={grade}>
                              {grade}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs">
                        Exam type
                        <select
                          value={olevelExamType}
                          onChange={(event) =>
                            setOlevelExamType(event.target.value)
                          }
                          className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                        >
                          <option value="WAEC">WAEC</option>
                          <option value="NECO">NECO</option>
                          <option value="NABTEB">NABTEB</option>
                          <option value="NBAIS">NBAIS</option>
                          <option value="GCE">GCE</option>
                        </select>
                      </label>
                      <label className="text-xs">
                        Exam year
                        <input
                          type="number"
                          min="1990"
                          max="2100"
                          value={olevelExamYear}
                          onChange={(event) =>
                            setOlevelExamYear(event.target.value)
                          }
                          className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                        />
                      </label>
                      <label className="text-xs">
                        Sitting
                        <select
                          value={olevelSitting}
                          onChange={(event) =>
                            setOlevelSitting(event.target.value)
                          }
                          className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                        >
                          <option value="1">Sitting 1</option>
                          <option value="2">Sitting 2</option>
                        </select>
                      </label>
                      <label className="text-xs">
                        Candidate number
                        <input
                          value={olevelCandidateNumber}
                          onChange={(event) =>
                            setOlevelCandidateNumber(event.target.value)
                          }
                          placeholder="Optional"
                          className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                        />
                      </label>
                      <label className="text-xs">
                        Examination number
                        <input
                          value={olevelExaminationNumber}
                          onChange={(event) =>
                            setOlevelExaminationNumber(event.target.value)
                          }
                          placeholder="Optional"
                          className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                        />
                      </label>
                      <label className="text-xs">
                        Centre number
                        <input
                          value={olevelCentreNumber}
                          onChange={(event) =>
                            setOlevelCentreNumber(event.target.value)
                          }
                          placeholder="Optional"
                          className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                        />
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        className="self-end"
                        loading={recordingOLevel}
                        onClick={handleRecordOLevel}
                      >
                        Record subject
                      </Button>
                    </div>
                    {((selectedApplication as any)?.documents ?? []).length >
                      0 && (
                      <div className="space-y-2 border-t pt-3">
                        <p className="text-xs font-semibold">
                          Submitted documents
                        </p>
                        {(
                          (selectedApplication as any).documents as Array<{
                            id: string;
                            documentType?: string;
                            status?: string;
                            originalFileName?: string;
                          }>
                        ).map((document) => (
                          <div
                            key={document.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-2 text-xs"
                          >
                            <span>
                              {document.documentType ?? "Document"} ·{" "}
                              {document.originalFileName ??
                                document.id.slice(0, 8)}{" "}
                              · {document.status ?? "PENDING"}
                            </span>
                            <span className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                loading={verifyingDocument}
                                onClick={() =>
                                  verifyDocument({
                                    applicantId: selectedApp.id,
                                    documentId: document.id,
                                    status: "VERIFIED",
                                  })
                                }
                              >
                                Verify
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                loading={verifyingDocument}
                                onClick={() =>
                                  verifyDocument({
                                    applicantId: selectedApp.id,
                                    documentId: document.id,
                                    status: "REJECTED",
                                    rejectionReason:
                                      verificationRemarks ||
                                      "Document requires correction.",
                                  })
                                }
                              >
                                Reject
                              </Button>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}
                {isStaff && accessibilitySupport?.requested && (
                  <section className="space-y-3 rounded-md border border-blue-200 bg-blue-50 p-3 dark:bg-blue-950/20">
                    <div>
                      <h3 className="text-sm font-semibold">
                        Accessibility / student support
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Handle operational accommodation requests without
                        requesting diagnostic information.
                      </p>
                    </div>
                    {supportLoading ? (
                      <p className="text-xs">Loading support request…</p>
                    ) : (
                      <>
                        <div className="grid gap-2 text-xs sm:grid-cols-2">
                          <div>
                            <span className="text-muted-foreground">
                              Areas:
                            </span>{" "}
                            {accessibilitySupport.supportAreas?.join(", ") ||
                              "—"}
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              Adjustments:
                            </span>{" "}
                            {accessibilitySupport.requestedAdjustments?.join(
                              ", ",
                            ) || "—"}
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              Contact:
                            </span>{" "}
                            {accessibilitySupport.preferredContactMethod || "—"}{" "}
                            / {accessibilitySupport.preferredFormat || "—"}
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              Description:
                            </span>{" "}
                            {accessibilitySupport.supportDescription || "—"}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="text-xs">
                            Support officer ID
                            <input
                              className="mt-1 h-9 rounded-md border bg-background px-2 text-sm"
                              value={
                                supportOfficerId ||
                                accessibilitySupport.assignedSupportOfficerId ||
                                ""
                              }
                              onChange={(event) =>
                                setSupportOfficerId(event.target.value)
                              }
                              placeholder="UUID (optional)"
                            />
                          </label>
                          {SUPPORT_STATUS_OPTIONS.map((status) => (
                            <Button
                              key={status}
                              size="sm"
                              variant={
                                accessibilitySupport.status === status
                                  ? "default"
                                  : "outline"
                              }
                              disabled={accessibilitySupport.status === status}
                              loading={updatingSupport}
                              onClick={() => handleSupportUpdate(status)}
                            >
                              {status}
                            </Button>
                          ))}
                        </div>
                      </>
                    )}
                  </section>
                )}
                {isStaff && (
                  <section className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3 dark:bg-amber-950/20">
                    <div>
                      <h3 className="text-sm font-semibold">
                        Applicant change requests
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Review correction or withdrawal requests and record a
                        concise decision note.
                      </p>
                    </div>
                    {changeRequestsLoading ? (
                      <p className="text-xs">Loading change requests…</p>
                    ) : changeRequests.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No change requests recorded.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {changeRequests.map((request) => (
                          <div
                            key={request.id}
                            className="rounded-md border bg-background p-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <strong>{request.requestType}</strong>
                              <span className="rounded-full bg-muted px-2 py-1">
                                {request.status}
                              </span>
                            </div>
                            <p className="mt-2 text-sm">
                              {request.reason || "No reason supplied."}
                            </p>
                            {request.requestedChanges && (
                              <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted p-2 text-[11px]">
                                {JSON.stringify(
                                  request.requestedChanges,
                                  null,
                                  2,
                                )}
                              </pre>
                            )}
                            <textarea
                              className="mt-2 w-full rounded-md border bg-background px-2 py-2 text-xs"
                              rows={2}
                              value={changeNote[request.id] || ""}
                              onChange={(event) =>
                                setChangeNote((current) => ({
                                  ...current,
                                  [request.id]: event.target.value,
                                }))
                              }
                              placeholder="Review note (optional)"
                            />
                            <div className="mt-2 flex flex-wrap gap-2">
                              {request.status === "PENDING" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  loading={updatingChangeRequest}
                                  onClick={() =>
                                    handleChangeRequestUpdate(
                                      request.id,
                                      "UNDER_REVIEW",
                                    )
                                  }
                                >
                                  Start review
                                </Button>
                              )}
                              {!["REJECTED", "COMPLETED"].includes(
                                request.status,
                              ) && (
                                <>
                                  <Button
                                    size="sm"
                                    loading={updatingChangeRequest}
                                    onClick={() =>
                                      handleChangeRequestUpdate(
                                        request.id,
                                        "APPROVED",
                                      )
                                    }
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    loading={updatingChangeRequest}
                                    onClick={() =>
                                      handleChangeRequestUpdate(
                                        request.id,
                                        "REJECTED",
                                      )
                                    }
                                  >
                                    Reject
                                  </Button>
                                </>
                              )}
                              {request.status === "APPROVED" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  loading={updatingChangeRequest}
                                  onClick={() =>
                                    handleChangeRequestUpdate(
                                      request.id,
                                      "COMPLETED",
                                    )
                                  }
                                >
                                  Mark completed
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}
                {canManage && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                    {selectedApp.status === "PENDING" && (
                      <Button
                        size="sm"
                        onClick={() =>
                          handleStatusUpdate(selectedApp.id, "SCREENED")
                        }
                        loading={updating}
                      >
                        Mark Screened
                      </Button>
                    )}
                    {selectedApp.status === "SCREENED" && (
                      <Button
                        size="sm"
                        onClick={() =>
                          handleStatusUpdate(selectedApp.id, "OFFERED")
                        }
                        loading={updating}
                      >
                        Release Offer
                      </Button>
                    )}
                    {selectedApp.status === "OFFERED" && (
                      <Button
                        size="sm"
                        onClick={() =>
                          handleStatusUpdate(selectedApp.id, "ACCEPTED")
                        }
                        loading={updating}
                      >
                        Mark Accepted
                      </Button>
                    )}
                    {!["REJECTED", "WITHDRAWN", "MATRICULATED"].includes(
                      selectedApp.status,
                    ) && (
                      <Button
                        size="sm"
                        variant="destructive"
                        loading={updating}
                        onClick={() => setShowRejectionForm(true)}
                      >
                        Reject
                      </Button>
                    )}
                  </div>
                )}
                {showRejectionForm && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-2 dark:bg-red-950/20">
                    <label
                      htmlFor="admission-rejection-reason"
                      className="text-xs font-medium"
                    >
                      Reason for rejection
                    </label>
                    <textarea
                      id="admission-rejection-reason"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      rows={3}
                      placeholder="Explain the decision clearly for the applicant"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setShowRejectionForm(false);
                          setRejectionReason("");
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={rejectionReason.trim().length < 10}
                        loading={updating}
                        onClick={() => {
                          if (selectedApp) setPendingRejection(selectedApp);
                        }}
                      >
                        Review rejection
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Applications table */}
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    {[
                      "App No",
                      "Name",
                      "Type",
                      "JAMB",
                      "Programme",
                      "Status",
                      "Applied",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {apps.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-sm text-muted-foreground"
                      >
                        No applications found.
                      </td>
                    </tr>
                  )}
                  {apps.map((a) => (
                    <tr
                      key={a.id}
                      className={cn(
                        "transition-colors",
                        selectedApp?.id === a.id &&
                          "bg-[--color-primary]/10 ring-1 ring-inset ring-[--color-primary]",
                      )}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-[--color-primary]">
                        {isStaff ? (
                          <button
                            type="button"
                            onClick={() => setSelectedApp(a)}
                            className="rounded underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-primary]"
                            aria-label={`Review application ${a.applicationNo}`}
                          >
                            {a.applicationNo}
                          </button>
                        ) : (
                          a.applicationNo
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-foreground">
                        {a.firstName} {a.lastName}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {a.admissionType}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {a.jambScore ?? "—"} {a.jambVerified ? "✓" : ""}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[120px]">
                        {a.programmeChoice1Name ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            STATUS_COLORS[a.status] ?? "badge-neutral",
                          )}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {formatDate(a.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
