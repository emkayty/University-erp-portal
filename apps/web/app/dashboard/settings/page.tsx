"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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
  useSettings,
  useToggleFeatureFlag,
  useUpdateSettings,
} from "@/hooks/use-settings";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth.store";

const roles = [
  "SUPER_ADMIN",
  "VC",
  "REGISTRAR",
  "BURSAR",
  "HR_MANAGER",
  "DEAN",
  "HOD",
] as const;

const settingsSchema = z
  .object({
    institutionName: z.string().min(2).max(200),
    institutionCode: z.string().min(2).max(20).optional().or(z.literal("")),
    institutionType: z.enum([
      "UNIVERSITY",
      "POLYTECHNIC",
      "COLLEGE_OF_EDUCATION",
      "SPECIALIST_INSTITUTION",
    ]),
    websiteUrl: z.string().url().optional().or(z.literal("")),
    defaultCurrency: z.string().regex(/^[A-Z]{3}$/),
    contactEmail: z.string().email().optional().or(z.literal("")),
    contactPhone: z
      .string()
      .regex(/^0\d{10}$/)
      .optional()
      .or(z.literal("")),
    logoUrl: z.string().url().optional().or(z.literal("")),
    faviconUrl: z.string().url().optional().or(z.literal("")),
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    tsaEnabled: z.boolean(),
    feeWaiverCapHodPct: z.coerce.number().min(1).max(80),
    feeWaiverCapBursarPct: z.coerce.number().min(1).max(100),
    gradingSystem: z.enum(["NIGERIAN_5_POINT", "US_4_POINT"]),
    courseRepeatPolicy: z.enum(["REPLACE", "INCLUDE", "BEST"]),
    deanApprovalRequired: z.boolean(),
    requireResultValidation: z.boolean(),
    enableLiveGradebook: z.boolean(),
    assessmentContinuousAssessmentWeight: z.coerce.number().min(0).max(100),
    assessmentFinalExamWeight: z.coerce.number().min(0).max(100),
    minCreditUnitsPerSem: z.coerce.number().min(9).max(30),
    maxCreditUnitsPerSem: z.coerce.number().min(15).max(40),
    mfaMandatoryRoles: z.array(z.string()),
    sesRateLimitPerSecond: z.coerce.number().min(1).max(500),
    resultNotifConcurrency: z.coerce.number().min(1).max(500),
  })
  .refine((data) => data.feeWaiverCapHodPct < data.feeWaiverCapBursarPct, {
    message: "HOD waiver cap must be lower than Bursar waiver cap",
    path: ["feeWaiverCapHodPct"],
  })
  .refine((data) => data.minCreditUnitsPerSem < data.maxCreditUnitsPerSem, {
    message: "Minimum credit units must be lower than the maximum",
    path: ["minCreditUnitsPerSem"],
  })
  .refine(
    (data) =>
      data.assessmentContinuousAssessmentWeight +
        data.assessmentFinalExamWeight ===
      100,
    {
      message: "Assessment weights must total exactly 100%",
      path: ["assessmentContinuousAssessmentWeight"],
    },
  )
  .refine((data) => data.resultNotifConcurrency <= data.sesRateLimitPerSecond, {
    message: "Notification concurrency cannot exceed the email sending rate",
    path: ["resultNotifConcurrency"],
  });

type SettingsForm = z.infer<typeof settingsSchema>;

const FLAG_LABELS: Record<
  string,
  { label: string; description: string; caution?: boolean }
