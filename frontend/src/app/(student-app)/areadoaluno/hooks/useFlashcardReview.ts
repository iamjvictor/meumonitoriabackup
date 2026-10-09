'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { studentDashboardService } from '../services/student-dashboard.service';

export interface FlashcardItem { id?: string; monitorId?: string; subjectId?: string; topicId?: string; subject: string; topic?: string; question: string; answer: string; monitorName?: string }
type Rating = 'AGAIN' | 'HARD' | 'GOOD' | 'EASY';

export function useFlashcardReview(status: string) {
  const [isFlashcardModalOpen, setIsFlashcardModalOpen] = useState(false);
  const [currentFlashcard, setCurrentFlashcard] = useState<FlashcardItem | null>(null);
  const [isLoadingFlashcard, setIsLoadingFlashcard] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [hasReviewedCard, setHasReviewedCard] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const router = useRouter();
  const goToLogin = () => router.push('/?login=true&perfil=aluno&session=expired');

  const fetchRandomFlashcard = async () => {
    if (status === 'unauthenticated') { goToLogin(); return; }
    setIsLoadingFlashcard(true); setHasReviewedCard(false);
    try {
      const response = await studentDashboardService.loadRandomFlashcard(currentFlashcard?.id);
      if (response.status === 401 || response.status === 403) { goToLogin(); return; }
      const body = await response.json().catch(() => ({}));
      setCurrentFlashcard(response.ok && body.data ? {
        id: body.data.id, monitorId: body.data.monitorId, subjectId: body.data.subjectId, topicId: body.data.topicId, subject: body.data.subject, topic: body.data.topic, question: body.data.question, answer: body.data.answer, monitorName: body.data.monitorName,
      } : null);
    } catch (error) { console.error('Erro ao buscar flashcard aleatório:', error); setCurrentFlashcard(null); }
    finally { setIsLoadingFlashcard(false); }
  };
  const handleOpenFlashcardModal = () => {
    if (status === 'unauthenticated') { goToLogin(); return; }
    setIsFlipped(false); setHasReviewedCard(false); setIsFlashcardModalOpen(true); void fetchRandomFlashcard();
  };
  const handleNextFlashcard = () => {
    if (status === 'unauthenticated') { goToLogin(); return; }
    setIsFlipped(false); setHasReviewedCard(false); void fetchRandomFlashcard();
  };
  const handleReviewFlashcard = (rating: Rating) => {
    if (status === 'unauthenticated') { goToLogin(); return; }
    if (!currentFlashcard?.id || isSubmittingReview) return;
    setHasReviewedCard(true); setIsSubmittingReview(true);
    void studentDashboardService.reviewFlashcard(currentFlashcard.id, rating).then((response) => {
      if (response.status === 401 || response.status === 403) goToLogin();
      if (response.ok) console.log('[Dashboard Aluno] Review do flashcard salvo com sucesso!');
    }).catch((error) => console.error('[Dashboard Aluno] Erro ao enviar review do flashcard:', error)).finally(() => setIsSubmittingReview(false));
  };
  return { isFlashcardModalOpen, setIsFlashcardModalOpen, currentFlashcard, isLoadingFlashcard, isFlipped, setIsFlipped, hasReviewedCard, isSubmittingReview, handleOpenFlashcardModal, handleNextFlashcard, handleReviewFlashcard };
}
