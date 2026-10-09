'use client';
import { OptimizedImage, LoadingState } from '@/shared';
/* eslint-disable react-hooks/set-state-in-effect -- Effects synchronize storage, chat context and API history. */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {
  Sparkles,
  Plus,
  ChevronDown,
  RotateCcw,
  User,
  Paperclip,
  ArrowUp,
  MessageSquare,
  Check,
  Loader2,
  X,
  PanelRightClose,
  PanelRightOpen,
  Image as ImageIcon,
  FileText,
  GripVertical
} from 'lucide-react';
import { TeacherAvatar } from './TeacherAvatar';
import { useStudent, type StudentChatMessage, type StudentMonitorRecord, type StudentMonitorSubject } from '../context/StudentContext';

type Message = StudentChatMessage;

type ChatHistoryMessage = {
  id?: string;
  role: 'student' | 'assistant';
  content: string;
  createdAt: string;
  questionContext?: { number?: number };
  contextAttachment?: { type?: 'QUESTION' | 'FLASHCARD' };
};

type ChatSendPayload = {
  message: string;
  topicId: string | null;
  questionContext: Record<string, unknown> | null;
  contextAttachment: Record<string, unknown> | null;
};

type ChatRetryRequest = {
  monitorId: string;
  subjectId: string;
  payload: ChatSendPayload;
};

function getChatErrorMessage(status: number, body: { error?: unknown; message?: unknown }): string {
  const code = typeof body.error === 'string' ? body.error : '';

  if (status === 403 || code === 'CHAT_ACCESS_DENIED') {
    return 'Você não possui acesso a esta matéria ou monitor.';
  }
  if (code === 'CHAT_GENERATION_TIMEOUT' || status === 504) {
    return 'A resposta demorou demais. Tente novamente.';
  }
  if (code === 'CHAT_GENERATION_FAILED') {
    return 'Não foi possível gerar uma resposta agora. Tente novamente.';
  }
  if (status === 429 || code === 'CHAT_USAGE_LIMIT_REACHED') {
    return 'Você atingiu o limite de uso do chat por enquanto.';
  }
  if (typeof body.message === 'string' && body.message.trim()) return body.message;
  if (status >= 500) return 'O chat está temporariamente indisponível. Tente novamente.';
  return 'Não foi possível processar sua mensagem. Tente novamente.';
}

function getChatNetworkErrorMessage(error: unknown): string {
  if (error instanceof TypeError || (error instanceof Error && error.message === 'Failed to fetch')) {
    return 'Não foi possível conectar ao chat. Verifique sua conexão e tente novamente.';
  }
  return error instanceof Error && error.message
    ? error.message
    : 'Não foi possível enviar a mensagem. Tente novamente.';
}

function formatTeacherName(name?: string): string {
  if (!name) return 'Professor';
  const clean = name.trim();
  if (clean.toLowerCase().startsWith('prof.') || clean.toLowerCase().startsWith('profª.')) {
    return clean;
  }
  return `Prof. ${clean}`;
}

interface AgentOption {
  id: string;
  monitorId: string;
  subjectId: string;
  name: string;
  subjectName: string;
  teacherName: string;
  teacherAvatar: string;
}

