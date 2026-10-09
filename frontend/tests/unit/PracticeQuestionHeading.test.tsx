import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PracticeQuestionHeading } from '@/modules/student/components/PracticeQuestionHeading';

describe('PracticeQuestionHeading', () => {
  it('mostra ENEM e 2008 no cabeçalho da questão', () => {
    const { container } = render(
      <PracticeQuestionHeading
        questionNumber={1}
        totalQuestions={1}
        topic="Álgebra"
        provenance={{ board: null, examName: 'ENEM', examYear: 2008 }}
      />,
    );

    expect(container.querySelector('p')).toHaveTextContent('Questão 1 de 1 • Álgebra • ENEM • 2008');
  });

  it('prefere a banca ao nome da prova e mostra o ano', () => {
    const { container } = render(
      <PracticeQuestionHeading
        questionNumber={2}
        totalQuestions={4}
        topic="Gramática"
        provenance={{ board: ' CESGRANRIO ', examName: 'Concurso Banco X', examYear: 2023 }}
      />,
    );

    expect(container.querySelector('p')).toHaveTextContent('Questão 2 de 4 • Gramática • CESGRANRIO • 2023');
    expect(container.querySelector('p')).not.toHaveTextContent('Concurso Banco X');
  });

  it('usa o nome da prova e omite o ano ausente', () => {
    const { container } = render(
      <PracticeQuestionHeading
        questionNumber={3}
        totalQuestions={4}
        topic="Funções"
        provenance={{ board: '  ', examName: 'ENEM', examYear: null }}
      />,
    );

    expect(container.querySelector('p')).toHaveTextContent('Questão 3 de 4 • Funções • ENEM');
    expect(container.querySelector('p')).not.toHaveTextContent('ENEM •');
  });

  it('não deixa separadores vazios para questão sem origem', () => {
    const { container } = render(
      <PracticeQuestionHeading questionNumber={4} totalQuestions={4} topic="Probabilidade" provenance={null} />,
    );

    expect(container.querySelector('p')).toHaveTextContent('Questão 4 de 4 • Probabilidade');
    expect(container.querySelector('p')?.textContent).not.toContain('•  •');
  });
});
