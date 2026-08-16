import { OutboxService } from './outbox.service';

const makeQueue = () => ({ add: jest.fn().mockResolvedValue({ id: 'job-1' }) });

describe('OutboxService', () => {
  const tx = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn().mockResolvedValue(1),
    domainEvent: { create: jest.fn().mockResolvedValue({ id: 'event-created' }) },
  } as any;
  const prisma = {
    runSystem: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  } as any;
  const notifications = makeQueue();
  const admissions = makeQueue();
  const invoices = makeQueue();
  const reconciliation = makeQueue();
  const reports = makeQueue();
  const breach = makeQueue();
  const academicProgression = makeQueue();

  let service: OutboxService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx.$queryRaw.mockResolvedValue([]);
    tx.$executeRaw.mockResolvedValue(1);
    tx.domainEvent.create.mockResolvedValue({ id: 'event-created' });
    service = new OutboxService(prisma, notifications, admissions, invoices, reconciliation, reports, breach, academicProgression);
  });

  it('returns the durable event identifier from write()', async () => {
    await expect(service.write(tx, 'example.created', { entityId: 'entity-1' })).resolves.toBe('event-created');
    expect(tx.domainEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { eventType: 'example.created', payload: { entityId: 'entity-1' } },
      select: { id: true },
    }));
  });

  it('routes critical domain events to their owning worker queues with a stable job ID', async () => {
    tx.$queryRaw.mockResolvedValue([{
      id: 'event-admission', event_type: 'admissions.jamb_verification_requested',
      payload: { applicantId: 'app-1', jambRegNo: '123' }, created_at: new Date(), processed_at: null,
      attempts: 0, last_error: null,
    }]);

    await service.processOutbox();

    expect(admissions.add).toHaveBeenCalledWith(
      'verify-jamb',
      expect.objectContaining({ applicantId: 'app-1', jambRegNo: '123', domainEventId: 'event-admission' }),
      expect.objectContaining({ jobId: 'domain-event:event-admission', attempts: 3 }),
    );
    expect(notifications.add).not.toHaveBeenCalled();
    expect(tx.$executeRaw).toHaveBeenCalled();
  });

  it('routes academic progression refreshes to the academic worker with a deterministic job ID', async () => {
    tx.$queryRaw.mockResolvedValue([{
      id: 'event-academic', event_type: 'academic.progression.refresh_requested',
      payload: { studentId: 'student-1', resultId: 'result-1', semesterId: 'semester-1', actorId: 'registrar-1' }, created_at: new Date(), processed_at: null,
      attempts: 0, last_error: null,
    }]);

    await service.processOutbox();

    expect(academicProgression.add).toHaveBeenCalledWith(
      'refresh-progression',
      expect.objectContaining({ studentId: 'student-1', resultId: 'result-1', actorId: 'registrar-1', domainEventId: 'event-academic' }),
      expect.objectContaining({ jobId: 'academic-refresh:student-1:semester-1:result-1', attempts: 5 }),
    );
    expect(notifications.add).not.toHaveBeenCalled();
  });

  it('routes privacy exports and repeating breach reminders without falling back to notifications', async () => {
    tx.$queryRaw.mockResolvedValue([
      { id: 'event-privacy', event_type: 'privacy.portability_export_requested', payload: { reportJobId: 'job-1' }, created_at: new Date(), processed_at: null, attempts: 0, last_error: null },
      { id: 'event-breach', event_type: 'security.breach_reminder_requested', payload: { incidentId: 'incident-1' }, created_at: new Date(), processed_at: null, attempts: 0, last_error: null },
    ]);

    await service.processOutbox();

    expect(reports.add).toHaveBeenCalledWith('ndpr-portability-export', expect.anything(), expect.objectContaining({ jobId: 'domain-event:event-privacy' }));
    expect(breach.add).toHaveBeenCalledWith('nitda-notification', expect.anything(), expect.objectContaining({ jobId: 'breach-incident-1', repeat: { every: 6 * 60 * 60 * 1000 }, removeOnComplete: false }));
    expect(notifications.add).not.toHaveBeenCalled();
  });

  it('increments attempts and schedules a retry when enqueue fails', async () => {
    admissions.add.mockRejectedValueOnce(new Error('redis unavailable'));
    tx.$queryRaw.mockResolvedValue([{ id: 'event-failed', event_type: 'admissions.jamb_verification_requested', payload: {}, created_at: new Date(), processed_at: null, dead_lettered_at: null, next_attempt_at: null, attempts: 0, last_error: null }]);

    await service.processOutbox();

    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(admissions.add).toHaveBeenCalled();
  });

  it('dead-letters an event after the final enqueue attempt', async () => {
    admissions.add.mockRejectedValueOnce(new Error('redis unavailable'));
    tx.$queryRaw.mockResolvedValue([{ id: 'event-poison', event_type: 'admissions.jamb_verification_requested', payload: {}, created_at: new Date(), processed_at: null, dead_lettered_at: null, next_attempt_at: null, attempts: 9, last_error: 'previous failure' }]);

    await service.processOutbox();

    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(admissions.add).toHaveBeenCalled();
  });
});
