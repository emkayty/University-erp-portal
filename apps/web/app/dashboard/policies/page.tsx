"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type PolicyFormData,
  type UniversityPolicyCategory,
  type UniversityPolicyStatus,
  useCreateUniversityPolicy,
  usePolicyAcknowledgements,
  usePolicyLifecycleAction,
  usePublishedUniversityPolicies,
  usePublishedUniversityPolicy,
  useAcknowledgePublishedUniversityPolicy,
  useUniversityPolicies,
  useUniversityPolicy,
  useUpdateUniversityPolicy,
} from "@/hooks/use-university-policies";
import { cn } from "@/lib/utils";
import { hasEffectiveRole } from "@/lib/authz";
import { useAuthStore } from "@/stores/auth.store";

const categories: Array<[UniversityPolicyCategory, string]> = [
  ["ACADEMIC", "Academic"],
  ["ADMISSIONS", "Admissions"],
  ["ASSESSMENT_AND_EXAMINATIONS", "Assessment & Examinations"],
  ["FINANCE_AND_FEES", "Finance & Fees"],
  ["STUDENT_AFFAIRS", "Student Affairs"],
  ["STAFF_AND_HR", "Staff & HR"],
  ["RESEARCH_AND_ETHICS", "Research & Ethics"],
  ["ICT_AND_DATA_PROTECTION", "ICT & Data Protection"],
  ["HEALTH_SAFETY_AND_SECURITY", "Health, Safety & Security"],
  ["GOVERNANCE_AND_COMPLIANCE", "Governance & Compliance"],
  ["OTHER", "Other"],
];

const statusStyle: Record<UniversityPolicyStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  PENDING_APPROVAL: "bg-amber-100 text-amber-800",
  APPROVED: "bg-blue-100 text-blue-800",
  REJECTED: "bg-red-100 text-red-800",
  PUBLISHED: "bg-emerald-100 text-emerald-800",
  ARCHIVED: "bg-gray-200 text-gray-700",
};

const blankForm = (): Required<
  Pick<PolicyFormData, "policyCode" | "title" | "category" | "content">
> &
  PolicyFormData => ({
  policyCode: "",
  version: "1.0",
  title: "",
  category: "GOVERNANCE_AND_COMPLIANCE",
  summary: "",
  content: "",
  effectiveFrom: "",
  reviewDueAt: "",
  requiresAcknowledgement: false,
  acknowledgementDueAt: "",
});

function asForm(
  policy: NonNullable<ReturnType<typeof useUniversityPolicy>["data"]>,
) {
  return {
    policyCode: policy.policyCode,
    version: policy.version,
    title: policy.title,
    category: policy.category,
    summary: policy.summary ?? "",
    content: policy.content ?? "",
    effectiveFrom: policy.effectiveFrom
      ? policy.effectiveFrom.slice(0, 10)
      : "",
    reviewDueAt: policy.reviewDueAt ? policy.reviewDueAt.slice(0, 10) : "",
    requiresAcknowledgement: policy.requiresAcknowledgement,
    acknowledgementDueAt: policy.acknowledgementDueAt
      ? policy.acknowledgementDueAt.slice(0, 10)
      : "",
  };
}

function compact(form: PolicyFormData) {
  return Object.fromEntries(
    Object.entries(form).filter(
      ([, value]) => value !== "" && value !== undefined,
    ),
  );
}

