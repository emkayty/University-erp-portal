"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/erp/confirm-action";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { effectiveRolesOf } from "@/lib/authz";
import { useCurrentUser } from "@/stores/auth.store";
import {
  useCreateAssessmentScheme,
  useSaveAssessmentComponents,
  useFinalizeAssessmentScheme,
  useAssessmentCsvUpload,
  useAssessmentExport,
  useAssessmentGradebook,
  useAssessmentOfferings,
  useFinalizeAssessmentMarks,
  useAssessmentTemplate,
  useGenerateDraftResults,
  useSaveAssessmentMark,
  type AssessmentGradebook,
  type GradeUploadResult,
} from "@/hooks/use-assessment";

const PAGE_SIZE = 50;

type UploadMode = "VALIDATE_ONLY" | "APPLY";

export default function AssessmentPage() {
  const [offeringId, setOfferingId] = useState("");
  const [activeOffering, setActiveOffering] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState("");
  const [uploadResult, setUploadResult] = useState<GradeUploadResult | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [finalizeConfirmationOpen, setFinalizeConfirmationOpen] =
    useState(false);
  const [schemeName, setSchemeName] = useState("Standard assessment scheme");
  const [schemeVersion, setSchemeVersion] = useState("1");
  const [schemeComponents, setSchemeComponents] = useState([
    {
      name: "Continuous Assessment",
      code: "CA",
      category: "CONTINUOUS_ASSESSMENT",
      maxScore: "40",
      weight: "40",
      isRequired: true,
    },
    {
      name: "Examination",
      code: "EXAM",
      category: "EXAMINATION",
      maxScore: "60",
      weight: "60",
      isRequired: true,
    },
  ]);

  const user = useCurrentUser();
  const effectiveRoles = effectiveRolesOf(user);
  const canFinalizeMarks = effectiveRoles.some((role) =>
    ["HOD", "DEAN", "REGISTRAR", "SUPER_ADMIN"].includes(role),
  );
  const offerings = useAssessmentOfferings();
  const gradebook = useAssessmentGradebook(
    activeOffering,
    page,
    PAGE_SIZE,
    search,
  );
  const createScheme = useCreateAssessmentScheme();
  const saveComponents = useSaveAssessmentComponents();
  const finalizeScheme = useFinalizeAssessmentScheme();
  const generate = useGenerateDraftResults();
  const finalizeMarks = useFinalizeAssessmentMarks();
  const exportGradebook = useAssessmentExport();
  const downloadTemplate = useAssessmentTemplate();
  const uploadCsv = useAssessmentCsvUpload();
  const saveMark = useSaveAssessmentMark(activeOffering);
  const [savingMarkKey, setSavingMarkKey] = useState("");
  const data = gradebook.data;
  const semesterId = data?.offering?.semesterId ?? "";

  const rows = data?.rows ?? [];
  const pageCount = data?.pagination?.totalPages ?? 1;
  const totalRows = data?.pagination?.total ?? data?.summary.total ?? 0;
  const firstRow = totalRows ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastRow = totalRows ? Math.min(page * PAGE_SIZE, totalRows) : 0;

  const load = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setUploadResult(null);
    setPage(1);
    setSearch("");
    setActiveOffering(offeringId.trim());
  };

  const saveSchemeDefinition = async () => {
    if (!activeOffering) {
      setErrorMessage(
        "Load a course offering before saving its assessment scheme.",
      );
      return;
    }
    const components = schemeComponents.map((component, index) => ({
      name: component.name.trim(),
      code: component.code.trim().toUpperCase(),
      category: component.category.trim(),
      maxScore: Number(component.maxScore),
      weight: Number(component.weight),
      sequence: index + 1,
      isRequired: component.isRequired,
    }));
    const totalWeight = components.reduce(
      (sum, component) => sum + component.weight,
      0,
    );
    if (
      !schemeName.trim() ||
      components.some(
        (component) =>
          !component.name ||
          !component.code ||
          !component.category ||
          !Number.isFinite(component.maxScore) ||
          component.maxScore <= 0 ||
          !Number.isFinite(component.weight) ||
          component.weight < 0,
      ) ||
      Math.abs(totalWeight - 100) > 0.001
    ) {
      setErrorMessage(
        "Provide valid scheme fields and component weights that total exactly 100%.",
      );
      return;
    }
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const scheme = data?.scheme?.id
        ? { id: data.scheme.id }
        : await createScheme.mutateAsync({
            courseOfferingId: activeOffering,
            name: schemeName.trim(),
            version: Number(schemeVersion) || 1,
          });
      await saveComponents.mutateAsync({ schemeId: scheme.id, components });
      setSuccessMessage(
        "Assessment scheme and components saved. Reload the gradebook before entering marks.",
      );
      await gradebook.refetch();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Assessment scheme could not be saved.",
      );
    }
  };

  const finalizeSchemeDefinition = async () => {
    if (!activeOffering) return;
    setErrorMessage("");
    setSuccessMessage("");
    try {
      await finalizeScheme.mutateAsync(activeOffering);
      setSuccessMessage(
        "Assessment scheme finalized and locked for ordinary editing.",
      );
      await gradebook.refetch();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Assessment scheme finalization failed.",
      );
    }
  };

  const download = (
    result: { blob: Blob; filename?: string },
    fallback: string,
  ) => {
    const url = URL.createObjectURL(result.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.filename ?? fallback;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setSelectedFile(file);
    setUploadResult(null);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      setCsvText(await file.text());
    } catch {
      setCsvText("");
      setErrorMessage(
        "The selected CSV could not be read. Choose the file again or save it as UTF-8 CSV.",
      );
    }
  };

  const submitUpload = async (mode: UploadMode) => {
    if (!activeOffering || !semesterId) {
      setErrorMessage("Load a valid course offering before uploading marks.");
      return;
    }
    if (!csvText || !selectedFile) {
      setErrorMessage("Choose a gradebook CSV file first.");
      return;
    }
    if (
      mode === "APPLY" &&
      (!uploadResult ||
        uploadResult.mode !== "VALIDATE_ONLY" ||
        uploadResult.errorRows > 0)
    ) {
      setErrorMessage(
        "Validate the unchanged file successfully before applying it.",
      );
      return;
    }
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const result = await uploadCsv.mutateAsync({
        courseOfferingId: activeOffering,
        semesterId,
        csv: csvText,
        fileName: selectedFile.name,
        mode,
      });
      setUploadResult(result);
      if (result.errorRows > 0) {
        setErrorMessage(
          `${result.errorRows} row(s) need correction. No marks were applied.`,
        );
      } else if (mode === "VALIDATE_ONLY") {
        setSuccessMessage(
          `Validation passed for ${result.validRows} student row(s). Review the gradebook, then apply the unchanged file.`,
        );
      } else {
        setSuccessMessage(
          `${result.appliedMarks} component mark(s) were applied as DRAFT in batch ${result.batchId}. Reload the gradebook to review them.`,
        );
        await gradebook.refetch();
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Grade upload failed. No completion was confirmed.",
      );
    }
  };

  const exportCsv = async () => {
    if (!activeOffering) return;
    try {
      download(
        await exportGradebook.mutateAsync(activeOffering),
        "gradebook.csv",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Gradebook export failed.",
      );
    }
  };

  const saveLiveMark = (
    studentId: string,
    componentId: string,
    maxScore: number,
    rawValue: string,
    currentScore?: number,
  ) => {
    const value = rawValue.trim();
    const key = `${studentId}:${componentId}`;
    if (!value) {
      setErrorMessage(
        "Enter a score before leaving the mark field. Use 0 when the student earned no marks.",
      );
      return;
    }
    const score = Number(value);
    if (!Number.isFinite(score) || score < 0 || score > maxScore) {
      setErrorMessage(
        `Score must be between 0 and ${maxScore}. The mark was not saved.`,
      );
      return;
    }
    if (currentScore != null && score === currentScore) return;
    setErrorMessage("");
    setSuccessMessage("");
    setSavingMarkKey(key);
    saveMark.mutate(
      { studentId, componentId, score },
      {
        onSuccess: async () => {
          setSuccessMessage(
            "Mark saved securely. The gradebook summary has been refreshed.",
          );
          await gradebook.refetch();
        },
        onError: (error) =>
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Mark could not be saved. No change was confirmed.",
          ),
        onSettled: () => setSavingMarkKey(""),
      },
    );
  };

  const canGenerate = Boolean(
    data &&
    data.summary.incomplete === 0 &&
    (data.summary.unfinalized ?? 0) === 0,
  );
  const canFinalize = Boolean(
    data &&
    canFinalizeMarks &&
    data.summary.incomplete === 0 &&
    (data.summary.unfinalized ?? 0) > 0,
  );

  return (
    <div className="space-y-6">
      <ConfirmAction
        open={finalizeConfirmationOpen}
        title="Finalize complete marks"
        description="Finalize all complete draft marks for this course offering? Finalized component marks require a controlled amendment workflow."
        confirmLabel="Finalize marks"
        destructive
        onCancel={() => setFinalizeConfirmationOpen(false)}
        onConfirm={() => {
          setFinalizeConfirmationOpen(false);
          finalizeMarks.mutate(activeOffering, {
            onSuccess: async (result) => {
              setSuccessMessage(
                `${result.finalized} component mark(s) finalized.`,
              );
              await gradebook.refetch();
            },
            onError: (error) =>
              setErrorMessage(
                error instanceof Error
                  ? error.message
                  : "Mark finalization failed.",
              ),
          });
        }}
      />
      <header>
        <p className="text-sm text-muted-foreground">
          Assessment and gradebook control
        </p>
        <h1 className="text-2xl font-semibold">Assessment Workspace</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Enter marks directly in the live gradebook for quick corrections or
          small groups. For large classes, download the authorised roster
          template, enter marks in a spreadsheet, validate the complete file,
          review the errors and summary, then apply the unchanged file once.
          Finalized marks remain protected.
        </p>
      </header>

      {(errorMessage || gradebook.isError) && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {errorMessage ||
            "Unable to load this gradebook. Confirm the offering UUID and that an active assessment scheme exists."}
        </div>
      )}
      {successMessage && (
        <div
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"
        >
          {successMessage}
        </div>
      )}

      <Card>
        <CardContent className="space-y-4 pt-5">
          <form onSubmit={load} className="flex flex-col gap-3 sm:flex-row">
            <label className="sr-only" htmlFor="course-offering-select">
              Authorised course offering
            </label>
            <select
              id="course-offering-select"
              aria-label="Authorised course offering"
              value={offeringId}
              onChange={(event) => setOfferingId(event.target.value)}
              required
              className="flex h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Choose an authorised course offering</option>
              {offerings.data?.map((offering) => (
                <option key={offering.id} value={offering.id}>
                  {offering.course.code} · {offering.course.title} ·{" "}
                  {offering.semesterModel.name} · Section {offering.sectionCode}
                </option>
              ))}
            </select>
            <Button type="submit" loading={gradebook.isFetching}>
              Load gradebook
            </Button>
          </form>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium">
              Controlled manual lookup
            </summary>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor="course-offering-id">
                Course offering UUID
              </label>
              <input
                id="course-offering-id"
                aria-label="Course offering UUID"
                value={offeringId}
                onChange={(event) => setOfferingId(event.target.value.trim())}
                placeholder="Paste course offering UUID"
                className="flex h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
              />
              <p className="sm:max-w-md">
                Use only when an administrator has supplied an authorised
                offering identifier. The API still enforces offering access.
              </p>
            </div>
          </details>
          {offerings.isError && (
            <p className="text-sm text-amber-700">
              Authorised offerings could not be loaded. Use the controlled
              manual lookup only if your administrator supplied the identifier.
            </p>
          )}
          {data?.offering && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {data.offering.course.code} · {data.offering.course.title}
              </span>
              <span>
                {data.offering.semesterModel?.name ?? "Semester linked"}
              </span>
              <span>
                {data.summary.total.toLocaleString()} registered students
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {activeOffering && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Assessment scheme setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Define the approved components and weights before marks are
              entered. Component weights must total exactly 100%; finalization
              locks the scheme for ordinary editing.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-muted-foreground">
                Scheme name
                <input
                  value={schemeName}
                  onChange={(event) => setSchemeName(event.target.value)}
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-muted-foreground">
                Version
                <input
                  type="number"
                  min="1"
                  value={schemeVersion}
                  onChange={(event) => setSchemeVersion(event.target.value)}
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                />
              </label>
            </div>
            <div className="space-y-2">
              {schemeComponents.map((component, index) => (
                <div
                  key={`${component.code}-${index}`}
                  className="grid gap-2 rounded-md border p-3 sm:grid-cols-6"
                >
                  <input
                    aria-label={`Component ${index + 1} name`}
                    value={component.name}
                    onChange={(event) =>
                      setSchemeComponents((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, name: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder="Component name"
                    className="h-9 rounded-md border bg-background px-2 text-sm sm:col-span-2"
                  />
                  <input
                    aria-label={`Component ${index + 1} code`}
                    value={component.code}
                    onChange={(event) =>
                      setSchemeComponents((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, code: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder="Code"
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                  />
                  <input
                    aria-label={`Component ${index + 1} category`}
                    value={component.category}
                    onChange={(event) =>
                      setSchemeComponents((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, category: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder="Category"
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                  />
                  <input
                    aria-label={`Component ${index + 1} max score`}
                    type="number"
                    min="0.01"
                    value={component.maxScore}
                    onChange={(event) =>
                      setSchemeComponents((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, maxScore: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder="Max score"
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <input
                      aria-label={`Component ${index + 1} weight`}
                      type="number"
                      min="0"
                      max="100"
                      value={component.weight}
                      onChange={(event) =>
                        setSchemeComponents((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, weight: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="Weight %"
                      className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
                    />
                    {schemeComponents.length > 1 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setSchemeComponents((current) =>
                            current.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          )
                        }
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setSchemeComponents((current) => [
                    ...current,
                    {
                      name: "",
                      code: "",
                      category: "OTHER",
                      maxScore: "0",
                      weight: "0",
                      isRequired: false,
                    },
                  ])
                }
              >
                Add component
              </Button>
              <Button
                type="button"
                size="sm"
                loading={createScheme.isPending || saveComponents.isPending}
                onClick={saveSchemeDefinition}
              >
                Save scheme
              </Button>
              {canFinalizeMarks && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  loading={finalizeScheme.isPending}
                  onClick={finalizeSchemeDefinition}
                >
                  Finalize scheme
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {activeOffering && data && (
        <Card>
          <CardHeader>
            <CardTitle>Bulk mark upload</CardTitle>
            <p className="text-sm text-muted-foreground">
              The server validates registration, Matric No, duplicate rows,
              component columns, score ranges, and finalized-mark protections
              before applying anything.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                loading={downloadTemplate.isPending}
                onClick={async () => {
                  try {
                    download(
                      await downloadTemplate.mutateAsync(activeOffering),
                      "assessment-template.csv",
                    );
                  } catch (error) {
                    setErrorMessage(
                      error instanceof Error
                        ? error.message
                        : "Template download failed.",
                    );
                  }
                }}
              >
                Download roster template
              </Button>
              <Button
                variant="outline"
                size="sm"
                loading={exportGradebook.isPending}
                onClick={exportCsv}
              >
                Export current gradebook
              </Button>
            </div>
            <div className="rounded-lg border border-dashed border-border p-4">
              <label htmlFor="gradebook-csv" className="text-sm font-medium">
                Choose completed CSV
              </label>
              <input
                id="gradebook-csv"
                type="file"
                accept=".csv,text/csv"
                className="mt-2 block w-full text-sm"
                onChange={(event) => void handleFile(event.target.files?.[0])}
              />
              {selectedFile && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Selected: {selectedFile.name} ·{" "}
                  {csvText.split(/\r?\n/).filter(Boolean).length - 1} data
                  row(s)
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                loading={
                  uploadCsv.isPending &&
                  uploadCsv.variables?.mode === "VALIDATE_ONLY"
                }
                disabled={!selectedFile || !csvText}
                onClick={() => void submitUpload("VALIDATE_ONLY")}
              >
                Validate file
              </Button>
              <Button
                size="sm"
                loading={
                  uploadCsv.isPending && uploadCsv.variables?.mode === "APPLY"
                }
                disabled={
                  !uploadResult ||
                  uploadResult.mode !== "VALIDATE_ONLY" ||
                  uploadResult.errorRows > 0
                }
                onClick={() => void submitUpload("APPLY")}
              >
                Apply validated file
              </Button>
            </div>
            {uploadResult && (
              <div className="grid gap-3 sm:grid-cols-4">
                <Metric label="Rows" value={uploadResult.totalRows} />
                <Metric label="Valid" value={uploadResult.validRows} />
                <Metric label="Errors" value={uploadResult.errorRows} />
                <Metric
                  label="Applied marks"
                  value={uploadResult.appliedMarks}
                />
              </div>
            )}
            {uploadResult?.errors.length ? (
              <div className="max-h-64 overflow-auto rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                <p className="mb-2 font-semibold">
                  Correct these rows and validate again. No partial application
                  occurred.
                </p>
                {uploadResult.errors.slice(0, 100).map((error) => (
                  <p key={`${error.row}-${error.error}`} className="py-0.5">
                    Row {error.row}: {error.error}
                  </p>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-5">
            <Metric label="Students" value={data.summary.total} />
            <Metric label="Complete" value={data.summary.complete} />
            <Metric label="Incomplete" value={data.summary.incomplete} />
            <Metric label="Finalized" value={data.summary.finalized ?? 0} />
            <Metric label="Unfinalized" value={data.summary.unfinalized ?? 0} />
          </div>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  {" "}
                  <CardTitle>{data.scheme.name}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {data.scheme.components.length} components ·{" "}
                    {data.scheme.status} · showing {rows.length} of{" "}
                    {totalRows.toLocaleString()} roster rows
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Live entry saves a changed score when you leave the field.
                    Use 0 for a genuine zero; leave a missing mark for CSV
                    correction or follow-up.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canFinalize && (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={finalizeMarks.isPending}
                      onClick={() => setFinalizeConfirmationOpen(true)}
                    >
                      Finalize complete marks
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() =>
                      generate.mutate(activeOffering, {
                        onSuccess: (result) =>
                          setSuccessMessage(
                            `${result.generated} draft result(s) generated.`,
                          ),
                        onError: (error) =>
                          setErrorMessage(
                            error instanceof Error
                              ? error.message
                              : "Draft result generation failed.",
                          ),
                      })
                    }
                    loading={generate.isPending}
                    disabled={!canGenerate}
                  >
                    {canGenerate
                      ? "Generate draft results"
                      : "Finalize marks before generating"}
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <label className="sr-only" htmlFor="gradebook-search">
                  Search roster
                </label>
                <input
                  id="gradebook-search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search name or Matric No"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm sm:max-w-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Page {page} of {pageCount}
                  {gradebook.isFetching ? " · Loading…" : ""}
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="p-2">Student</th>
                      <th className="p-2">Matric No</th>
                      {data.scheme.components.map((component) => (
                        <th key={component.id} className="p-2">
                          {component.code}
                        </th>
                      ))}
                      <th className="p-2">Final score</th>
                      <th className="p-2">Completeness</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.student.id}
                        className="border-b last:border-0"
                      >
                        <td className="p-2">
                          {row.student.firstName} {row.student.lastName}
                        </td>
                        <td className="p-2 font-mono text-xs">
                          {row.student.matricNo}
                        </td>
                        {data.scheme.components.map((component) => (
                          <td key={component.id} className="p-2">
                            <LiveMarkInput
                              key={`${row.student.id}:${component.id}:${row.marks.find((mark) => mark.componentId === component.id)?.score ?? "empty"}:${row.marks.find((mark) => mark.componentId === component.id)?.status ?? "DRAFT"}`}
                              row={row}
                              component={component}
                              saving={
                                savingMarkKey ===
                                `${row.student.id}:${component.id}`
                              }
                              onSave={saveLiveMark}
                            />
                          </td>
                        ))}
                        <td className="p-2 font-medium">
                          {row.finalScore.toFixed(2)}
                        </td>
                        <td className="p-2">
                          {row.complete ? (
                            <span className="text-green-700">
                              {row.finalized ? "Finalized" : "Complete"}
                            </span>
                          ) : (
                            <span className="text-amber-700">
                              Missing marks
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div
                className="space-y-3 md:hidden"
                aria-label="Mobile gradebook records"
              >
                {rows.map((row) => (
                  <article
                    key={`mobile-${row.student.id}`}
                    className="rounded-xl border border-border bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold">
                          {row.student.firstName} {row.student.lastName}
                        </h3>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {row.student.matricNo}
                        </p>
                      </div>
                      <span
                        className={
                          row.complete
                            ? "text-xs font-semibold text-green-700"
                            : "text-xs font-semibold text-amber-700"
                        }
                      >
                        {row.complete
                          ? row.finalized
                            ? "Finalized"
                            : "Complete"
                          : "Missing marks"}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Final score
                        </p>
                        <p className="mt-1 font-semibold">
                          {row.finalScore.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Marks</p>
                        <p className="mt-1 font-semibold">
                          {row.marks.length}/{data.scheme.components.length}
                        </p>
                      </div>
                    </div>
                    <details className="mt-3 border-t border-border pt-3">
                      <summary className="cursor-pointer text-xs font-semibold text-[--color-primary]">
                        View and edit component marks
                      </summary>
                      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        {data.scheme.components.map((component) => (
                          <div key={component.id}>
                            <dt className="text-muted-foreground">
                              {component.code}
                            </dt>
                            <dd className="mt-1">
                              <LiveMarkInput
                                key={`${row.student.id}:${component.id}:${row.marks.find((mark) => mark.componentId === component.id)?.score ?? "empty"}:${row.marks.find((mark) => mark.componentId === component.id)?.status ?? "DRAFT"}`}
                                row={row}
                                component={component}
                                saving={
                                  savingMarkKey ===
                                  `${row.student.id}:${component.id}`
                                }
                                onSave={saveLiveMark}
                                compact
                              />
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  </article>
                ))}
              </div>
              {!rows.length && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No students match this search.
                </p>
              )}
              <div className="mt-4 flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  Rows {firstRow}–{lastRow} of {totalRows}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pageCount}
                  onClick={() =>
                    setPage((current) => Math.min(pageCount, current + 1))
                  }
                >
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function LiveMarkInput({
  row,
  component,
  saving,
  onSave,
  compact = false,
}: {
  row: AssessmentGradebook["rows"][number];
  component: AssessmentGradebook["scheme"]["components"][number];
  saving: boolean;
  onSave: (
    studentId: string,
    componentId: string,
    maxScore: number,
    rawValue: string,
    currentScore?: number,
  ) => void;
  compact?: boolean;
}) {
  const mark = row.marks.find(
    (candidate) => candidate.componentId === component.id,
  );
  const finalized = mark?.status === "FINALIZED";
  const currentScore = mark?.score;
  return (
    <div className={compact ? "space-y-1" : "min-w-28 space-y-1"}>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          max={component.maxScore}
          step="0.01"
          defaultValue={currentScore ?? ""}
          disabled={finalized || saving}
          aria-label={`${component.code} mark for ${row.student.firstName} ${row.student.lastName}`}
          title={
            finalized
              ? "Finalized marks require the controlled amendment workflow."
              : `Enter 0 to ${component.maxScore}; saved when you leave the field.`
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          onBlur={(event) =>
            onSave(
              row.student.id,
              component.id,
              component.maxScore,
              event.currentTarget.value,
              currentScore,
            )
          }
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        />
        {saving && (
          <span
            className="text-[10px] text-muted-foreground"
            aria-live="polite"
          >
            Saving…
          </span>
        )}
      </div>
      {finalized && (
        <span className="text-[10px] font-medium text-green-700">
          Finalized
        </span>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value.toLocaleString()}</p>
      </CardContent>
    </Card>
  );
}
