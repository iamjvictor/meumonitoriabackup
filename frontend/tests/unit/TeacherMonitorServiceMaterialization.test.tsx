import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TeacherMonitorService } from '@/modules/teacher/services/TeacherMonitorService';
import type { MonitorDraft } from '@/modules/teacher/components/TeacherMonitorCreationModal';

const fetchMock = vi.fn();

describe('TeacherMonitorService question bank materialization', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('sends the catalog total and returns the queued run with monitor creation', async () => {
    fetchMock.mockResolvedValue({
      status: 201,
      ok: true,
      json: async () => ({
        data: {
          id: 'monitor-1', name: 'Monitor', description: null, status: 'DRAFT', createdAt: '', updatedAt: '', subjects: [],
        },
        materialization: { id: 'run-1', status: 'QUEUED', totalSelected: 73 },
      }),
    });

    const draft = {
      name: 'Monitor', description: '', subjects: [{ name: 'Matemática', topics: [{ name: 'Álgebra', definition: '' }] }],
      questionBankSelections: [], totalSelectedQuestions: 73,
    } as MonitorDraft;
    const monitor = await TeacherMonitorService.createDraft(draft);

    const sent = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(sent.totalSelectedQuestions).toBe(73);
    expect(monitor.materialization).toMatchObject({ id: 'run-1', status: 'QUEUED', totalSelected: 73 });
  });

  it('reads persisted progress through the monitor-scoped endpoint', async () => {
    const run = { id: 'run-1', status: 'PROCESSING', processed: 32, totalSelected: 73, totalEligible: 68 };
    fetchMock.mockResolvedValue({ status: 200, ok: true, json: async () => ({ data: run }) });

    await expect(TeacherMonitorService.getQuestionBankMaterialization('monitor-1')).resolves.toEqual(run);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/v1/monitors/monitor-1/question-bank-materialization');
  });
});
