import { AuditAction } from '@prisma/client';
import { ReliabilityService } from './reliability.service';

describe('ReliabilityService', () => {
  const outbox = {
    listDeadLetters: jest.fn(),
    replayDeadLetter: jest.fn(),
  } as any;
  const audit = { log: jest.fn().mockResolvedValue(undefined) } as any;
  let service: ReliabilityService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReliabilityService(outbox, audit);
  });

  it('lists dead letters through the outbox service', async () => {
    outbox.listDeadLetters.mockResolvedValue([{ id: 'event-1', eventType: 'example.failed' }]);
    await expect(service.listDeadLetters(25)).resolves.toEqual([{ id: 'event-1', eventType: 'example.failed' }]);
    expect(outbox.listDeadLetters).toHaveBeenCalledWith(25);
  });

  it('replays through the worker-owned outbox path and records the operator action', async () => {
    outbox.replayDeadLetter.mockResolvedValue({ id: 'event-1', eventType: 'example.failed', status: 'QUEUED_FOR_REPLAY' });
    await expect(service.replayDeadLetter('event-1', 'admin-1')).resolves.toEqual({
      id: 'event-1', eventType: 'example.failed', status: 'QUEUED_FOR_REPLAY',
    });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: AuditAction.UPDATE,
      targetTable: 'domain_events',
      targetId: 'event-1',
      metadata: expect.objectContaining({ operation: 'dead_letter_replay', workerDispatch: true }),
    }), 'admin-1');
  });

  it('reports queue depth and failed-job counts for registered queues', async () => {
    const queue = {
      getJobCounts: jest.fn().mockResolvedValue({ waiting: 2, active: 1, completed: 8, failed: 3, delayed: 4, paused: 0 }),
    };
    service = new ReliabilityService(outbox, audit, queue as any);

    const snapshot = await service.queueHealth();
    expect(snapshot.queues[0]).toMatchObject({
      name: 'notifications', status: 'up', waiting: 2, active: 1, failed: 3,
    });
    expect(queue.getJobCounts).toHaveBeenCalledWith('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');
    expect(snapshot.queues.slice(1).every((entry) => entry.status === 'not_registered')).toBe(true);
  });
});

