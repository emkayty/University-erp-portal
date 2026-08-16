import { AdmissionsOpsProcessor } from './admissions-ops.processor';
import type { AdmissionsService } from '../admissions.service';

describe('AdmissionsOpsProcessor', () => {
  let processor: AdmissionsOpsProcessor;
  const admissions = {
    markManualVerificationRequired: jest.fn().mockResolvedValue({ eventId: 'event-1', applicant: { status: 'REVIEW_REQUIRED' } }),
  } as unknown as AdmissionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new AdmissionsOpsProcessor(admissions);
  });

  it('turns unavailable JAMB verification into an explicit durable manual work item', async () => {
    await processor.process({ id: 'job-1', name: 'verify-jamb', data: { applicantId: 'app-1', jambRegNo: 'JAMB-1' } } as never);

    expect(admissions.markManualVerificationRequired).toHaveBeenCalledWith(
      'app-1', 'JAMB', expect.stringContaining('requires manual verification'),
    );
  });

  it('turns unavailable WAEC/O-Level verification into an explicit durable manual work item', async () => {
    await processor.process({ id: 'job-2', name: 'verify-olevel', data: { applicantId: 'app-2', waecRegNo: 'WAEC-2', examYear: 2025 } } as never);

    expect(admissions.markManualVerificationRequired).toHaveBeenCalledWith(
      'app-2', 'OLEVEL', expect.stringContaining('requires manual verification'),
    );
  });

  it('acknowledges a routed manual-verification work item without re-enqueueing it', async () => {
    await processor.process({ id: 'job-3', name: 'manual-verification-required', data: { applicantId: 'app-3', verificationType: 'JAMB' } } as never);

    expect(admissions.markManualVerificationRequired).not.toHaveBeenCalled();
  });
});