export default function UniversityPoliciesPage() {
  const user = useAuthStore((state) => state.user);
  const canView = hasEffectiveRole(user, "SUPER_ADMIN", "VC", "REGISTRAR");
  const canAuthor = hasEffectiveRole(user, "SUPER_ADMIN", "REGISTRAR");
  const canReview = hasEffectiveRole(user, "SUPER_ADMIN", "VC");
  const [status, setStatus] = useState<UniversityPolicyStatus | undefined>();
  const [category, setCategory] = useState<
    UniversityPolicyCategory | undefined
  >();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(blankForm());
  const [notice, setNotice] = useState("");
  const [selectedPublishedId, setSelectedPublishedId] = useState<
    string | undefined
  >();

  const filters = useMemo(
    () => ({ status, category, search: search.trim() || undefined }),
    [status, category, search],
  );
  const { data: list, isLoading } = useUniversityPolicies(filters, {
    enabled: canView,
  });
  const { data: selected, isLoading: selectedLoading } = useUniversityPolicy(
    selectedId,
    { enabled: canView },
  );
  const { data: acknowledgementData } = usePolicyAcknowledgements(selectedId, {
    enabled: canView,
  });
  const { data: publishedPolicies = [], isLoading: publishedLoading } =
    usePublishedUniversityPolicies({ enabled: !canView });
  const { data: selectedPublished, isLoading: selectedPublishedLoading } =
    usePublishedUniversityPolicy(selectedPublishedId, { enabled: !canView });
  const acknowledge = useAcknowledgePublishedUniversityPolicy();
  const create = useCreateUniversityPolicy();
  const update = useUpdateUniversityPolicy();
  const lifecycle = usePolicyLifecycleAction();

  useEffect(() => {
    if (selected) setForm(asForm(selected));
  }, [selected]);

  const updateField = <K extends keyof typeof form>(
    field: K,
    value: (typeof form)[K],
  ) => setForm((current) => ({ ...current, [field]: value }));
  const announce = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(""), 4_000);
  };

  const createDraft = () => {
    if (!form.policyCode || !form.title || !form.content)
      return announce(
        "Policy code, title, and full policy content are required.",
      );
    create.mutate(compact(form) as never, {
      onSuccess: (policy) => {
        setSelectedId(policy.id);
        setCreateOpen(false);
        announce(
          "Draft policy created. Submit it when ready for independent review.",
        );
      },
      onError: () =>
        announce(
          "Unable to create the policy. Check its code and required fields.",
        ),
    });
  };

  const saveDraft = () => {
    if (!selected) return;
    update.mutate(
      { id: selected.id, data: compact(form) },
      {
        onSuccess: () => announce("Draft policy saved."),
        onError: () =>
          announce(
            "Unable to save this policy in its current lifecycle state.",
          ),
      },
    );
  };

  const takeAction = (
    action: "submit" | "review" | "publish" | "archive" | "revisions",
    data?: Record<string, unknown>,
  ) => {
    if (!selected) return;
    lifecycle.mutate(
      { id: selected.id, action, data },
      {
        onSuccess: (policy) => {
          setSelectedId(policy.id);
          announce(
            action === "revisions"
              ? `Revision ${policy.version} created as a draft.`
              : `Policy ${action} completed.`,
          );
        },
        onError: () =>
          announce(
            `Unable to ${action} this policy. Verify its lifecycle status and your role.`,
          ),
      },
    );
  };

  const rejectPolicy = () => {
    const comment = window.prompt(
      "State the reason for rejection. This is saved with the policy.",
    );
    if (!comment?.trim()) return;
    takeAction("review", { action: "REJECT", comment: comment.trim() });
  };

  const detailEditable =
    selected?.status === "DRAFT" || selected?.status === "REJECTED";
  const fieldClass =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60";

  if (!canView) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h2 className="text-xl font-semibold">University Policies</h2>
          <p className="text-sm text-muted-foreground">
            Read current published policies and acknowledge those that require
            confirmation. Draft and lifecycle controls remain restricted to
            authorised governance roles.
          </p>
        </div>
        {notice && (
          <div
            role="status"
            className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800"
          >
            {notice}
          </div>
        )}
        {publishedLoading ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Loading published policies…
            </CardContent>
          </Card>
        ) : publishedPolicies.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No published policies are currently available.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {publishedPolicies.map((policy) => {
              const acknowledged = Boolean(policy.acknowledgements?.length);
              return (
                <button
                  key={policy.id}
                  type="button"
                  onClick={() => setSelectedPublishedId(policy.id)}
                  className={cn(
                    "rounded-lg border bg-card p-4 text-left transition-colors hover:border-[--color-primary]",
                    selectedPublishedId === policy.id &&
                      "border-[--color-primary] ring-2 ring-[--color-primary]/20",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{policy.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {policy.policyCode} · Version {policy.version} ·{" "}
                        {policy.category}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-1 text-[11px]",
                        acknowledged
                          ? "bg-emerald-100 text-emerald-800"
                          : policy.requiresAcknowledgement
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-700",
                      )}
                    >
                      {acknowledged
                        ? "Acknowledged"
                        : policy.requiresAcknowledgement
                          ? "Acknowledgement required"
                          : "Published"}
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">
                    {policy.summary || "Open to read the published policy."}
                  </p>
                </button>
              );
            })}
          </div>
        )}
        {selectedPublishedId && (
          <Card>
            <CardHeader>
              <CardTitle>
                {selectedPublishedLoading
                  ? "Loading policy…"
                  : selectedPublished?.title}
              </CardTitle>
              <CardDescription>
                {selectedPublished?.policyCode} · Version{" "}
                {selectedPublished?.version}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-4 text-sm">
                {selectedPublished?.content ||
                  "Policy content is not available."}
              </div>
              {selectedPublished?.requiresAcknowledgement &&
                !selectedPublished?.acknowledgements?.length && (
                  <Button
                    type="button"
                    loading={acknowledge.isPending}
                    onClick={() =>
                      acknowledge.mutate(selectedPublishedId, {
                        onSuccess: () =>
                          setNotice("Policy acknowledgement recorded."),
                        onError: (error) => setNotice(error.message),
                      })
                    }
                  >
                    Acknowledge policy
                  </Button>
                )}
              {selectedPublished?.acknowledgements?.length ? (
                <p className="text-sm text-emerald-700">
                  Acknowledged on{" "}
                  {new Date(
                    selectedPublished.acknowledgements[0].acknowledgedAt,
                  ).toLocaleString()}
                  .
                </p>
              ) : null}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-xl font-semibold">University Policies</h2>
          <p className="text-sm text-muted-foreground">
            Draft, independently approve, publish, version, archive, and track
            acknowledgement of institution policies.
          </p>
        </div>
        {canAuthor && (
          <Button
            type="button"
            onClick={() => {
              setForm(blankForm());
              setCreateOpen(true);
              setSelectedId(undefined);
            }}
          >
            Create Policy Draft
          </Button>
        )}
      </div>
      {notice && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          {notice}
        </div>
      )}

      <Card>
        <CardContent className="grid gap-3 pt-6 md:grid-cols-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search code or title"
          />
          <select
            value={status ?? ""}
            onChange={(event) =>
              setStatus(
                (event.target.value || undefined) as
                  UniversityPolicyStatus | undefined,
              )
            }
            className={fieldClass}
          >
            <option value="">All lifecycle states</option>
            {Object.keys(statusStyle).map((value) => (
              <option key={value} value={value}>
                {value.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <select
            value={category ?? ""}
            onChange={(event) =>
              setCategory(
                (event.target.value || undefined) as
                  UniversityPolicyCategory | undefined,
              )
            }
            className={fieldClass}
          >
            <option value="">All policy categories</option>
            {categories.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Policy Register</CardTitle>
            <CardDescription>
              {list?.total ?? 0} policy records match the current filters.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading && (
              <p className="text-sm text-muted-foreground">
                Loading policy register…
              </p>
            )}
            {!isLoading && !list?.policies.length && (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No policies found. Create the first draft after the university’s
                governance owner has approved the content.
              </p>
            )}
            {list?.policies.map((policy) => (
              <button
                key={policy.id}
                type="button"
                onClick={() => {
                  setSelectedId(policy.id);
                  setCreateOpen(false);
                }}
                className={cn(
                  "w-full rounded-lg border p-4 text-left transition hover:border-[--color-primary]/50",
                  selectedId === policy.id
                    ? "border-[--color-primary] bg-blue-50/50"
                    : "border-border",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {policy.policyCode} · {policy.title}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      statusStyle[policy.status],
                    )}
                  >
                    {policy.status.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {categories.find(
                      ([value]) => value === policy.category,
                    )?.[1] ?? policy.category}
                  </span>
                  <span>Version {policy.version}</span>
                  {policy.effectiveFrom && (
                    <span>
                      Effective{" "}
                      {new Date(policy.effectiveFrom).toLocaleDateString()}
                    </span>
                  )}
                  {policy.requiresAcknowledgement && (
                    <span>
                      {policy._count?.acknowledgements ?? 0} acknowledgements
                    </span>
                  )}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {(createOpen || selectedId) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {createOpen
                  ? "New Policy Draft"
                  : selectedLoading
                    ? "Loading Policy…"
                    : selected
                      ? `${selected.policyCode} · Version ${selected.version}`
                      : "Policy"}
              </CardTitle>
              <CardDescription>
                {createOpen
                  ? "Start with the approved institutional text. Publishing requires independent review."
                  : selected?.status === "REJECTED"
                    ? `Rejected: ${selected.rejectionReason ?? "No reason recorded."}`
                    : selected
                      ? `Status: ${selected.status.replace(/_/g, " ")}`
                      : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(createOpen || selected) && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="policyCode">Policy Code</Label>
                      <Input
                        id="policyCode"
                        disabled={!createOpen || !canAuthor}
                        value={form.policyCode}
                        onChange={(event) =>
                          updateField(
                            "policyCode",
                            event.target.value.toUpperCase(),
                          )
                        }
                        placeholder="ACADEMIC-001"
                      />
                    </div>
                    <div>
                      <Label htmlFor="version">Version</Label>
                      <Input
                        id="version"
                        disabled={!createOpen || !canAuthor}
                        value={form.version ?? ""}
                        onChange={(event) =>
                          updateField("version", event.target.value)
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="title">Policy Title</Label>
                    <Input
                      id="title"
                      disabled={!createOpen && !detailEditable}
                      value={form.title ?? ""}
                      onChange={(event) =>
                        updateField("title", event.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="category">Policy Category</Label>
                    <select
                      id="category"
                      disabled={!createOpen && !detailEditable}
                      value={form.category}
                      onChange={(event) =>
                        updateField(
                          "category",
                          event.target.value as UniversityPolicyCategory,
                        )
                      }
                      className={fieldClass}
                    >
                      {categories.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="summary">Short Summary</Label>
                    <textarea
                      id="summary"
                      disabled={!createOpen && !detailEditable}
                      value={form.summary ?? ""}
                      onChange={(event) =>
                        updateField("summary", event.target.value)
                      }
                      className={cn(fieldClass, "min-h-20")}
                      placeholder="Plain-language summary for staff and students."
                    />
                  </div>
                  <div>
                    <Label htmlFor="content">Policy Content</Label>
                    <textarea
                      id="content"
                      disabled={!createOpen && !detailEditable}
                      value={form.content ?? ""}
                      onChange={(event) =>
                        updateField("content", event.target.value)
                      }
                      className={cn(fieldClass, "min-h-64 font-mono text-xs")}
                      placeholder="Write the approved policy text, definitions, responsibilities, effective provisions, and review requirements."
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="effectiveFrom">Effective Date</Label>
                      <Input
                        id="effectiveFrom"
                        type="date"
                        disabled={!createOpen && !detailEditable}
                        value={form.effectiveFrom ?? ""}
                        onChange={(event) =>
                          updateField("effectiveFrom", event.target.value)
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="reviewDueAt">Review Due Date</Label>
                      <Input
                        id="reviewDueAt"
                        type="date"
                        disabled={!createOpen && !detailEditable}
                        value={form.reviewDueAt ?? ""}
                        onChange={(event) =>
                          updateField("reviewDueAt", event.target.value)
                        }
                      />
                    </div>
                  </div>
                  <label className="flex items-start gap-3 rounded-lg border p-3">
                    <input
                      type="checkbox"
                      disabled={!createOpen && !detailEditable}
                      checked={form.requiresAcknowledgement ?? false}
                      onChange={(event) =>
                        updateField(
                          "requiresAcknowledgement",
                          event.target.checked,
                        )
                      }
                      className="mt-1 h-4 w-4"
                    />
                    <span>
                      <span className="block text-sm font-medium">
                        Require acknowledgement
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Staff and students can record acknowledgement of this
                        exact published version.
                      </span>
                    </span>
                  </label>
                  {(form.requiresAcknowledgement ?? false) && (
                    <div>
                      <Label htmlFor="acknowledgementDueAt">
                        Acknowledgement Due Date
                      </Label>
                      <Input
                        id="acknowledgementDueAt"
                        type="date"
                        disabled={!createOpen && !detailEditable}
                        value={form.acknowledgementDueAt ?? ""}
                        onChange={(event) =>
                          updateField(
                            "acknowledgementDueAt",
                            event.target.value,
                          )
                        }
                      />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 border-t pt-4">
                    {createOpen && (
                      <Button
                        type="button"
                        loading={create.isPending}
                        onClick={createDraft}
                      >
                        Create Draft
                      </Button>
                    )}
                    {!createOpen && detailEditable && canAuthor && (
                      <>
                        <Button
                          type="button"
                          loading={update.isPending}
                          onClick={saveDraft}
                        >
                          Save Draft
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          loading={lifecycle.isPending}
                          onClick={() => takeAction("submit")}
                        >
                          Submit for Approval
                        </Button>
                      </>
                    )}
                    {!createOpen &&
                      selected?.status === "PENDING_APPROVAL" &&
                      canReview && (
                        <>
                          <Button
                            type="button"
                            loading={lifecycle.isPending}
                            onClick={() =>
                              takeAction("review", { action: "APPROVE" })
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            loading={lifecycle.isPending}
                            onClick={rejectPolicy}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                    {!createOpen &&
                      selected?.status === "APPROVED" &&
                      canReview && (
                        <Button
                          type="button"
                          loading={lifecycle.isPending}
                          onClick={() =>
                            takeAction(
                              "publish",
                              form.effectiveFrom
                                ? { effectiveFrom: form.effectiveFrom }
                                : {},
                            )
                          }
                        >
                          Publish
                        </Button>
                      )}
                    {!createOpen &&
                      (selected?.status === "PUBLISHED" ||
                        selected?.status === "ARCHIVED") &&
                      canAuthor && (
                        <Button
                          type="button"
                          variant="outline"
                          loading={lifecycle.isPending}
                          onClick={() => takeAction("revisions", compact(form))}
                        >
                          Create Revision
                        </Button>
                      )}
                    {!createOpen &&
                      selected &&
                      ["APPROVED", "REJECTED", "PUBLISHED"].includes(
                        selected.status,
                      ) &&
                      canReview && (
                        <Button
                          type="button"
                          variant="outline"
                          loading={lifecycle.isPending}
                          onClick={() => takeAction("archive")}
                        >
                          Archive
                        </Button>
                      )}
                  </div>
                  {selected?.requiresAcknowledgement && (
                    <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                      <span className="font-medium">Acknowledgements: </span>
                      {acknowledgementData?.total ??
                        selected._count?.acknowledgements ??
                        0}
                      {acknowledgementData?.acknowledgements
                        .slice(0, 3)
                        .map((ack) => (
                          <span
                            key={ack.id}
                            className="ml-2 text-xs text-muted-foreground"
                          >
                            {ack.user.email}
                          </span>
                        ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
