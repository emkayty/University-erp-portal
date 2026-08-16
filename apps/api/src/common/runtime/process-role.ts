/**
 * The worker process is the only process permitted to consume BullMQ jobs or
 * register schedules. Keep this decision in one place so a web/API replica
 * cannot accidentally execute financial or notification jobs.
 */
export const isWorkerProcess = (): boolean => process.env['PROCESS_ROLE'] === 'worker';
