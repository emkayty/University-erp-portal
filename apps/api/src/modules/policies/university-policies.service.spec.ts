import { BadRequestException } from "@nestjs/common";
import { UniversityPolicyStatus } from "@prisma/client";

import { UniversityPoliciesService } from "./university-policies.service";

const basePolicy = (overrides: Record<string, unknown> = {}) => ({
  id: "policy-1",
  policyCode: "ACADEMIC-001",
  version: "1.0",
  title: "Academic Integrity Policy",
  category: "ACADEMIC",
  summary: null,
  content: "A sufficiently long approved policy body for lifecycle testing.",
  status: UniversityPolicyStatus.DRAFT,
  effectiveFrom: null,
  reviewDueAt: null,
  requiresAcknowledgement: false,
  acknowledgementDueAt: null,
  submittedAt: null,
  approvedAt: null,
  publishedAt: null,
  archivedAt: null,
  rejectionReason: null,
  createdById: "author-1",
  updatedById: null,
  approvedById: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  _count: { acknowledgements: 0 },
  ...overrides,
});

describe("UniversityPoliciesService", () => {
  let service: UniversityPoliciesService;
  let prisma: {
    universityPolicy: Record<string, jest.Mock>;
    universityPolicyAcknowledgement: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock };

  beforeEach(() => {
    prisma = {
      universityPolicy: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      universityPolicyAcknowledgement: {},
      $transaction: jest.fn(),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new UniversityPoliciesService(prisma as never, audit as never);
  });

  it("does not allow a published policy version to be edited in place", async () => {
    prisma.universityPolicy.findUnique.mockResolvedValue(
      basePolicy({ status: UniversityPolicyStatus.PUBLISHED }),
    );

    await expect(
      service.update("policy-1", { title: "Changed title" }, "admin-1"),
    ).rejects.toThrow(
      "Only a draft or rejected policy can be edited or submitted",
    );
    expect(prisma.universityPolicy.update).not.toHaveBeenCalled();
  });

  it("blocks author self-approval to preserve independent review", async () => {
    prisma.universityPolicy.findUnique.mockResolvedValue(
      basePolicy({
        status: UniversityPolicyStatus.PENDING_APPROVAL,
        createdById: "reviewer-1",
      }),
    );

    await expect(
      service.review("policy-1", { action: "APPROVE" }, "reviewer-1"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.universityPolicy.update).not.toHaveBeenCalled();
  });

  it("archives an earlier published version before publishing the approved revision", async () => {
    const approved = basePolicy({
      status: UniversityPolicyStatus.APPROVED,
      effectiveFrom: new Date("2026-02-01"),
    });
    const published = basePolicy({
      ...approved,
      status: UniversityPolicyStatus.PUBLISHED,
      publishedAt: new Date("2026-02-02"),
    });
    prisma.universityPolicy.findUnique.mockResolvedValue(approved);
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );
    prisma.universityPolicy.updateMany.mockResolvedValue({ count: 1 });
    prisma.universityPolicy.update.mockResolvedValue(published);

    const result = await service.publish("policy-1", {}, "vc-1");

    expect(prisma.universityPolicy.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          policyCode: "ACADEMIC-001",
          status: UniversityPolicyStatus.PUBLISHED,
        }),
        data: expect.objectContaining({
          status: UniversityPolicyStatus.ARCHIVED,
          updatedById: "vc-1",
        }),
      }),
    );
    expect(result.status).toBe(UniversityPolicyStatus.PUBLISHED);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PUBLISH" }),
      "vc-1",
    );
  });
});
