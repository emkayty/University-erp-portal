import { AcademicService } from '../academic.service';
import { AcademicProgressionProcessor } from './academic-progression.processor';

describe('AcademicProgressionProcessor', () => {
  it('consumes refresh jobs through the existing progression engine with the publishing actor', async () => {
    const academic = { runProgression: jest.fn().mockResolvedValue({ progression: { id: 'progression-1' } }) } as unknown as AcademicService;
    const processor = new AcademicProgressionProcessor(academic);

    await processor.process({
      id: 'job-1',
      name: 'refresh-progression',
      data: { studentId: 'student-1', resultId: 'result-1', semesterId: 'semester-1', actorId: 'registrar-1' },
    } as any);

    expect(academic.runProgression).toHaveBeenCalledWith('student-1', 'registrar-1');
  });

  it('rejects malformed refresh jobs rather than silently succeeding', async () => {
    const academic = { runProgression: jest.fn() } as unknown as AcademicService;
    const processor = new AcademicProgressionProcessor(academic);

    await expect(processor.process({ id: 'job-2', name: 'refresh-progression', data: { studentId: 'student-1' } } as any)).rejects.toThrow('requires studentId and actorId');
    expect(academic.runProgression).not.toHaveBeenCalled();
  });
});
