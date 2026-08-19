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
});