> = {
  module_lms: {
    label: "Learning Management System",
    description: "Courses, assignments, and submissions.",
  },
  module_health: {
    label: "Health & Clinic",
    description: "Student health records, appointments, and prescriptions.",
  },
  module_transport: {
    label: "Transport & Logistics",
    description: "Fleet, routes, trips, and booking.",
  },
  module_research: {
    label: "Research & Grants",
    description: "Projects, grants, expenditure, and outputs.",
  },
  module_alumni: {
    label: "Alumni & Endowment",
    description: "Alumni records and donation campaigns.",
  },
  dean_approval_required: {
    label: "Dean Approval for Results",
    description: "Adds a Dean approval stage before result publication.",
  },
  tsa_mode: {
    label: "TSA Payment Mode",
    description: "Routes fee collection through the Treasury Single Account.",
    caution: true,
  },
  nysc_exemption_mode: {
    label: "NYSC Exemption Mode",
    description:
      "Supports exemption letters for postgraduate eligibility cases.",
  },
  ccmas_strict_mode: {
    label: "NUC CCMAS Strict Mode",
    description: "Enforces 70/30 core/elective curriculum compliance.",
    caution: true,
  },
  ferpa_us_mode: {
    label: "FERPA Mode",
    description: "Enables additional US-affiliated education privacy controls.",
    caution: true,
  },
  enable_phase3_microservices: {
    label: "Microservices Experiment",
    description: "Reserved for a separately planned architecture rollout.",
    caution: true,
  },
  enable_unitime_scheduling: {
    label: "UniTime Scheduling Integration",
    description: "Reserved for a separately configured scheduling integration.",
    caution: true,
  },
  enable_opensearch: {
    label: "OpenSearch Integration",
    description: "Reserved for a separately configured search cluster.",
    caution: true,
  },
};

function CheckRow({
  id,
  label,
  description,
  disabled,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  disabled: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/40"
    >
      <input
        id={id}
        type="checkbox"
        disabled={disabled}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4"
      />
      <span>
        <span className="block text-sm font-medium text-foreground">
          {label}
        </span>
        <span className="block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
    </label>
  );
}

