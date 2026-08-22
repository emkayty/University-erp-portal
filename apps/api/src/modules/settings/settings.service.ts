import { Cache, CACHE_MANAGER } from "@nestjs/cache-manager";
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";

import { DEFAULT_FEATURE_FLAGS, FEATURE_FLAG_KEYS, type FeatureFlagKey } from "@uniportal/config";

import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../database/prisma.service";
import type { UpdateSettingsDto } from "./dto/settings.dto";
import { validateMatricNumberFormat } from '../students/matric-number-format';

export const SETTINGS_CACHE_KEY = "institution:settings";
export const FEATURE_FLAG_CACHE = "institution:feature-flags";
const CACHE_TTL = 300_000; // 5 minutes in ms
const MODULE_FLAG_KEYS = [
  'module_lms', 'module_health', 'module_transport', 'module_research', 'module_alumni',
] as const;

/**
 * SettingsService — manages the singleton InstitutionSettings record.
 *
 * Caching strategy:
 *  - GET settings  → Redis cache (5 min TTL)
 *  - PATCH settings → update DB → bust cache
 *  - Feature flags → separate cache key (5 min TTL)
 *
 * Singleton enforcement: the application layer checks row count on create.
 * The seed script creates the one-and-only row at startup.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  // ── GET ───────────────────────────────────────────────────────────────────
  async getSettings() {
    const cached = await this.cache.get(SETTINGS_CACHE_KEY);
    if (cached) return cached;

    const settings = await this.prisma.institutionSettings.findFirst();
    if (!settings)
      throw new NotFoundException(
        "Institution settings not initialised — run db:seed",
      );

    await this.cache.set(SETTINGS_CACHE_KEY, settings, CACHE_TTL);
    return settings;
  }

  async getPublicBranding() {
    const settings = await this.getSettings() as {
      institutionName: string;
      institutionCode: string | null;
      institutionType: string;
      websiteUrl: string | null;
      contactEmail: string | null;
      contactPhone: string | null;
      logoUrl: string | null;
      faviconUrl: string | null;
      primaryColor: string | null;
    };
    return {
      institutionName: settings.institutionName,
      institutionCode: settings.institutionCode,
      institutionType: settings.institutionType,
      websiteUrl: settings.websiteUrl,
      contactEmail: settings.contactEmail,
      contactPhone: settings.contactPhone,
      logoUrl: settings.logoUrl,
      faviconUrl: settings.faviconUrl,
      primaryColor: settings.primaryColor,
    };
  }

  async getFeatureFlags(): Promise<Record<string, boolean>> {
    const cached =
      await this.cache.get<Record<string, boolean>>(FEATURE_FLAG_CACHE);
    if (cached) return cached;

    const settings = (await this.getSettings()) as {
      featureFlags: Record<string, boolean>;
    };
    const flags = settings.featureFlags ?? {};

    await this.cache.set(FEATURE_FLAG_CACHE, flags, CACHE_TTL);
    return flags;
  }

  /**
   * Returns only module rollout state for authenticated navigation clients.
   * Workflow/experimental flags remain Super Admin-only to avoid leaking
   * internal rollout details and policy variants to ordinary users.
   */
  async getModuleCapabilities(): Promise<Record<(typeof MODULE_FLAG_KEYS)[number], boolean>> {
    const flags = await this.getFeatureFlags();
    return Object.fromEntries(
      MODULE_FLAG_KEYS.map((key) => [key, flags[key] ?? DEFAULT_FEATURE_FLAGS[key]]),
    ) as Record<(typeof MODULE_FLAG_KEYS)[number], boolean>;
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────
  async updateSettings(dto: UpdateSettingsDto, actorId: string) {
    const existing = (await this.getSettings()) as {
      id: string;
      feeWaiverCapHodPct: { toNumber(): number };
      feeWaiverCapBursarPct: { toNumber(): number };
      minCreditUnitsPerSem: number;
      maxCreditUnitsPerSem: number;
      sesRateLimitPerSecond: number;
      resultNotifConcurrency: number;
      requireAdmissionClearance: boolean;
      assessmentFinalExamWeight: { toNumber(): number };
      assessmentContinuousAssessmentWeight: { toNumber(): number };
      gradePolicyVersion: number;
    };

    const {
      admissionClearanceApprovalReference,
      admissionClearanceApprovalDocumentReference,
      admissionClearanceChangeReason,
      admissionClearanceEffectiveAt,
      ...settingsData
    } = dto;
    if (dto.matricNumberFormat !== undefined) {
      const formatError = validateMatricNumberFormat(dto.matricNumberFormat);
      if (formatError) throw new BadRequestException(formatError);
    }
    for (const field of ['identityCardFrontBackgroundUrl', 'identityCardBackBackgroundUrl'] as const) {
      const value = dto[field]?.trim();
      if (value && !isApprovedArtworkReference(value)) {
        throw new BadRequestException(`${field} must be a relative private-storage key or an HTTPS artwork URL.`);
      }
    }

    const clearancePolicyChanged =
      settingsData.requireAdmissionClearance !== undefined &&
      settingsData.requireAdmissionClearance !== existing.requireAdmissionClearance;
    const approvalMetadataProvided = Boolean(
      admissionClearanceApprovalReference || admissionClearanceApprovalDocumentReference || admissionClearanceChangeReason || admissionClearanceEffectiveAt,
    );
    if (!clearancePolicyChanged && approvalMetadataProvided) {
      throw new BadRequestException('Admission-clearance approval metadata is only valid when changing requireAdmissionClearance');
    }
    let clearanceApproval: { id: string; role: string } | undefined;
    if (clearancePolicyChanged) {
      if (!admissionClearanceApprovalReference || !admissionClearanceApprovalDocumentReference || !admissionClearanceChangeReason || !admissionClearanceEffectiveAt) {
        throw new BadRequestException('Changing requireAdmissionClearance requires an approver, approval-document reference, reason, and effective date');
      }
      const effectiveAt = new Date(admissionClearanceEffectiveAt);
      if (Number.isNaN(effectiveAt.getTime())) throw new BadRequestException('admissionClearanceEffectiveAt must be a valid date');
      const approver = await this.prisma.user.findUnique({
        where: { id: admissionClearanceApprovalReference },
        select: { id: true, isActive: true, roles: { select: { roleName: true } } },
      });
      const approverRole = approver?.roles.find((role) => role.roleName === 'VC' || role.roleName === 'REGISTRAR')?.roleName;
      if (!approver || !approver.isActive || approver.id === actorId || !approverRole) {
        throw new BadRequestException('Admission-clearance policy changes require a distinct active VC or Registrar approver');
      }
      clearanceApproval = { id: approver.id, role: approverRole };
    }
    const clearanceEffectiveAt = clearancePolicyChanged ? new Date(admissionClearanceEffectiveAt!) : undefined;
    const clearanceIsFuture = Boolean(clearanceEffectiveAt && clearanceEffectiveAt > new Date());
    const { requireAdmissionClearance, ...settingsWithoutClearance } = settingsData;
    const updateData = {
      ...settingsWithoutClearance,
      ...(clearancePolicyChanged && !clearanceIsFuture ? { requireAdmissionClearance, pendingAdmissionClearance: null, pendingAdmissionClearanceEffectiveAt: null, pendingAdmissionClearanceApprovalRef: null } : {}),
      ...(clearancePolicyChanged && clearanceIsFuture ? { pendingAdmissionClearance: requireAdmissionClearance, pendingAdmissionClearanceEffectiveAt: clearanceEffectiveAt, pendingAdmissionClearanceApprovalRef: admissionClearanceApprovalDocumentReference } : {}),
    } as Prisma.InstitutionSettingsUpdateInput;
    // Deep-audit fix (Aug 2026): these checks previously only fired when
    // BOTH fields of a pair were present in the SAME PATCH request — a
    // partial update sending only feeWaiverCapBursarPct (lowering it below
    // the currently-stored feeWaiverCapHodPct, without also resending
    // feeWaiverCapHodPct) skipped the check entirely and could silently
    // invert the caps, breaking the tiered fee-waiver-approval model at
    // the configuration level. Each side of each comparison now falls
    // back to the CURRENTLY STORED value when the DTO doesn't provide it,
    // so a partial update is validated against the resulting real state,
    // not just against itself.
    const hodCap =
      dto.feeWaiverCapHodPct ?? existing.feeWaiverCapHodPct.toNumber();
    const bursarCap =
      dto.feeWaiverCapBursarPct ?? existing.feeWaiverCapBursarPct.toNumber();
    if (hodCap >= bursarCap) {
      throw new BadRequestException(
        "HOD waiver cap must be less than Bursar waiver cap",
      );
    }

    // Assessment component weighting is configured per assessment scheme rather
    // than globally on InstitutionSettings, so there is no global weight pair
    // to validate in this settings update path.

    const minUnits = dto.minCreditUnitsPerSem ?? existing.minCreditUnitsPerSem;
    const maxUnits = dto.maxCreditUnitsPerSem ?? existing.maxCreditUnitsPerSem;
    if (minUnits >= maxUnits) {
      throw new BadRequestException(
        "Min credit units must be less than max credit units",
      );
    }

    const finalExamWeight =
      dto.assessmentFinalExamWeight ??
      existing.assessmentFinalExamWeight.toNumber();
    const continuousAssessmentWeight =
      dto.assessmentContinuousAssessmentWeight ??
      existing.assessmentContinuousAssessmentWeight.toNumber();
    if (Math.abs(finalExamWeight + continuousAssessmentWeight - 100) > 0.001) {
      throw new BadRequestException(
        "Final examination and continuous assessment weights must total 100%",
      );
    }

    const emailRate =
      dto.sesRateLimitPerSecond ?? existing.sesRateLimitPerSecond;
    const notificationConcurrency =
      dto.resultNotifConcurrency ?? existing.resultNotifConcurrency;
    if (notificationConcurrency > emailRate) {
      throw new BadRequestException(
        "Result notification concurrency cannot exceed the configured email sending rate",
      );
    }

    const academicPolicyChanged =
      dto.gradingSystem !== undefined ||
      dto.courseRepeatPolicy !== undefined ||
      dto.assessmentFinalExamWeight !== undefined ||
      dto.assessmentContinuousAssessmentWeight !== undefined ||
      dto.requireResultValidation !== undefined ||
      dto.deanApprovalRequired !== undefined;

    const updated = await this.prisma.institutionSettings.update({
      where: { id: existing.id },
      data: {
        ...updateData,
        ...(academicPolicyChanged
          ? { gradePolicyVersion: existing.gradePolicyVersion + 1 }
          : {}),
      },
    });

    await this.bustSettingsCache();
    await this.audit.log(
      {
        action: AuditAction.UPDATE,
        targetTable: "institution_settings",
        targetId: existing.id,
        newValues: updateData as Record<string, unknown>,
        metadata: clearancePolicyChanged
          ? {
              type: 'ADMISSION_CLEARANCE_POLICY_CHANGE',
              oldValue: existing.requireAdmissionClearance,
              newValue: requireAdmissionClearance,
              activeImmediately: !clearanceIsFuture,
              approvalUserId: clearanceApproval?.id,
              approvalRole: clearanceApproval?.role,
              approvalDocumentReference: admissionClearanceApprovalDocumentReference,
              reason: admissionClearanceChangeReason,
              effectiveAt: admissionClearanceEffectiveAt,
            }
          : undefined,
      },
      actorId,
    );

    return updated;
  }

  // ── FEATURE FLAGS ─────────────────────────────────────────────────────────
  async setFeatureFlag(key: string, enabled: boolean, actorId: string) {
    if (!FEATURE_FLAG_KEYS.includes(key as FeatureFlagKey)) {
      throw new BadRequestException(
        `Unknown feature flag: "${key}". Valid keys: ${FEATURE_FLAG_KEYS.join(", ")}`,
      );
    }

    const settings = (await this.getSettings()) as {
      id: string;
      featureFlags: Record<string, boolean>;
    };
    const flags = { ...(settings.featureFlags ?? {}), [key]: enabled };

    await this.prisma.institutionSettings.update({
      where: { id: settings.id },
      data: { featureFlags: flags },
    });

    await this.bustSettingsCache();
    await this.audit.log(
      {
        action: AuditAction.UPDATE,
        targetTable: "institution_settings",
        targetId: settings.id,
        newValues: { featureFlag: key, enabled },
        metadata: { type: "FEATURE_FLAG_TOGGLE" },
      },
      actorId,
    );

    this.logger.log(`Feature flag "${key}" → ${enabled} (by ${actorId})`);
    return { key, enabled };
  }

  // ── Cache helpers ─────────────────────────────────────────────────────────
  async bustSettingsCache(): Promise<void> {
    await Promise.all([
      this.cache.del(SETTINGS_CACHE_KEY),
      this.cache.del(FEATURE_FLAG_CACHE),
    ]);
  }
}

function isApprovedArtworkReference(value: string): boolean {
  if (/^https:\/\/[^\s]+$/i.test(value)) return true;
  return /^(?!\/)(?!.*\.\.)(?!.*:\/\/)[A-Za-z0-9_./-]+$/.test(value);
}
