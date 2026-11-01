import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MonitorStructureSidebar } from '@/modules/teacher/components/monitor/MonitorStructureSidebar';
import type { TeacherMonitor } from '@/modules/teacher/services/TeacherMonitorService';

const mockMonitor: TeacherMonitor = {
  id: 'm1',
  name: 'Monitor Matemática',
  description: 'Desc',
  avatarUrl: null,
  status: 'DRAFT',
  createdAt: '',
  updatedAt: '',
  hasReportedQuestions: false,
  reportedQuestionIds: [],
  knowledgeBaseCount: 0,
  questionsCount: 0,
  flashcardsCount: 0,
  subjects: [
    {
      id: 'sub1',
      name: 'Matemática',
      topics: ['Álgebra', 'Geometria'],
      topicRefs: [
        { id: 'top1', name: 'Álgebra', definition: null, classificationGuidance: null, questionBankSelections: [], subtopics: [] },
        { id: 'top2', name: 'Geometria', definition: null, classificationGuidance: null, questionBankSelections: [], subtopics: [] },
      ],
    },
  ],
};

describe('MonitorStructureSidebar selection', () => {
  it('calls selectSubject when clicking on subject header row', () => {
    const selectSubject = vi.fn();
    const setSelectedSubjectId = vi.fn();
    const setSelectedTopic = vi.fn();

    render(
      <MonitorStructureSidebar
        monitor={mockMonitor}
        selectedSubject={mockMonitor.subjects[0]}
        selectedSubjectId="sub1"
        selectedTopic="Álgebra"
        selectedTopicId="top1"
        sidebarView="structure"
        publishValidation={{ canPublish: true, reason: '', completedTopics: 2, totalTopics: 2 }}
        documents={[]}
        questions={[]}
        flashcards={[]}
        activeTopicInputSubjectId={null}
        newTopicName=""
        newTopicDefinition=""
        openAddSubjectModal={vi.fn()}
        selectSubject={selectSubject}
        setActiveTopicInputSubjectId={vi.fn()}
        setNewTopicName={vi.fn()}
        setNewTopicDefinition={vi.fn()}
        handleDeleteSubject={vi.fn()}
        handleAddTopic={vi.fn()}
        setSelectedSubjectId={setSelectedSubjectId}
        setSelectedTopic={setSelectedTopic}
        handleDeleteTopic={vi.fn()}
      />
    );

    const subjectHeader = screen.getByTitle('Matéria: Matemática - Clique para selecionar somente esta matéria');
    fireEvent.click(subjectHeader);

    expect(selectSubject).toHaveBeenCalledWith('sub1');
  });

  it('toggles active topic off and calls selectSubject when clicking on active topic', () => {
    const selectSubject = vi.fn();
    const setSelectedSubjectId = vi.fn();
    const setSelectedTopic = vi.fn();

    render(
      <MonitorStructureSidebar
        monitor={mockMonitor}
        selectedSubject={mockMonitor.subjects[0]}
        selectedSubjectId="sub1"
        selectedTopic="Álgebra"
        selectedTopicId="top1"
        sidebarView="structure"
        publishValidation={{ canPublish: true, reason: '', completedTopics: 2, totalTopics: 2 }}
        documents={[]}
        questions={[]}
        flashcards={[]}
        activeTopicInputSubjectId={null}
        newTopicName=""
        newTopicDefinition=""
        openAddSubjectModal={vi.fn()}
        selectSubject={selectSubject}
        setActiveTopicInputSubjectId={vi.fn()}
        setNewTopicName={vi.fn()}
        setNewTopicDefinition={vi.fn()}
        handleDeleteSubject={vi.fn()}
        handleAddTopic={vi.fn()}
        setSelectedSubjectId={setSelectedSubjectId}
        setSelectedTopic={setSelectedTopic}
        handleDeleteTopic={vi.fn()}
      />
    );

    const algebraTopic = screen.getByText('Álgebra');
    fireEvent.click(algebraTopic);

    expect(selectSubject).toHaveBeenCalledWith('sub1');
  });

  it('selects a different topic when clicked', () => {
    const selectSubject = vi.fn();
    const setSelectedSubjectId = vi.fn();
    const setSelectedTopic = vi.fn();

    render(
      <MonitorStructureSidebar
        monitor={mockMonitor}
        selectedSubject={mockMonitor.subjects[0]}
        selectedSubjectId="sub1"
        selectedTopic="Álgebra"
        selectedTopicId="top1"
        sidebarView="structure"
        publishValidation={{ canPublish: true, reason: '', completedTopics: 2, totalTopics: 2 }}
        documents={[]}
        questions={[]}
        flashcards={[]}
        activeTopicInputSubjectId={null}
        newTopicName=""
        newTopicDefinition=""
        openAddSubjectModal={vi.fn()}
        selectSubject={selectSubject}
        setActiveTopicInputSubjectId={vi.fn()}
        setNewTopicName={vi.fn()}
        setNewTopicDefinition={vi.fn()}
        handleDeleteSubject={vi.fn()}
        handleAddTopic={vi.fn()}
        setSelectedSubjectId={setSelectedSubjectId}
        setSelectedTopic={setSelectedTopic}
        handleDeleteTopic={vi.fn()}
      />
    );

    const geometriaTopic = screen.getByText('Geometria');
    fireEvent.click(geometriaTopic);

    expect(setSelectedSubjectId).toHaveBeenCalledWith('sub1');
    expect(setSelectedTopic).toHaveBeenCalledWith('Geometria');
  });
});
