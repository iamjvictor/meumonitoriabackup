'use client';

import dynamic from 'next/dynamic';
import { StudentAppShell, StudentHeader, useStudent } from '@/modules/student';
import { DashboardChallengeSection } from './components/DashboardChallengeSection';
import { DashboardStudyActions } from './components/DashboardStudyActions';
import { DashboardPerformanceSection } from './components/DashboardPerformanceSection';
import { useStudentDashboard } from './hooks/useStudentDashboard';
import { useDailyChallenge } from './hooks/useDailyChallenge';
import { useFlashcardReview } from './hooks/useFlashcardReview';
import { ContentReportModal } from './components/ContentReportModal';
import { PurchaseSuccessModal } from './components/PurchaseSuccessModal';
import { isPurchaseSuccessStatus } from './models/purchase-return';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const DailyChallengeModal = dynamic(
  () => import('./components/DailyChallengeModal').then((module) => module.DailyChallengeModal),
  { ssr: false, loading: () => null }
);

const FlashcardReviewModal = dynamic(
  () => import('./components/FlashcardReviewModal').then((module) => module.FlashcardReviewModal),
  { ssr: false, loading: () => null }
);

export default function AreaDoAlunoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, fetchMonitors, activeFlashcardContext, setActiveFlashcardContext } = useStudent();
  const { dailyChallenges, setDailyChallenges, performanceStats, consistencySummary, visibleConsistencyDays, dailyChallengeSummary, isLoadingDailyChallengeSummary } = useStudentDashboard(status);
  const { dailyChallenge, setDailyChallenge, isChallengeModalOpen, setIsChallengeModalOpen, selectedChallengeAnswer, setSelectedChallengeAnswer, challengeResult, isSubmittingChallenge, challengeAlternatives, openChallengeModal, submitChallengeAnswer } = useDailyChallenge(setDailyChallenges);
  const { isFlashcardModalOpen, setIsFlashcardModalOpen, currentFlashcard, isLoadingFlashcard, isFlipped, setIsFlipped, hasReviewedCard, isSubmittingReview, handleOpenFlashcardModal, handleNextFlashcard, handleReviewFlashcard } = useFlashcardReview(status);

  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: 'QUESTION' | 'FLASHCARD'; id: string } | null>(null);
  const [purchaseSuccessOpen, setPurchaseSuccessOpen] = useState(false);
  const activePeriod = 'Últimos 7 dias';

  useEffect(() => {
    setPurchaseSuccessOpen(isPurchaseSuccessStatus(searchParams.get('status')));
    if (isPurchaseSuccessStatus(searchParams.get('status')) && status === 'authenticated') {
      void fetchMonitors(true);
    }
  }, [fetchMonitors, searchParams, status]);

  const closePurchaseSuccess = () => {
    setPurchaseSuccessOpen(false);
    router.replace('/areadoaluno', { scroll: false });
  };

  return (
    <StudentAppShell activeNav="home" header={<StudentHeader showGreeting />} showMobileNavigation={false}>

          <div className={`w-full ${dailyChallenges.length > 0 ? 'mt-8' : 'mt-4'}`}>
            <div className="min-w-0">
              <DashboardChallengeSection dailyChallenges={dailyChallenges} onOpenChallenge={openChallengeModal} />

              <DashboardStudyActions onFlashcards={handleOpenFlashcardModal} hasDailyChallenges={dailyChallenges.length > 0} />

              <DashboardPerformanceSection
                performanceStats={performanceStats}
                consistencySummary={consistencySummary}
                visibleConsistencyDays={visibleConsistencyDays}
                dailyChallengeSummary={dailyChallengeSummary}
                isLoadingDailyChallengeSummary={isLoadingDailyChallengeSummary}
                activePeriod={activePeriod}
              />

            </div>
          </div>

      <DailyChallengeModal
        isChallengeModalOpen={isChallengeModalOpen}
        dailyChallenge={dailyChallenge}
        challengeResult={challengeResult}
        challengeAlternatives={challengeAlternatives}
        selectedChallengeAnswer={selectedChallengeAnswer}
        isSubmittingChallenge={isSubmittingChallenge}
        setSelectedChallengeAnswer={setSelectedChallengeAnswer}
        submitChallengeAnswer={submitChallengeAnswer}
        onClose={() => { setIsChallengeModalOpen(false); setDailyChallenge(null); }}
        onNextChallenge={dailyChallenges.length > 0 ? () => openChallengeModal(dailyChallenges[0]) : undefined}
        hasNextChallenge={dailyChallenges.length > 0}
      />

      {/* Modal de Flashcard com Backdrop Blur */}
      <FlashcardReviewModal
        isFlashcardModalOpen={isFlashcardModalOpen}
        currentFlashcard={currentFlashcard}
        isLoadingFlashcard={isLoadingFlashcard}
        isFlipped={isFlipped}
        setIsFlipped={setIsFlipped}
        hasReviewedCard={hasReviewedCard}
        isSubmittingReview={isSubmittingReview}
        handleNextFlashcard={handleNextFlashcard}
        handleReviewFlashcard={handleReviewFlashcard}
        onClose={() => setIsFlashcardModalOpen(false)}
        isAiContextAttached={activeFlashcardContext?.id === currentFlashcard?.id}
        onAskAi={() => {
          if (!currentFlashcard?.id || !currentFlashcard.monitorId || !currentFlashcard.subjectId) return;
          setActiveFlashcardContext({
            id: currentFlashcard.id,
            monitorId: currentFlashcard.monitorId,
            subjectId: currentFlashcard.subjectId,
            topicId: currentFlashcard.topicId,
            topic: currentFlashcard.topic,
            front: currentFlashcard.question,
            back: currentFlashcard.answer,
          });
          setIsFlashcardModalOpen(false);
          if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches) {
            router.push('/areadoaluno/chat');
          }
        }}
        onReport={() => {
          if (currentFlashcard?.id) {
            setReportTarget({ type: 'FLASHCARD', id: currentFlashcard.id });
            setReportModalOpen(true);
          }
        }}
      />

      <ContentReportModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        targetType={reportTarget?.type || 'QUESTION'}
        questionId={reportTarget?.type === 'QUESTION' ? reportTarget.id : undefined}
        flashcardId={reportTarget?.type === 'FLASHCARD' ? reportTarget.id : undefined}
      />

      <PurchaseSuccessModal
        isOpen={purchaseSuccessOpen}
        onClose={closePurchaseSuccess}
        onPractice={() => {
          setPurchaseSuccessOpen(false);
          router.push('/areadoaluno/pratica');
        }}
      />

    </StudentAppShell>
  );
}