function getInitials(name: string) {
  if (!name) return 'PR';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function createGreeting(agent: AgentOption): Message {
  return {
    id: `greeting-${agent.id}`,
    sender: 'assistant',
    text: `Olá! Sou seu assistente de ${agent.subjectName}, orientado por ${formatTeacherName(agent.teacherName)}. Como posso ajudar nos seus estudos hoje?`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
}

function formatHistoryTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function AssistantMessageContent({ content }: { content: string }) {
  return (
    <div className="chat-markdown text-xs leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          h1: ({ children }) => <h1 className="mb-2 text-sm font-bold">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 text-sm font-bold">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1.5 text-xs font-bold">{children}</h3>,
          ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-[#2E5B37]/40 pl-3 italic text-[#0F2942]/70">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-3 border-[#0F2942]/10" />,
          code: ({ children, className }) => (
            <code className={className || 'rounded bg-[#0F2942]/8 px-1 py-0.5 text-[11px]'}>
              {children}
            </code>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[#1D527D] underline underline-offset-2"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function StudentRightSidebar({ className: _className = '' }: { className?: string }) {
  const {
    monitors,
    activeContext,
    setActiveContext,
    activeFlashcardContext,
    setActiveFlashcardContext,
    chatMessages,
    chatScopeKey,
    chatHistoryLoaded,
    setChatState,
    chatSelectedScopeKey,
    setChatSelectedScopeKey,
  } = useStudent() || {};
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8443';
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);

  // Estado para largura dinâmica e redimensionamento por drag (arrastar)
  const [sidebarWidth, setSidebarWidth] = useState<number>(380);
  const [isResizing, setIsResizing] = useState<boolean>(false);

  // Carrega preferência de largura salva no localStorage no primeiro render
  useEffect(() => {
    try {
      const savedWidth = localStorage.getItem('mm_student_sidebar_width');
      if (savedWidth) {
        const parsed = parseInt(savedWidth, 10);
        if (parsed >= 300 && parsed <= 800) {
          setSidebarWidth(parsed);
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Lógica do Drag de Redimensionamento
  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      // A nova largura é a distância entre a borda direita do viewport e a posição do mouse X
      const newWidth = window.innerWidth - e.clientX;
      const minW = 310;
      const maxW = Math.min(780, Math.floor(window.innerWidth * 0.55));

      if (newWidth >= minW && newWidth <= maxW) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      try {
        localStorage.setItem('mm_student_sidebar_width', String(sidebarWidth));
      } catch {
        // Ignore localStorage errors
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, sidebarWidth]);

  // Expande automaticamente a sidebar ao anexar o contexto de uma questão
  useEffect(() => {
    if (activeContext || activeFlashcardContext) {
      setIsCollapsed(false);
    }
  }, [activeContext, activeFlashcardContext]);
  
  // Constrói as opções exclusivamente com os monitores e matérias vindos da API.
  const availableAgents: AgentOption[] = React.useMemo(() => {
    if (monitors && Array.isArray(monitors) && monitors.length > 0) {
      const list: AgentOption[] = [];
      monitors.forEach((m: StudentMonitorRecord) => {
        const teacherName = m.teacher?.fullName || m.teacherName || 'Professor Responsável';
        const teacherAvatar = m.teacher?.avatarUrl || m.avatarUrl || '';
        const monitorName = m.name || m.title || 'Monitor';

        if (Array.isArray(m.subjects) && m.subjects.length > 0) {
          m.subjects.forEach((subj: StudentMonitorSubject) => {
            if (!m.id || !subj || typeof subj !== 'object' || !subj.id) return;
            const sName = typeof subj === 'string' ? subj : (subj.name || subj.title || monitorName);
            list.push({
              id: `${m.id}-${subj.id}`,
              monitorId: m.id,
              subjectId: subj.id,
              name: monitorName,
              subjectName: sName,
              teacherName,
              teacherAvatar,
            });
          });
        } else {
          if (!m.id || !m.subjectId) return;
          list.push({
            id: m.id,
            monitorId: m.id,
            subjectId: m.subjectId,
            name: monitorName,
            subjectName: m.subject || m.area || m.name || 'Matéria',
            teacherName,
            teacherAvatar,
          });
        }
      });
      return list;
    }
    return [];
  }, [monitors]);

  const [selectedAgent, setSelectedAgent] = useState<AgentOption | null>(null);
  const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false);

  useEffect(() => {
    const preferredAgent = availableAgents.find((agent) => (
      `${agent.monitorId}:${agent.subjectId}` === chatSelectedScopeKey
    )) ?? availableAgents[0];
    if (preferredAgent && (!selectedAgent || selectedAgent.id !== preferredAgent.id)) {
      setSelectedAgent(preferredAgent);
      setChatSelectedScopeKey?.(`${preferredAgent.monitorId}:${preferredAgent.subjectId}`);
    }
  }, [availableAgents, chatSelectedScopeKey, selectedAgent, setChatSelectedScopeKey]);

  useEffect(() => {
    const attachmentContext = activeContext ?? activeFlashcardContext;
    if (!attachmentContext?.monitorId || !attachmentContext.subjectId) return;
    const questionAgent = availableAgents.find((agent) => (
      agent.monitorId === attachmentContext.monitorId && agent.subjectId === attachmentContext.subjectId
    ));
    if (questionAgent && selectedAgent?.id !== questionAgent.id) {
      setSelectedAgent(questionAgent);
      setChatSelectedScopeKey?.(`${questionAgent.monitorId}:${questionAgent.subjectId}`);
    }
  }, [activeContext, activeFlashcardContext, availableAgents, selectedAgent, setChatSelectedScopeKey]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [retryRequest, setRetryRequest] = useState<ChatRetryRequest | null>(null);
  const [attachedFile, setAttachedFile] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!isCollapsed) {
      scrollToBottom();
    }
  }, [messages, isTyping, isCollapsed]);

  useEffect(() => {
    if (!selectedAgent?.monitorId || !selectedAgent.subjectId) return;

    const currentScopeKey = `${selectedAgent.monitorId}:${selectedAgent.subjectId}`;
    if (chatHistoryLoaded && chatScopeKey === currentScopeKey) {
      setMessages(chatMessages ?? []);
      setIsLoadingHistory(false);
      return;
    }

    let cancelled = false;
    const loadHistory = async () => {
      setIsLoadingHistory(true);
      setChatError(null);
      try {
        const response = await fetch(
          `${apiUrl}/api/v1/student/monitors/${encodeURIComponent(selectedAgent.monitorId)}/chat/subjects/${encodeURIComponent(selectedAgent.subjectId)}/messages`,
          { method: 'GET', credentials: 'include' },
        );
        const responseBody = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(responseBody.message || responseBody.error || 'Não foi possível carregar o histórico.');
        }

        const storedMessages = (Array.isArray(responseBody?.data?.messages)
          ? responseBody.data.messages
          : []) as ChatHistoryMessage[];
        const restoredMessages: Message[] = storedMessages
          .filter((message) => (
            (message?.role === 'student' || message?.role === 'assistant')
            && typeof message?.content === 'string'
          ))
          .map((message) => ({
            id: message.id || `history-${message.createdAt}-${message.role}`,
            sender: message.role === 'student' ? 'user' : 'assistant',
            text: message.content,
            timestamp: formatHistoryTime(message.createdAt),
            questionContextNumber: message.questionContext?.number ?? undefined,
            attachmentType: message.contextAttachment?.type
              ?? (message.questionContext ? 'QUESTION' : undefined),
          }));

        if (!cancelled) {
          const nextMessages = restoredMessages.length > 0 ? restoredMessages : [createGreeting(selectedAgent)];
          setMessages(nextMessages);
          setChatState?.({ scopeKey: currentScopeKey, messages: nextMessages, historyLoaded: true });
        }
      } catch (error) {
        if (!cancelled) {
          const nextMessages = [createGreeting(selectedAgent)];
          setMessages(nextMessages);
          setChatState?.({ scopeKey: currentScopeKey, messages: nextMessages, historyLoaded: true });
          setChatError(error instanceof Error ? error.message : 'Não foi possível carregar o histórico.');
        }
      } finally {
        if (!cancelled) setIsLoadingHistory(false);
      }
    };

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, chatHistoryLoaded, chatMessages, chatScopeKey, selectedAgent, setChatState]);

  const handleSendMessage = async (textToSend?: string, retry?: ChatRetryRequest) => {
    if (isTyping) return;
    if (!selectedAgent?.monitorId || !selectedAgent.subjectId) {
      setChatError('Selecione um monitor e uma matéria válidos antes de enviar.');
      return;
    }

    const isRetry = Boolean(retry);
    const targetMonitorId = retry?.monitorId || selectedAgent.monitorId;
    const targetSubjectId = retry?.subjectId || selectedAgent.subjectId;
    const rawText = textToSend || inputMessage;
    if (!retry && !rawText.trim() && !attachedFile && !activeContext && !activeFlashcardContext) return;

    const messageText = retry?.payload.message
      || rawText.trim()
      || 'Pode me ajudar a entender e resolver esta questão passo a passo?';
    const payload: ChatSendPayload = retry?.payload || {
      message: messageText,
      topicId: activeContext?.topicId || activeFlashcardContext?.topicId || null,
      questionContext: activeContext
        ? {
          questionId: activeContext.id,
          questionAttemptId: activeContext.questionAttemptId || null,
          monitorId: activeContext.monitorId || selectedAgent.monitorId,
          subjectId: activeContext.subjectId || selectedAgent.subjectId,
          topicId: activeContext.topicId || null,
          number: activeContext.number,
          topic: activeContext.topic || null,
          statement: activeContext.statement,
          options: activeContext.options || [],
          selectedOption: activeContext.selectedOption || null,
        }
        : null,
      contextAttachment: activeFlashcardContext
        ? {
          type: 'FLASHCARD',
          id: activeFlashcardContext.id,
          monitorId: activeFlashcardContext.monitorId,
          subjectId: activeFlashcardContext.subjectId,
        }
        : null,
    };

    const userMsg: Message | null = isRetry ? null : {
      id: Date.now().toString(),
      sender: 'user',
      text: attachedFile ? `[Arquivo: ${attachedFile}] ${messageText}` : messageText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      questionContextNumber: activeContext?.number,
      attachmentType: activeFlashcardContext ? 'FLASHCARD' : activeContext ? 'QUESTION' : undefined,
    };

    if (userMsg) setMessages((prev) => [...prev, userMsg]);
    const currentScopeKey = `${targetMonitorId}:${targetSubjectId}`;
    if (userMsg && setChatState) {
      setChatState({
        scopeKey: currentScopeKey,
        messages: [...(chatScopeKey === currentScopeKey ? chatMessages ?? [] : []), userMsg],
        historyLoaded: true,
      });
    }
    if (!isRetry) {
      if (!textToSend) setInputMessage('');
      setAttachedFile(null);
      if (activeContext && setActiveContext) setActiveContext(null);
      if (activeFlashcardContext && setActiveFlashcardContext) setActiveFlashcardContext(null);
    }
    setIsTyping(true);
    setChatError(null);
    setRetryRequest({ monitorId: targetMonitorId, subjectId: targetSubjectId, payload });

    try {
      const response = await fetch(
        `${apiUrl}/api/v1/student/monitors/${encodeURIComponent(targetMonitorId)}/chat/subjects/${encodeURIComponent(targetSubjectId)}/messages`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      const responseBody = await response.json().catch(() => ({})) as { data?: { message?: unknown; messageId?: string }; error?: unknown; message?: unknown };
      if (!response.ok) {
        throw new Error(getChatErrorMessage(response.status, responseBody));
      }

      const assistantMessage = responseBody?.data?.message;
      if (typeof assistantMessage !== 'string' || !assistantMessage.trim()) {
        throw new Error('A resposta do chat veio vazia. Tente novamente.');
      }

      const assistantMsg: Message = {
        id: responseBody.data?.messageId || `assistant-${Date.now()}`,
        sender: 'assistant',
        text: assistantMessage,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      if (currentScopeKey && setChatState) {
        setChatState({
          scopeKey: currentScopeKey,
          messages: [...(chatScopeKey === currentScopeKey ? chatMessages ?? [] : []), ...(userMsg ? [userMsg] : []), assistantMsg],
          historyLoaded: true,
        });
      }
      setRetryRequest(null);
    } catch (error) {
      setChatError(error instanceof Error && error.message !== 'Failed to fetch'
        ? error.message
        : getChatNetworkErrorMessage(error));
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearChat = async () => {
    const nextMessages = selectedAgent ? [createGreeting(selectedAgent)] : [];
    if (selectedAgent?.monitorId && selectedAgent.subjectId) {
      try {
        const response = await fetch(
          `${apiUrl}/api/v1/student/monitors/${encodeURIComponent(selectedAgent.monitorId)}/chat/subjects/${encodeURIComponent(selectedAgent.subjectId)}/messages`,
          { method: 'DELETE', credentials: 'include' },
        );
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.message || body.error || 'Não foi possível encerrar a conversa.');
        }
      } catch (error) {
        setChatError(error instanceof Error ? error.message : 'Não foi possível encerrar a conversa.');
        return;
      }
    }
    setMessages(nextMessages);
    if (selectedAgent && setChatState) {
      setChatState({
        scopeKey: `${selectedAgent.monitorId}:${selectedAgent.subjectId}`,
        messages: nextMessages,
        historyLoaded: true,
      });
    }
    setChatError(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachedFile(file.name);
    }
  };

  if (!selectedAgent) {
    return (
      <aside className="hidden w-[380px] shrink-0 items-center justify-center border-l border-[#0F2942]/10 bg-[#F8F5EE] p-6 text-center text-xs text-[#0F2942]/60 lg:flex">
        {monitors === null ? (
          <LoadingState variant="inline" size="sm" message="Carregando seus monitores..." />
        ) : (
          'Nenhum monitor ou matéria disponível para o chat.'
        )}
      </aside>
    );
  }

  // CASO A SIDEBAR ESTEJA RECOLHIDA (MODO SLIM / ICONES)
  if (isCollapsed) {
    return (
      <aside className="hidden w-16 shrink-0 flex-col items-center border-l border-[#0F2942]/10 bg-[#F8F5EE] py-4 transition-all duration-300 ease-in-out lg:flex h-screen sticky top-0 shadow-xs">
        {/* Botão de Expandir no topo */}
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          title="Expandir Chat"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-[#0F2942]/70 transition hover:bg-white hover:text-[#0F2942] hover:shadow-xs cursor-pointer"
        >
          <PanelRightOpen className="h-5 w-5" />
        </button>

        <div className="my-4 h-px w-8 bg-[#0F2942]/10" />

        {/* Foto de Perfil do Professor Dono do Monitor (Online) */}
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          title={`Chat com ${selectedAgent.teacherName} - ${selectedAgent.name}`}
          className="relative flex h-10 w-10 items-center justify-center cursor-pointer transition hover:scale-105"
        >
          <TeacherAvatar
            src={selectedAgent.teacherAvatar}
            alt={selectedAgent.teacherName}
            initials={getInitials(selectedAgent.teacherName)}
            sizeClassName="h-10 w-10"
          />
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[#76D69B] ring-2 ring-[#F8F5EE] z-10" />
        </button>

        <div className="mt-auto flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => setIsCollapsed(false)}
            title="Nova mensagem no Chat"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-[#0F2942]/10 text-[#0F2942] shadow-xs transition hover:border-[#2E5B37] hover:text-[#2E5B37] cursor-pointer"
          >
            <MessageSquare className="h-5 w-5" />
          </button>
        </div>
      </aside>
    );
  }

  // CASO A SIDEBAR ESTEJA EXPANDIDA (MODO NORMAL COM LARGURA REDIMENSIONÁVEL)
  return (
    <aside
      style={{ width: `${sidebarWidth}px` }}
      className={`relative hidden shrink-0 flex-col border-l border-[#0F2942]/10 bg-[#F8F5EE] lg:flex h-screen sticky top-0 shadow-xs ${
        isResizing ? 'select-none transition-none' : 'transition-all duration-150 ease-out'
      }`}
    >
      {/* ALÇA DRAGGABLE DE REDIMENSIONAMENTO (LEFT EDGE) */}
      <div
        onMouseDown={startResizing}
        onDoubleClick={() => setSidebarWidth(380)}
        title="Arraste para ajustar a largura do chat (clique duplo para restaurar)"
        className={`absolute -left-1.5 top-0 bottom-0 w-3 cursor-col-resize z-40 group flex items-center justify-center transition-colors ${
          isResizing ? 'bg-[#2E5B37]/30' : 'hover:bg-[#2E5B37]/20'
        }`}
      >
        <div className={`h-12 w-1.5 rounded-full transition-all flex items-center justify-center ${
          isResizing ? 'bg-[#2E5B37]' : 'bg-[#0F2942]/20 group-hover:bg-[#2E5B37]'
        }`}>
          <GripVertical className="h-3 w-3 text-white opacity-80" />
        </div>
      </div>

      {/* Header do Chat */}
      <div className="flex items-center justify-between border-b border-[#1B4332] bg-[#2E5B37] px-3.5 py-3.5 shadow-xs">
        {/* BOTÃO DE RECOLHER À ESQUERDA DO HEADER */}
        <button
          type="button"
          onClick={() => setIsCollapsed(true)}
          title="Recolher Sidebar"
          className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white/80 transition hover:bg-white/15 hover:text-white cursor-pointer"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>

        {/* Informações do Agente e Foto do Professor */}
        <div className="relative flex-1">
          <button
            type="button"
            onClick={() => setIsAgentMenuOpen(!isAgentMenuOpen)}
            className="flex items-center gap-2.5 rounded-xl p-1 transition hover:bg-white/10 text-left cursor-pointer"
          >
            {/* Foto de Perfil do Professor */}
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
              <TeacherAvatar
                src={selectedAgent.teacherAvatar}
                alt={selectedAgent.teacherName}
                initials={getInitials(selectedAgent.teacherName)}
                sizeClassName="h-9 w-9"
              />
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#76D69B] ring-2 ring-[#2E5B37] z-10" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="truncate font-heading text-xs font-bold text-white">
                  {selectedAgent.subjectName}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-white/70 shrink-0" />
              </div>
              <p className="truncate text-[10px] font-medium text-[#B8EAC5]">
                {formatTeacherName(selectedAgent.teacherName)} • Online
              </p>
            </div>
          </button>

          {/* Menu Dropdown de Matérias dos Monitores */}
          {isAgentMenuOpen && (
            <div className="absolute left-0 top-full z-30 mt-1 w-full rounded-2xl border border-[#0F2942]/10 bg-white p-2 shadow-lg animate-fade-in max-h-64 overflow-y-auto">
              <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#0F2942]/45">Matérias dos Monitores</p>
              {availableAgents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => {
                    setSelectedAgent(agent);
                    setChatSelectedScopeKey?.(`${agent.monitorId}:${agent.subjectId}`);
                    setIsAgentMenuOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-xs font-bold transition cursor-pointer ${selectedAgent.id === agent.id ? 'bg-[#E3F1E4] text-[#2E5B37]' : 'text-[#0F2942] hover:bg-[#F8F5EE]'}`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <OptimizedImage
                      src={agent.teacherAvatar}
                      alt={agent.teacherName}
                      className="h-6 w-6 rounded-lg object-cover ring-1 ring-[#0F2942]/10 shrink-0"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = '';
                      }}
                    />
                    <div className="truncate text-left">
                      <p className="truncate text-xs font-bold">{agent.subjectName}</p>
                      <p className="truncate text-[10px] font-normal text-[#0F2942]/60">{formatTeacherName(agent.teacherName)}</p>
                    </div>
                  </div>
                  {selectedAgent.id === agent.id && <Check className="h-3.5 w-3.5 text-[#2E5B37] shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Botão para limpar conversa */}
        <button
          type="button"
          onClick={handleClearChat}
          title="Nova Conversa"
          className="flex h-8 w-8 items-center justify-center rounded-xl text-white/80 transition hover:bg-white/15 hover:text-white cursor-pointer"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      {/* ÁREA DE MENSAGENS DO CHAT */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {isLoadingHistory && (
          <div className="flex items-center gap-2 px-2 py-3 text-xs text-[#0F2942]/55">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Carregando conversa...
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex w-full ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[85%] space-y-1 ${msg.sender === 'user' ? 'flex flex-col items-end text-right' : 'flex flex-col items-start text-left'}`}>
              {msg.sender === 'user' && msg.questionContextNumber && (
                <div className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[9px] font-bold text-amber-800">
                  <Paperclip className="h-3 w-3" />
                  Questão #{msg.questionContextNumber} anexada
                </div>
              )}
              {msg.sender === 'user' && msg.attachmentType === 'FLASHCARD' && (
                <div className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[9px] font-bold text-amber-800">
                  <Sparkles className="h-3 w-3" />
                  Flashcard anexado
                </div>
              )}
              <div
                className={`rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-[#2E5B37] text-white rounded-tr-xs shadow-xs font-normal'
                    : 'bg-white border border-[#0F2942]/10 text-[#0F2942] rounded-tl-xs shadow-xs font-normal'
                }`}
              >
                {msg.sender === 'assistant' ? <AssistantMessageContent content={msg.text} /> : msg.text}
              </div>
              <span className="block text-[9px] font-medium text-[#0F2942]/40 px-1">
                {msg.timestamp}
              </span>
            </div>
          </div>
        ))}

        {/* Indicador de Digitação da IA */}
        {isTyping && (
          <div className="flex justify-start text-xs text-[#0F2942]/60">
            <div className="flex items-center gap-1 rounded-2xl bg-white border border-[#0F2942]/10 px-3 py-2 shadow-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-[#2E5B37] animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="h-1.5 w-1.5 rounded-full bg-[#2E5B37] animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="h-1.5 w-1.5 rounded-full bg-[#2E5B37] animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* CONTEXTO DA QUESTÃO ANEXADO (quando o aluno clica em "Tirar dúvida com IA") OU PERGUNTAS SUGERIDAS */}
      {activeContext ? (
        <div className="px-3.5 pb-2.5 animate-fade-in">
          <div className="rounded-2xl border border-[#2E5B37]/35 bg-[#E3F1E4]/70 p-3 shadow-xs">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5">
                <div className="flex h-5 w-5 items-center justify-center rounded-lg bg-[#2E5B37] text-white">
                  <Sparkles className="h-3 w-3" />
                </div>
                <span className="text-[11px] font-extrabold text-[#2E5B37] uppercase tracking-wider">
                  Contexto Anexado • Questão #{activeContext.number}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveContext?.(null)}
                title="Remover contexto da questão"
                className="flex h-5 w-5 items-center justify-center rounded-lg text-[#0F2942]/50 transition hover:bg-white/80 hover:text-[#0F2942] cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {activeContext.topic && (
              <p className="text-[10px] font-bold text-[#0F2942]/70 mb-1">
                Tópico: {activeContext.topic}
              </p>
            )}

            <p className="line-clamp-2 text-xs font-medium text-[#0F2942] leading-snug">
              {activeContext.statement}
            </p>

            <div className="mt-2.5 flex items-center justify-between border-t border-[#2E5B37]/20 pt-1.5 text-[10px] text-[#2E5B37] font-semibold">
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#76D69B] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#2E5B37]"></span>
                </span>
                Será enviado na sua próxima pergunta
              </span>
              <button
                type="button"
                onClick={() => setActiveContext?.(null)}
                className="text-[10px] font-bold text-[#0F2942]/50 hover:text-rose-600 transition cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : activeFlashcardContext ? (
        <div className="px-3.5 pb-2.5 animate-fade-in">
          <div className="rounded-2xl border border-amber-300/70 bg-amber-50/90 p-3 shadow-xs">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div className="flex h-5 w-5 items-center justify-center rounded-lg bg-amber-500 text-white"><Sparkles className="h-3 w-3" /></div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-800">Flashcard anexado</span>
              </div>
              <button type="button" onClick={() => setActiveFlashcardContext?.(null)} title="Remover flashcard anexado" className="flex h-5 w-5 items-center justify-center rounded-lg text-[#0F2942]/50 transition hover:bg-white/80 hover:text-[#0F2942] cursor-pointer"><X className="h-3.5 w-3.5" /></button>
            </div>
            {activeFlashcardContext.topic && <p className="mb-1 text-[10px] font-bold text-[#0F2942]/70">Tópico: {activeFlashcardContext.topic}</p>}
            <p className="line-clamp-2 text-xs font-medium leading-snug text-[#0F2942]">{activeFlashcardContext.front}</p>
            <div className="mt-2.5 flex items-center justify-between border-t border-amber-300/50 pt-1.5 text-[10px] font-semibold text-amber-800">
              <span className="flex items-center gap-1.5"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-amber-600" /></span>Será enviado na sua próxima pergunta</span>
              <button type="button" onClick={() => setActiveFlashcardContext?.(null)} className="cursor-pointer text-[10px] font-bold text-[#0F2942]/50 transition hover:text-rose-600">Cancelar</button>
            </div>
          </div>
        </div>
      ) : null}

      {chatError && (
        <div className="mx-3.5 mb-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          <div className="flex items-center justify-between gap-3">
            <span>{chatError}</span>
            {retryRequest && (
              <button
                type="button"
                onClick={() => void handleSendMessage(undefined, retryRequest)}
                disabled={isTyping}
                className="shrink-0 rounded-lg border border-amber-400 px-2 py-1 text-[10px] font-bold hover:bg-amber-100 disabled:opacity-50"
              >
                Tentar novamente
              </button>
            )}
          </div>
        </div>
      )}

      {/* INPUT DO CHAT NA PARTE DE BAIXO */}
      <div className="border-t border-[#0F2942]/10 bg-[#F5F1E8] p-3 shadow-xs">
        {/* Card do Arquivo Anexado se houver */}
        {attachedFile && (
          <div className="mb-2 flex items-center justify-between rounded-xl bg-white/95 border border-white/20 px-3 py-1.5 text-xs text-[#2E5B37]">
            <div className="flex items-center gap-1.5 truncate">
              <Paperclip className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate font-medium">{attachedFile}</span>
            </div>
            <button type="button" onClick={() => setAttachedFile(null)} className="text-[#0F2942]/40 hover:text-[#0F2942] cursor-pointer">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Caixa de Entrada Estilo AI Assistant */}
        <div className="flex flex-col rounded-2xl border border-white/20 bg-white p-2.5 shadow-md transition focus-within:ring-2 focus-within:ring-white/40 focus-within:border-white/40">
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onInput={(e) => {
              e.currentTarget.style.height = 'auto';
              e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 100)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              activeContext
                ? `Digite sua dúvida sobre a Questão #${activeContext.number}...`
                : activeFlashcardContext
                  ? 'Digite sua dúvida sobre este flashcard...'
                  : 'Digite sua dúvida ou peça um resumo...'
            }
            rows={1}
            spellCheck={false}
            disabled={isTyping}
            style={{ outline: 'none', border: 'none', boxShadow: 'none' }}
            className="w-full resize-none overflow-y-auto bg-transparent text-xs text-[#0F2942] placeholder-[#0F2942]/40 border-none outline-none ring-0 shadow-none focus:outline-none focus:border-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 min-h-[24px] max-h-[100px] p-0"
          />

          {/* Barra de Ações Inferior dentro do Input Box */}
          <div className="mt-1 flex items-center justify-between border-t border-[#0F2942]/08 pt-2">
            <div className="relative flex items-center gap-1.5">
              {/* Botão de Anexo "+" */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
                accept="image/*"
                aria-label="Selecionar imagem para anexar"
              />
              <button
                type="button"
                onClick={() => setIsAttachMenuOpen(!isAttachMenuOpen)}
                title="Anexar arquivo ou imagem"
                className={`flex h-7 w-7 items-center justify-center rounded-xl transition cursor-pointer ${
                  isAttachMenuOpen
                    ? 'bg-[#2E5B37] text-white'
                    : 'text-[#0F2942]/50 hover:bg-[#F8F5EE] hover:text-[#0F2942]'
                }`}
              >
                <Plus className={`h-4 w-4 transition-transform ${isAttachMenuOpen ? 'rotate-45' : ''}`} />
              </button>

              {/* Menu Popover de Seleção de Anexo */}
              {isAttachMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setIsAttachMenuOpen(false)}
                  />
                  <div className="absolute bottom-full left-0 mb-2 w-48 rounded-2xl border border-[#0F2942]/10 bg-white p-1.5 shadow-xl animate-fade-in z-30">
                    <p className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-[#0F2942]/45">
                      Anexar conteúdo
                    </p>

                    {/* Opção 1: Imagem (Desabilitada com Tag Em Breve) */}
                    <div className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-xs font-medium text-[#0F2942]/50 opacity-75">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#E3F1E4] text-[#2E5B37]">
                          <ImageIcon className="h-3.5 w-3.5" />
                        </div>
                        <span>Imagem</span>
                      </div>
                      <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-extrabold text-amber-800 border border-amber-200">
                        Em breve
                      </span>
                    </div>

                    {/* Opção 2: Documento (PDF) com Tag Em Breve */}
                    <div className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-xs font-medium text-[#0F2942]/50 opacity-75">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                          <FileText className="h-3.5 w-3.5" />
                        </div>
                        <span>Documento</span>
                      </div>
                      <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-extrabold text-amber-800 border border-amber-200">
                        Em breve
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Botão Enviar Mensagem */}
            <button
              type="button"
              onClick={() => handleSendMessage()}
              disabled={isTyping || (!inputMessage.trim() && !attachedFile && !activeContext && !activeFlashcardContext)}
              aria-label="Enviar mensagem"
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#2E5B37] text-white shadow-xs transition hover:bg-[#1B4332] disabled:opacity-40 disabled:hover:bg-[#2E5B37] cursor-pointer"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