export default function SettingsPage() {
  const user = useAuthStore((state) => state.user);
  const isSuperAdmin = user?.primaryRole === "SUPER_ADMIN";
  const { data: settings, isLoading } = useSettings();
  const {
    mutate: updateSettings,
    isPending: saving,
    error: saveError,
  } = useUpdateSettings();
  const { mutate: toggleFlag, isPending: togglingFlag } =
    useToggleFeatureFlag();
  const [saved, setSaved] = useState(false);
  const [flagNote, setFlagNote] = useState("");
  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { mfaMandatoryRoles: ["SUPER_ADMIN", "BURSAR", "VC"] },
  });
  const mfaRoles = form.watch("mfaMandatoryRoles") ?? [];

  useEffect(() => {
    if (!settings) return;
    form.reset({
      institutionName: settings.institutionName,
      institutionCode: settings.institutionCode ?? "",
      institutionType: settings.institutionType,
      websiteUrl: settings.websiteUrl ?? "",
      defaultCurrency: settings.defaultCurrency,
      contactEmail: settings.contactEmail ?? "",
      contactPhone: settings.contactPhone ?? "",
      logoUrl: settings.logoUrl ?? "",
      faviconUrl: settings.faviconUrl ?? "",
      primaryColor: settings.primaryColor ?? "#0056B3",
      tsaEnabled: settings.tsaEnabled,
      feeWaiverCapHodPct: Number(settings.feeWaiverCapHodPct),
      feeWaiverCapBursarPct: Number(settings.feeWaiverCapBursarPct),
      gradingSystem: settings.gradingSystem,
      courseRepeatPolicy: settings.courseRepeatPolicy,
      deanApprovalRequired: settings.deanApprovalRequired,
      requireResultValidation: settings.requireResultValidation,
      enableLiveGradebook: settings.enableLiveGradebook,
      assessmentContinuousAssessmentWeight: Number(
        settings.assessmentContinuousAssessmentWeight,
      ),
      assessmentFinalExamWeight: Number(settings.assessmentFinalExamWeight),
      minCreditUnitsPerSem: settings.minCreditUnitsPerSem,
      maxCreditUnitsPerSem: settings.maxCreditUnitsPerSem,
      mfaMandatoryRoles: settings.mfaMandatoryRoles,
      sesRateLimitPerSecond: settings.sesRateLimitPerSecond,
      resultNotifConcurrency: settings.resultNotifConcurrency,
    });
  }, [settings, form]);

  const registerToggle = (
    field:
      | "tsaEnabled"
      | "deanApprovalRequired"
      | "requireResultValidation"
      | "enableLiveGradebook",
  ) => {
    const value = form.watch(field);
    return (
      <CheckRow
        id={field}
        label={
          field === "tsaEnabled"
            ? "Treasury Single Account (TSA)"
            : field === "deanApprovalRequired"
              ? "Require Dean Approval"
              : field === "requireResultValidation"
                ? "Validate Result Records"
                : "Enable Live Gradebook"
        }
        description={
          field === "tsaEnabled"
            ? "Use institutional TSA routing where this is approved and operational."
            : field === "deanApprovalRequired"
              ? "Require a Dean approval stage before results are published."
              : field === "requireResultValidation"
                ? "Reject contradictory absent/score combinations and enforce validation controls."
                : "Allow authorised users to view live gradebook progress before final publication."
        }
        disabled={!isSuperAdmin}
        checked={value}
        onChange={(checked) =>
          form.setValue(field, checked, { shouldDirty: true })
        }
      />
    );
  };

  const onSubmit = form.handleSubmit((data) => {
    updateSettings(data, {
      onSuccess: () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 3_000);
      },
    });
  });

  const toggleMfaRole = (role: string, checked: boolean) => {
    form.setValue(
      "mfaMandatoryRoles",
      checked
        ? [...mfaRoles, role]
        : mfaRoles.filter((current) => current !== role),
      { shouldDirty: true },
    );
  };

  const handleToggleFlag = (key: string, current: boolean) => {
    const meta = FLAG_LABELS[key];
    if (
      meta?.caution &&
      !current &&
      !confirm(
        `Enable “${meta.label}”? This changes an institution-wide workflow and should be approved first.`,
      )
    )
      return;
    toggleFlag(
      { key, enabled: !current },
      {
        onSuccess: () => {
          setFlagNote(
            `“${meta?.label ?? key}” ${!current ? "enabled" : "disabled"}`,
          );
          setTimeout(() => setFlagNote(""), 3_000);
        },
      },
    );
  };

  if (isLoading)
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-48 rounded-lg bg-muted" />
        <div className="h-96 rounded-lg bg-muted" />
      </div>
    );
  if (!settings)
    return (
      <p className="text-muted-foreground">
        Settings are not initialised. Run the approved database seed before
        configuring the institution.
      </p>
    );

  const error = (name: keyof SettingsForm) =>
    form.formState.errors[name]?.message;
  const inputClass =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">
          University Configuration
        </h2>
        <p className="text-sm text-muted-foreground">
          Set institution-wide operating policies. Academic policy changes
          create a new tracked policy version for result records.
        </p>
      </div>
      {!isSuperAdmin && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          You can review the configuration, but only a Super Administrator can
          make changes.
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Institution Identity and Brand
            </CardTitle>
            <CardDescription>
              Official profile details used across the portal, communication,
              and documents.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {[
              ["institutionName", "Institution Name"],
              ["institutionCode", "NUC / Institution Code"],
              ["websiteUrl", "Website URL"],
              ["contactEmail", "Official Contact Email"],
              ["contactPhone", "Nigerian Contact Phone"],
              ["logoUrl", "Logo URL"],
              ["faviconUrl", "Favicon URL"],
            ].map(([name, label]) => (
              <div
                key={name}
                className={name === "institutionName" ? "md:col-span-2" : ""}
              >
                <Label htmlFor={name}>{label}</Label>
                <Input
                  id={name}
                  disabled={!isSuperAdmin}
                  error={error(name as keyof SettingsForm)}
                  {...form.register(name as keyof SettingsForm)}
                />
              </div>
            ))}
            <div>
              <Label htmlFor="institutionType">Institution Type</Label>
              <select
                id="institutionType"
                disabled={!isSuperAdmin}
                className={inputClass}
                {...form.register("institutionType")}
              >
                <option value="UNIVERSITY">University</option>
                <option value="POLYTECHNIC">Polytechnic</option>
                <option value="COLLEGE_OF_EDUCATION">
                  College of Education
                </option>
                <option value="SPECIALIST_INSTITUTION">
                  Specialist Institution
                </option>
              </select>
            </div>
            <div>
              <Label htmlFor="defaultCurrency">Default Currency</Label>
              <Input
                id="defaultCurrency"
                maxLength={3}
                disabled={!isSuperAdmin}
                error={error("defaultCurrency")}
                {...form.register("defaultCurrency")}
              />
            </div>
            <div>
              <Label htmlFor="primaryColor">Primary Brand Colour</Label>
              <div className="flex gap-2">
                <input
                  type="color"
                  disabled={!isSuperAdmin}
                  value={form.watch("primaryColor")}
                  onChange={(event) =>
                    form.setValue("primaryColor", event.target.value, {
                      shouldDirty: true,
                    })
                  }
                  className="h-10 w-12 rounded border"
                />
                <Input
                  id="primaryColor"
                  disabled={!isSuperAdmin}
                  error={error("primaryColor")}
                  {...form.register("primaryColor")}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Academic and Result Policy
            </CardTitle>
            <CardDescription>
              These settings influence results, credit registration, and
              academic governance. Current policy version:{" "}
              {settings.gradePolicyVersion}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="gradingSystem">Grading System</Label>
                <select
                  id="gradingSystem"
                  disabled={!isSuperAdmin}
                  className={inputClass}
                  {...form.register("gradingSystem")}
                >
                  <option value="NIGERIAN_5_POINT">
                    Nigerian 5-Point Scale
                  </option>
                  <option value="US_4_POINT">US 4-Point Scale</option>
                </select>
              </div>
              <div>
                <Label htmlFor="courseRepeatPolicy">Course Repeat Policy</Label>
                <select
                  id="courseRepeatPolicy"
                  disabled={!isSuperAdmin}
                  className={inputClass}
                  {...form.register("courseRepeatPolicy")}
                >
                  <option value="REPLACE">Replace old attempt</option>
                  <option value="INCLUDE">Include all attempts</option>
                  <option value="BEST">Use best attempt</option>
                </select>
              </div>
              <div>
                <Label htmlFor="minCreditUnitsPerSem">
                  Minimum Credit Units / Semester
                </Label>
                <Input
                  id="minCreditUnitsPerSem"
                  type="number"
                  disabled={!isSuperAdmin}
                  error={error("minCreditUnitsPerSem")}
                  {...form.register("minCreditUnitsPerSem")}
                />
              </div>
              <div>
                <Label htmlFor="maxCreditUnitsPerSem">
                  Maximum Credit Units / Semester
                </Label>
                <Input
                  id="maxCreditUnitsPerSem"
                  type="number"
                  disabled={!isSuperAdmin}
                  error={error("maxCreditUnitsPerSem")}
                  {...form.register("maxCreditUnitsPerSem")}
                />
              </div>
              <div>
                <Label htmlFor="assessmentContinuousAssessmentWeight">
                  Continuous Assessment Weight (%)
                </Label>
                <Input
                  id="assessmentContinuousAssessmentWeight"
                  type="number"
                  disabled={!isSuperAdmin}
                  error={error("assessmentContinuousAssessmentWeight")}
                  {...form.register("assessmentContinuousAssessmentWeight")}
                />
              </div>
              <div>
                <Label htmlFor="assessmentFinalExamWeight">
                  Final Examination Weight (%)
                </Label>
                <Input
                  id="assessmentFinalExamWeight"
                  type="number"
                  disabled={!isSuperAdmin}
                  error={error("assessmentFinalExamWeight")}
                  {...form.register("assessmentFinalExamWeight")}
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {registerToggle("deanApprovalRequired")}
              {registerToggle("requireResultValidation")}
              {registerToggle("enableLiveGradebook")}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Finance, Delivery, and Security Policy
            </CardTitle>
            <CardDescription>
              Set approval limits, delivery capacity, and additional account
              protection.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label htmlFor="feeWaiverCapHodPct">HOD Waiver Cap (%)</Label>
                <Input
                  id="feeWaiverCapHodPct"
                  type="number"
                  disabled={!isSuperAdmin}
                  error={error("feeWaiverCapHodPct")}
                  {...form.register("feeWaiverCapHodPct")}
                />
              </div>
              <div>
                <Label htmlFor="feeWaiverCapBursarPct">
                  Bursar Waiver Cap (%)
                </Label>
                <Input
                  id="feeWaiverCapBursarPct"
                  type="number"
                  disabled={!isSuperAdmin}
                  error={error("feeWaiverCapBursarPct")}
                  {...form.register("feeWaiverCapBursarPct")}
                />
              </div>
              <div>
                <Label htmlFor="sesRateLimitPerSecond">
                  Email Rate / Second
                </Label>
                <Input
                  id="sesRateLimitPerSecond"
                  type="number"
                  disabled={!isSuperAdmin}
                  error={error("sesRateLimitPerSecond")}
                  {...form.register("sesRateLimitPerSecond")}
                />
              </div>
              <div>
                <Label htmlFor="resultNotifConcurrency">
                  Result Notification Concurrency
                </Label>
                <Input
                  id="resultNotifConcurrency"
                  type="number"
                  disabled={!isSuperAdmin}
                  error={error("resultNotifConcurrency")}
                  {...form.register("resultNotifConcurrency")}
                />
              </div>
            </div>
            {registerToggle("tsaEnabled")}
            <div className="space-y-2">
              <Label>Mandatory Multi-Factor Authentication Roles</Label>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {roles.map((role) => (
                  <CheckRow
                    key={role}
                    id={`mfa-${role}`}
                    label={role.replace(/_/g, " ")}
                    description="MFA required at sign-in."
                    disabled={!isSuperAdmin}
                    checked={mfaRoles.includes(role)}
                    onChange={(checked) => toggleMfaRole(role, checked)}
                  />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {isSuperAdmin && (
          <div className="flex items-center gap-3">
            <Button type="submit" loading={saving}>
              Save University Configuration
            </Button>
            {saved && (
              <span className="text-sm text-[--color-success]">
                Configuration saved and audit logged.
              </span>
            )}
            {saveError && (
              <span className="text-sm text-[--color-danger]">
                Unable to save. Review the highlighted policy values.
              </span>
            )}
          </div>
        )}
      </form>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Module and Regulatory Feature Switches
          </CardTitle>
          <CardDescription>
            Use these switches only after the relevant policy, staff training,
            data protection, and external integrations are approved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {flagNote && (
            <div className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
              {flagNote}
            </div>
          )}
          {Object.entries(FLAG_LABELS).map(([key, meta]) => {
            const enabled = settings.featureFlags?.[key] === true;
            return (
              <div
                key={key}
                className={cn(
                  "flex items-center justify-between gap-4 rounded-lg border p-4",
                  enabled
                    ? "border-[--color-primary]/30 bg-blue-50/50"
                    : "border-border",
                )}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{meta.label}</p>
                    {meta.caution && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                        controlled change
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {meta.description}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground/60">
                    {key}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => isSuperAdmin && handleToggleFlag(key, enabled)}
                  disabled={!isSuperAdmin || togglingFlag}
                  aria-checked={enabled}
                  role="switch"
                  aria-label={`Toggle ${meta.label}`}
                  className={cn(
                    "relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    enabled ? "bg-[--color-primary]" : "bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition",
                      enabled ? "translate-x-5" : "translate-x-0",
                    )}
                  />
                </button>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
