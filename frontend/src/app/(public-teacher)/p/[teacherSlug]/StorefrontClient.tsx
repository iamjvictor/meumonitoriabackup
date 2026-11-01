'use client';
import { OptimizedImage } from '@/shared';
/* eslint-disable react-hooks/set-state-in-effect, @typescript-eslint/no-explicit-any -- manter compatibilidade com o payload legado da vitrine. */

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { 
  Sparkles, 
  BookOpen, 
  ArrowRight,
  Trophy,
  CheckCircle2,
  Search,
  Share2,
  Star,
  X,
  Bot,
  HelpCircle,
  Brain,
  Target,
  User,
  LogOut,
  Loader2
} from 'lucide-react';
import FeaturesCards from "@/components/ui/feature-shader-cards";
import { useAlert } from '@/shared';
import { buildStudentAuthHeaders } from '@/shared/auth/session-headers';
import { AUTH_STATE_CHANGED_EVENT, revokeClientSession } from '@/shared/auth/client-session';

const StudentAuthModal = dynamic(
  () => import('@/modules/student/components/StudentAuthModal').then((module) => module.StudentAuthModal),
  { ssr: false, loading: () => null }
);

const InstagramIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

const YoutubeIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

const TikTokIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 003 15.68 6.34 6.34 0 009.68 22a6.34 6.34 0 006.33-6.33V9.28a8.16 8.16 0 004.75 1.51V7.34a4.85 4.85 0 01-1.17-.65z" />
  </svg>
);

const formatSocialUrl = (platform: 'instagram' | 'tiktok' | 'youtube', value: string) => {
  if (!value) return '#';
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  const clean = value.trim().replace(/^@/, '');
  if (platform === 'instagram') return `https://instagram.com/${clean}`;
  if (platform === 'tiktok') return `https://tiktok.com/@${clean}`;
  if (platform === 'youtube') return `https://youtube.com/${clean.startsWith('@') ? clean : `@${clean}`}`;
  return value;
};


type MonitorItem = {
  id: string;
  name: string;
  priceCents: number;
  annualPriceCents?: number | null;
  description: string | null;
  avatarUrl?: string | null;
  detailedDescription?: string | null;
  rating?: number;
  reviewsCount?: number;
  price?: string;
  originalPrice?: string;
  badge?: string;
  subjects?: Array<{
    id: string;
    name: string;
    topics?: Array<{
      id: string;
      name: string;
    }>;
  }>;
  _count?: {
    questions: number;
    flashcards: number;
  };
};

type TeacherPublicProfile = {
  fullName: string;
  username: string;
  area: string;
  customArea: string | null;
  bio: string | null;
  pageSlug: string;
  avatarUrl: string | null;
  bannerUrl?: string | null;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  status: string;
  monitors?: Array<{
    id: string;
    name: string;
    priceCents: number;
    annualPriceCents?: number | null;
    description: string | null;
    avatarUrl?: string | null;
    detailedDescription?: string | null;
    subjects?: Array<{
      id: string;
      name: string;
      topics?: Array<{
        id: string;
        name: string;
      }>;
    }>;
    _count?: {
      questions: number;
      flashcards: number;
    };
  }>;
};

function formatMonitorPrice(priceCents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(priceCents / 100);
}

function annualMonthlyEquivalentCents(annualPriceCents: number) {
  return Math.round(annualPriceCents / 12);
}

type StorefrontClientProps = {
  teacher: TeacherPublicProfile;
};

export default function StorefrontClient({ teacher }: StorefrontClientProps) {
  const router = useRouter();
  const { showAlert } = useAlert();
  const [activeTab, setActiveTab] = useState<'inicio' | 'monitores' | 'sobre'>('inicio');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<{ id: string; name: string; price: string; originalPrice?: string; avatarUrl?: string | null }[]>([]);
  const [, setIsCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<MonitorItem | null>(null);
  const [selectedInterval, setSelectedInterval] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const [selectedBillingType, setSelectedBillingType] = useState<'PIX' | 'CREDIT_CARD' | null>(null);

  const [isStudentAuthOpen, setIsStudentAuthOpen] = useState(false);
  const [isCheckoutAuthMode, setIsCheckoutAuthMode] = useState(false);
  const [isCheckoutStarting, setIsCheckoutStarting] = useState(false);

  const [studentUser, setStudentUser] = useState<{ email?: string; fullName?: string } | null>(null);
  const [isSessionValidated, setIsSessionValidated] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8443';
  const checkoutStarting = useRef(false);

  const studentAuthHeaders = () => {
    if (typeof window === 'undefined') return {};
    return buildStudentAuthHeaders(localStorage.getItem('mm_access_token'));
  };
  const storefrontStartedAt = useRef<number | null>(null);

  useEffect(() => {
    storefrontStartedAt.current = performance.now();
    console.info('[storefront] montagem iniciada', {
      event: 'storefront.frontend_mount_started',
      pageSlug: teacher.pageSlug,
    });

    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (navigation) {
      console.info('[storefront] timing da navegação', {
        event: 'storefront.frontend_navigation_timing',
        pageSlug: teacher.pageSlug,
        requestStartMs: Math.round(navigation.requestStart),
        responseEndMs: Math.round(navigation.responseEnd),
        domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd),
        loadEventEndMs: Math.round(navigation.loadEventEnd),
      });
    }

    const frameId = requestAnimationFrame(() => {
      console.info('[storefront] primeira pintura do componente', {
        event: 'storefront.frontend_first_frame',
        pageSlug: teacher.pageSlug,
        durationMs: Math.round(performance.now() - (storefrontStartedAt.current ?? performance.now())),
      });
    });

    return () => cancelAnimationFrame(frameId);
  }, [teacher.pageSlug]);

  const refreshStudentSession = () => {
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem('mm_user_info');
      const token = localStorage.getItem('mm_access_token');
      if (savedUser || token) {
        try {
          const parsed = savedUser ? JSON.parse(savedUser) : {};
          setStudentUser({
            fullName: parsed.fullName || parsed.name || 'Aluno',
            email: parsed.email || '',
          });
        } catch {
          setStudentUser({ fullName: 'Aluno' });
        }
      } else {
        setStudentUser(null);
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    const validateSession = async () => {
      const sessionStartedAt = performance.now();
      console.info('[storefront] validação de sessão iniciada', {
        event: 'storefront.frontend_session_started',
        pageSlug: teacher.pageSlug,
      });
      try {
        const response = await fetch(`${apiUrl}/api/v1/session`, {
          credentials: 'include',
          headers: studentAuthHeaders(),
          cache: 'no-store',
        });
        console.info('[storefront] validação de sessão respondida', {
          event: 'storefront.frontend_session_completed',
          pageSlug: teacher.pageSlug,
          statusCode: response.status,
          durationMs: Math.round(performance.now() - sessionStartedAt),
        });
        const body = await response.json().catch(() => ({})) as { data?: { email?: string; role?: string; fullName?: string } };
        const role = body.data?.role?.toLowerCase();
        const allowedRoles = ['student', 'aluno', 'teacher', 'professor', 'admin'];
        if (!response.ok || (role && !allowedRoles.includes(role))) {
          localStorage.removeItem('mm_user_info');
          localStorage.removeItem('mm_access_token');
          if (!cancelled) { setStudentUser(null); setIsSessionValidated(true); }
          return;
        }
        if (!cancelled) {
          const saved = localStorage.getItem('mm_user_info');
          const parsed = saved ? JSON.parse(saved) as { fullName?: string; name?: string; email?: string } : {};
          setStudentUser({
            fullName: parsed.fullName || parsed.name || body.data?.fullName || 'Usuário',
            email: parsed.email || body.data?.email || '',
          });
          setIsSessionValidated(true);
        }
      } catch {
        console.warn('[storefront] validação de sessão falhou', {
          event: 'storefront.frontend_session_failed',
          pageSlug: teacher.pageSlug,
          durationMs: Math.round(performance.now() - sessionStartedAt),
        });
        if (!cancelled) { setStudentUser(null); setIsSessionValidated(true); }
      }
    };
    void validateSession();
    window.addEventListener('storage', validateSession);
    window.addEventListener(AUTH_STATE_CHANGED_EVENT, validateSession);
    return () => {
      cancelled = true;
      window.removeEventListener('storage', validateSession);
      window.removeEventListener(AUTH_STATE_CHANGED_EVENT, validateSession);
    };
  }, [apiUrl, teacher.pageSlug]);

  useEffect(() => {
    if (!isSessionValidated) return;
    const frameId = requestAnimationFrame(() => {
      console.info('[storefront] página pronta para interação', {
        event: 'storefront.frontend_ready',
        pageSlug: teacher.pageSlug,
        durationMs: Math.round(performance.now() - (storefrontStartedAt.current ?? performance.now())),
      });
    });
    return () => cancelAnimationFrame(frameId);
  }, [isSessionValidated, teacher.pageSlug]);

  // Initialize cart from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('storefront_cart');
      if (saved) {
        try {
          setCart(JSON.parse(saved));
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, []);

  // Save cart to localStorage
  const saveCart = (newCart: typeof cart) => {
    const sanitizedCart = newCart.map(item => ({
      ...item,
      avatarUrl: item.avatarUrl && item.avatarUrl.length > 500 ? null : item.avatarUrl
    }));
    setCart(sanitizedCart);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('storefront_cart', JSON.stringify(sanitizedCart));
      } catch (err) {
        console.warn('Could not save storefront_cart:', err);
      }
    }
  };

  const startHostedCheckout = async () => {
    if (checkoutStarting.current || !selectedBillingType) return;
    const rawCart = localStorage.getItem('storefront_cart');
    if (!rawCart) return;
    checkoutStarting.current = true;
    const selectedIds = (JSON.parse(rawCart) as Array<{ id: string }>).map((item) => item.id).sort();
    const idempotencyStorageKey = `mm_payment_checkout_idempotency_key:v2:${selectedInterval}:${selectedBillingType}:${selectedIds.join(',')}`;
    const idempotencyKey = sessionStorage.getItem(idempotencyStorageKey) || crypto.randomUUID();
    sessionStorage.setItem(idempotencyStorageKey, idempotencyKey);
    const headers: HeadersInit = {
      ...studentAuthHeaders(),
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    };
    setIsCheckoutStarting(true);
    try {
      const checkoutResponse = await fetch(`${apiUrl}/api/v1/payments/checkout`, {
        method: 'POST', credentials: 'include', headers,
        body: JSON.stringify({ monitorId: selectedIds[0], interval: selectedInterval, billingType: selectedBillingType }),
      });
      const checkoutBody = await checkoutResponse.json() as { data?: { orderId?: string; checkoutUrl?: string | null }; error?: { message?: string }; message?: string };
      const created = checkoutBody.data;
      if (!checkoutResponse.ok || !created?.orderId || !created.checkoutUrl) throw new Error(formatCheckoutError(checkoutResponse.status, checkoutBody.error?.message || checkoutBody.message));
      router.push(created.checkoutUrl);
    } catch (error) {
      console.error('Falha ao iniciar checkout Asaas', error);
      showAlert({
        title: 'Erro no Checkout',
        message: error instanceof Error ? error.message : 'Não foi possível iniciar o checkout Asaas.',
        type: 'error',
        showSupport: true,
      });
    } finally {
      checkoutStarting.current = false;
      setIsCheckoutStarting(false);
    }
  };

  function formatCheckoutError(status: number, serverMessage?: string) {
    if (status === 401) return 'Sua sessão de aluno não está autenticada. Faça login para continuar.';
    if (status === 409) return serverMessage || 'Esta compra já está em andamento ou o monitor já possui assinatura.';
    if (status === 422) return serverMessage || 'Confira os dados da compra e tente novamente.';
    if (status >= 500) return 'O serviço de pagamentos está temporariamente indisponível. Tente novamente.';
    if (status === 0) return 'Não foi possível conectar ao servidor. Verifique se o backend está ativo.';
    return serverMessage || 'Não foi possível iniciar o checkout Asaas.';
  }

  const handleChoosePlan = (product: any, interval: 'MONTHLY' | 'ANNUAL' = 'MONTHLY') => {
    if (!selectedBillingType) return;
    setSelectedInterval(interval);
    const selectedItem = {
      id: product.id,
      name: product.name,
      price: product.price,
      originalPrice: product.originalPrice,
      avatarUrl: product.avatarUrl && product.avatarUrl.length > 500 ? null : product.avatarUrl
    };
    saveCart([selectedItem]);

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('storefront_teacher', JSON.stringify({
          fullName: teacher.fullName,
          username: teacher.username,
          area: teacher.customArea || teacher.area,
          avatarUrl: teacher.avatarUrl && teacher.avatarUrl.length > 500 ? null : teacher.avatarUrl,
          bio: teacher.bio,
          pageSlug: teacher.pageSlug
        }));
      } catch (err) {
        console.warn('Could not save storefront_teacher:', err);
      }
    }

    const isOnline = isSessionValidated && Boolean(studentUser);

    if (isOnline) {
      void startHostedCheckout();
    } else {
      setIsCheckoutAuthMode(true);
      setIsStudentAuthOpen(true);
    }
  };

  const openProduct = (product: MonitorItem) => {
    const hasAnnualPlan = Number.isInteger(product.annualPriceCents) && Number(product.annualPriceCents) > 0;
    setSelectedInterval(hasAnnualPlan ? 'ANNUAL' : 'MONTHLY');
    setSelectedBillingType(null);
    setSelectedProduct(product);
  };


  // Only real monitors with status === 'PUBLISHED'
  const realMonitors: MonitorItem[] = (teacher.monitors || [])
    .filter((m: any) => !m.status || m.status === 'PUBLISHED')
    .map((m, index) => ({
      ...m,
      rating: 4.9,
      reviewsCount: 42 + (index * 17),
      price: formatMonitorPrice(m.priceCents),
      originalPrice: formatMonitorPrice(Math.round(m.priceCents * 1.2)),
      badge: index === 0 ? 'Mais Vendido' : undefined
    }));

  const allProducts = realMonitors;

  const filteredProducts = allProducts.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `Página do Professor ${teacher.fullName}`,
        url: window.location.href,
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(window.location.href);
      showAlert({
        title: 'Link Copiado!',
        message: 'O link da página do professor foi copiado com sucesso para a sua área de transferência.',
        type: 'success',
        showSupport: false,
      });
    }
  };

  return (
    <div className="relative min-h-screen bg-[#F5F1E8] text-[#0F2942] font-sans pb-20">
      
      {/* 1. Discrete Top Navbar (Meu Monitoria) */}
      <header className="sticky top-0 z-50 w-full glass-panel border-b border-[#0f294208] px-4 md:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src="/logoSemfundo.png" alt="MeuMonitor AI" width={32} height={32} className="w-8 h-8 object-contain" />
          <span className="font-heading font-bold text-base tracking-tight text-[#0F2942]">
            MeuMonitor<span className="text-[#2E5B37] font-extrabold">AI</span>
          </span>
        </div>

        <div className="flex items-center gap-4">


        <div className="flex items-center gap-3">
          {isSessionValidated && studentUser ? (
            <>
              <button
                type="button"
                onClick={() => router.push('/areadoaluno')}
                className="text-xs font-bold bg-[#0F2942] text-white hover:bg-[#1E3A8A] px-4 py-2 rounded-xl transition shadow-sm whitespace-nowrap cursor-pointer flex items-center gap-2"
              >
                <BookOpen className="w-3.5 h-3.5 text-[#76D69B]" />
                <span>Entrar como Aluno</span>
              </button>

              <div className="relative">
                {/* User Avatar Button (Icon only) */}
                <button
                  type="button"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="w-9 h-9 rounded-full bg-[#0F2942] hover:bg-[#1E3A8A] text-white flex items-center justify-center shadow-md transition-all cursor-pointer border-2 border-white ring-2 ring-[#0F2942]/10"
                  title={studentUser.fullName || studentUser.email || 'Perfil'}
                >
                  <User className="w-4 h-4 text-white" />
                </button>

                {/* Expandable User Dropdown Menu */}
                {isUserMenuOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setIsUserMenuOpen(false)} 
                    />

                    <div className="absolute right-0 mt-2.5 w-60 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 z-50 animate-fadeIn">
                      <div className="px-3 py-2.5 bg-slate-50 rounded-xl border border-slate-100 mb-1.5">
                        <p className="text-xs font-extrabold text-[#0F2942] truncate">
                          {studentUser.fullName || 'Usuário'}
                        </p>
                        {studentUser.email && (
                          <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                            {studentUser.email}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          router.push('/areadoaluno');
                        }}
                        className="w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-[#0F2942] hover:bg-slate-100 transition text-left cursor-pointer"
                      >
                        <BookOpen className="w-4 h-4 text-[#0F2942]" />
                        <span>Área do Aluno</span>
                      </button>

                      <div className="my-1 border-t border-slate-100" />

                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          void revokeClientSession(apiUrl).finally(() => {
                            localStorage.removeItem('mm_teacher_profile');
                            localStorage.removeItem('mm_access_token');
                            localStorage.removeItem('mm_user_role');
                            localStorage.removeItem('mm_user_info');
                            setStudentUser(null);
                            setIsSessionValidated(true);
                          });
                        }}
                        className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition text-left cursor-pointer"
                      >
                        <LogOut className="w-4 h-4 text-rose-600" />
                        <span>Sair da Conta</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <button 
              type="button"
              onClick={() => {
                setIsCheckoutAuthMode(false);
                setIsStudentAuthOpen(true);
              }}
              className="text-xs font-bold bg-[#0F2942] text-white hover:bg-[#1E3A8A] px-4 py-2 rounded-xl transition shadow-sm whitespace-nowrap cursor-pointer"
            >
              Entrar como Aluno
            </button>
          )}
        </div>
        </div>
      </header>

      {/* Grid Pattern Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f294203_1px,transparent_1px),linear-gradient(to_bottom,#0f294203_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* 2. Main Storefront Header (Banner + Profile Details Unified) */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-6">
        {/* 3. Teacher Profile Header */}
        <div className="relative overflow-hidden rounded-3xl bg-[#0F2942] text-white shadow-lg border border-[#ffffff15]">
          
          {/* Top Banner (Capa) */}
          <div 
            className={`relative w-full h-44 md:h-60 border-b border-black/10 overflow-hidden bg-cover bg-center ${
              !teacher.bannerUrl ? 'bg-gradient-to-r from-[#0F2942] via-[#1E3A8A] to-[#0F2942]' : 'bg-[#0F2942]'
            }`}
          >
            {teacher.bannerUrl ? (
              <OptimizedImage
                src={teacher.bannerUrl}
                alt={`Capa de ${teacher.fullName}`}
                className="w-full h-full object-cover object-center"
              />
            ) : null}
            {/* Capa real limpa, sem desfoque e sem escurecimento artificial */}
          </div>

          {/* Bottom Profile Details with Overlapping Avatar */}
          <div className="relative px-6 md:px-12 pb-6 pt-16 md:pt-6 flex flex-col md:flex-row md:items-start justify-between gap-5">
            
            {/* Overlapping Avatar Container */}
            <div className="absolute -top-12 md:-top-16 left-6 md:left-12">
              <div className="relative w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-[#0F2942] shadow-xl overflow-hidden shrink-0 bg-[#0F2942]">
                {teacher.avatarUrl ? (
                  <OptimizedImage
                    src={teacher.avatarUrl}
                    alt={`Foto de ${teacher.fullName}`}
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  <div className="w-full h-full bg-[#0F2942] flex items-center justify-center text-white text-3xl font-bold">
                    {teacher.fullName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            </div>

            {/* Profile Text Details */}
            <div className="flex-1 pl-0 md:pl-36">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl md:text-2xl font-extrabold text-white tracking-tight">{teacher.fullName}</h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-400/20 text-sky-200 border border-sky-400/30 backdrop-blur-md">
                  <CheckCircle2 className="w-3 h-3 text-sky-300" />
                  Verificado
                </span>
              </div>
              <p className="text-xs text-sky-300 font-bold mt-0.5">{teacher.customArea || teacher.area}</p>
              
              {/* Sobre o Professor (Bio) */}
              {teacher.bio && (
                <p className="text-xs md:text-sm text-white/80 mt-2 font-medium leading-relaxed max-w-2xl whitespace-pre-line">
                  {teacher.bio}
                </p>
              )}
              
              {/* Followers count and visual stats */}
              <div className="flex items-center gap-3 mt-3.5 text-xs text-white/70">
                <span><strong className="text-white">1.4k</strong> Alunos</span>
                <span className="w-1 h-1 rounded-full bg-white/40"></span>
                <span><strong className="text-white">{allProducts.length}</strong> Monitores</span>
              </div>
            </div>

            {/* Social Media & Share Action Buttons */}
            <div className="flex items-center gap-2 absolute top-4 right-6 md:static md:self-start shrink-0 md:mt-0 z-10">
              {teacher.instagram && (
                <a
                  href={formatSocialUrl('instagram', teacher.instagram)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 rounded-full md:rounded-xl border border-white/20 bg-white/10 text-white transition hover:bg-white/20 hover:scale-105 cursor-pointer"
                  title="Instagram"
                >
                  <InstagramIcon className="w-4 h-4" />
                </a>
              )}
              {teacher.tiktok && (
                <a
                  href={formatSocialUrl('tiktok', teacher.tiktok)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 rounded-full md:rounded-xl border border-white/20 bg-white/10 text-white transition hover:bg-white/20 hover:scale-105 cursor-pointer"
                  title="TikTok"
                >
                  <TikTokIcon className="w-4 h-4" />
                </a>
              )}
              {teacher.youtube && (
                <a
                  href={formatSocialUrl('youtube', teacher.youtube)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 rounded-full md:rounded-xl border border-white/20 bg-white/10 text-white transition hover:bg-white/20 hover:scale-105 cursor-pointer"
                  title="YouTube"
                >
                  <YoutubeIcon className="w-4 h-4" />
                </a>
              )}
              <button 
                onClick={handleShare}
                className="p-2.5 rounded-full md:rounded-xl border border-white/20 bg-white/10 text-white transition hover:bg-white/20 hover:scale-105 cursor-pointer"
                title="Compartilhar página"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>

          </div>

        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-8 mt-8">

        {/* Student Benefits Highlights Header & Shader Cards */}
        <div className="mb-6">
          <FeaturesCards
            title="Um monitor de estudos que tira suas dúvidas e indica o que estudar com base no seu desempenho."
            subtitle={`Com o Monitor do Professor ${teacher.fullName}, você tira dúvidas, pratica o conteúdo e sabe o que revisar para evoluir.`}
            features={[
              {
                title: "Travou? Pergunte e entenda agora",
                description: "Pergunte sobre uma questão ou conteúdo e receba uma explicação clara, passo a passo, para continuar estudando sem esperar a próxima aula.",
                icon: <Bot className="w-4 h-4 text-emerald-300" />,
                badge: "ENTENDA SEM ESPERAR",
              },
              {
                title: "Saiba exatamente o que estudar",
                description: "O Monitor acompanha seu desempenho, identifica os assuntos que precisam de reforço e recomenda seu próximo treino.",
                icon: <Target className="w-4 h-4 text-emerald-300" />,
                badge: "FOCO NO QUE VOCÊ PRECISA",
              },
              {
                title: "Pratique o conteúdo que você está aprendendo",
                description: `Resolva questões e desafios preparados a partir dos conteúdos do Professor ${teacher.fullName} e veja onde você precisa melhorar.`,
                icon: <Trophy className="w-4 h-4 text-emerald-300" />,
                badge: "CHEGUE MAIS PREPARADO",
              },
              {
                title: "Revise mesmo quando tiver pouco tempo",
                description: "Use flashcards e revisões rápidas para retomar os pontos importantes no intervalo, no caminho ou antes da prova.",
                icon: <Sparkles className="w-4 h-4 text-emerald-300" />,
                badge: "FIXAÇÃO RÁPIDA",
              },
            ]}
          />
        </div>

        {/* 4. Storefront Tabs */}
        <div className="flex border-b border-[#0f294210] mt-6 gap-6 overflow-x-auto scrollbar-none">
          <button 
            onClick={() => setActiveTab('inicio')}
            className={`pb-3 text-sm font-bold border-b-2 transition shrink-0 ${
              activeTab === 'inicio' 
                ? 'border-[#0F2942] text-[#0F2942]' 
                : 'border-transparent text-[#0f294260] hover:text-[#0F2942]'
            }`}
          >
            PÁGINA INICIAL
          </button>
          <button 
            onClick={() => setActiveTab('monitores')}
            className={`pb-3 text-sm font-bold border-b-2 transition shrink-0 ${
              activeTab === 'monitores' 
                ? 'border-[#0F2942] text-[#0F2942]' 
                : 'border-transparent text-[#0f294260] hover:text-[#0F2942]'
            }`}
          >
            TODOS OS MONITORES ({allProducts.length})
          </button>
          <button 
            onClick={() => setActiveTab('sobre')}
            className={`pb-3 text-sm font-bold border-b-2 transition shrink-0 ${
              activeTab === 'sobre' 
                ? 'border-[#0F2942] text-[#0F2942]' 
                : 'border-transparent text-[#0f294260] hover:text-[#0F2942]'
            }`}
          >
            SOBRE O PROFESSOR
          </button>
        </div>

        {/* 5. Search Bar for mobile */}
        <div className="mt-6 md:hidden">
          <div className="flex items-center gap-2 bg-white border border-[#0f294215] rounded-xl px-3 py-2.5">
            <Search className="w-4 h-4 text-[#0f294250]" />
            <input 
              type="text" 
              placeholder="Buscar monitores..."
              className="w-full bg-transparent text-sm focus:outline-none text-[#0F2942]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* 6. Tabs Content rendering */}
        
        {activeTab === 'inicio' && (
          <div className="mt-8 flex flex-col gap-10">
            {/* Shelf Title */}
            <div>
              <h3 className="text-xl font-bold tracking-tight text-[#0F2942] flex items-center gap-2">
                Você também pode gostar
              </h3>
              <p className="text-xs text-[#0f294260] mt-1">Recomendações com base nas disciplinas do professor</p>
            </div>

            {/* Amazon-style Products Grid */}
            {filteredProducts.length > 0 ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filteredProducts.map((product) => (
                  <div 
                    key={product.id}
                    onClick={() => openProduct(product)}
                    className="transform hover:-translate-y-2 hover:shadow-xl bg-white rounded-2xl border border-[#0f294208] shadow-sm transition-all duration-300 overflow-hidden flex flex-col justify-between cursor-pointer group"
                  >
                    {/* Product Visual Container */}
                    <div className="p-4 bg-[#0f294202] border-b border-[#0f294205] h-44 relative flex items-center justify-center overflow-hidden">
                      {/* Hover Overlay */}
                      <div className="absolute inset-0 bg-[#0f2942]/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center z-20">
                        <span className="bg-white/95 text-[#0F2942] text-xs font-bold px-3 py-1.5 rounded-full shadow-md transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300 flex items-center gap-1.5">
                          <Search className="w-3.5 h-3.5" />
                          Ver Detalhes
                        </span>
                      </div>

                      {/* Badge */}
                      {product.badge && (
                        <span className="absolute top-3 left-3 bg-[#e47911] text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm z-10">
                          {product.badge}
                        </span>
                      )}

                      <span className="absolute top-3 right-3 bg-[#0F2942] text-white text-[9px] font-bold px-2 py-0.5 rounded-full z-10">
                        Material IA
                      </span>

                      {/* Book / AI Visual Graphic or Avatar */}
                      {product.avatarUrl || teacher.avatarUrl ? (
                        <OptimizedImage src={product.avatarUrl || teacher.avatarUrl!} alt={product.name} className="absolute inset-0 w-full h-full object-cover" />
                      ) : (
                        <div className="relative w-20 h-20 rounded-xl bg-white border border-[#0f29420a] shadow-sm flex items-center justify-center">
                          <BookOpen className="w-10 h-10 text-[#0F2942]" />
                          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#0F2942] flex items-center justify-center text-white border-2 border-white">
                            <Sparkles className="w-3 h-3 animate-pulse" />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Product Details Section */}
                    <div className="p-5 flex-1 flex flex-col justify-between">
                      <div>
                      <div className="flex justify-start items-start gap-2.5">
                        {teacher.avatarUrl ? (
                          <OptimizedImage
                            src={teacher.avatarUrl}
                            alt={teacher.fullName}
                            className="flex-shrink-0 w-8 h-8 rounded-full object-cover border border-[#0f294215] mt-0.5 shadow-xs"
                            title={`Professor ${teacher.fullName}`}
                          />
                        ) : (
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#0f294208] flex items-center justify-center text-[#0F2942] mt-0.5 border border-[#0f294208]" title="Assistente Virtual de IA">
                            <Bot className="w-4 h-4" />
                          </div>
                        )}
                        <div className="flex-1">
                          {/* Rating (Stars) */}
                          <div className="flex items-center gap-1 mb-1.5">
                            <div className="flex items-center text-[#ff9900]">
                              <Star className="w-3.5 h-3.5 fill-current" />
                              <Star className="w-3.5 h-3.5 fill-current" />
                              <Star className="w-3.5 h-3.5 fill-current" />
                              <Star className="w-3.5 h-3.5 fill-current" />
                              <Star className="w-3.5 h-3.5 fill-current" />
                            </div>
                            <span className="text-[11px] font-semibold text-[#007185] hover:text-[#c45500] cursor-pointer">
                              {product.reviewsCount} avaliações
                            </span>
                          </div>

                          {/* Title */}
                          <h4 className="text-sm font-bold text-[#0F2942] hover:text-[#c45500] cursor-pointer line-clamp-2 min-h-[40px] leading-tight">
                            {product.name}
                          </h4>
                        </div>
                      </div>

                        {/* Description */}
                        <p className="mt-2 text-xs text-[#0f294270] line-clamp-3 leading-relaxed">
                          {product.description}
                        </p>
                      </div>

                      {/* Pricing and Button */}
                      <div className="mt-5 border-t border-[#0f294208] pt-4">
                        {/* Price Block */}
                        <div className="mb-4">
                          {product.originalPrice && !(product.annualPriceCents != null && product.annualPriceCents > 0) && (
                            <div className="text-[11px] text-[#565959] line-through leading-none">
                              De: {product.originalPrice}
                            </div>
                          )}
                          {product.annualPriceCents != null && product.annualPriceCents > 0 ? (
                            <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-800">Plano anual</span>
                                <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-[9px] font-extrabold text-white">20% OFF</span>
                              </div>
                              <div className="mt-0.5 flex items-baseline gap-1">
                                <span className="text-xl font-extrabold text-[#B12704]">{formatMonitorPrice(annualMonthlyEquivalentCents(product.annualPriceCents))}</span>
                                <span className="text-[11px] font-medium text-[#565959]">/mês equivalente</span>
                              </div>
                              <span className="block text-[10px] text-[#565959]">No mensal: {product.price}/mês</span>
                              <span className="block text-[10px] font-semibold text-[#565959]">12x de {formatMonitorPrice(annualMonthlyEquivalentCents(product.annualPriceCents))} no cartão</span>
                              <span className="block text-[10px] text-[#565959]">ou {formatMonitorPrice(product.annualPriceCents)} à vista</span>
                            </div>
                          ) : (
                            <div className="flex items-baseline gap-1 mt-0.5">
                              <span className="text-[12px] font-semibold text-[#565959]">Por:</span>
                              <span className="text-xl font-extrabold text-[#B12704]">{product.price}</span>
                              <span className="text-[11px] font-medium text-[#565959]">/mês</span>
                            </div>
                          )}
                          <span className="text-[11px] text-[#007600] font-bold block mt-1">
                            Disponível para início imediato
                          </span>
                        </div>

                        {/* Yellow Amazon-style Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openProduct(product);
                          }}
                          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#F0C14B] hover:bg-[#E2B23C] border border-[#a88734] px-4 py-2.5 text-xs font-bold text-[#111111] transition duration-150 shadow-sm cursor-pointer relative z-10"
                        >
                          <ArrowRight className="w-3.5 h-3.5 text-[#111111]" />
                          <span>Escolher esse plano</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-[#0f294208] p-12 text-center shadow-sm">
                <p className="text-sm text-[#0f294250] font-bold">Nenhum monitor publicado no momento.</p>
              </div>
            )}


          </div>
        )}

        {activeTab === 'monitores' && (
          <div className="mt-8">
            <div className="mb-6">
              <h3 className="text-xl font-bold tracking-tight text-[#0F2942]">
                Monitores Virtuais ({filteredProducts.length})
              </h3>
              <p className="text-xs text-[#0f294260] mt-1">Todos os assistentes de IA disponíveis para este professor</p>
            </div>

            {filteredProducts.length > 0 ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filteredProducts.map((product) => (
                  <div 
                    key={product.id}
                    onClick={() => openProduct(product)}
                    className="transform hover:-translate-y-2 hover:shadow-xl bg-white rounded-2xl border border-[#0f294208] shadow-sm transition-all duration-300 overflow-hidden flex flex-col justify-between cursor-pointer group"
                  >
                    <div className="p-4 bg-[#0f294202] border-b border-[#0f294205] h-40 relative flex items-center justify-center overflow-hidden">
                      {/* Hover Overlay */}
                      <div className="absolute inset-0 bg-[#0f2942]/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center z-20">
                        <span className="bg-white/95 text-[#0F2942] text-xs font-bold px-3 py-1.5 rounded-full shadow-md transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300 flex items-center gap-1.5">
                          <Search className="w-3.5 h-3.5" />
                          Ver Detalhes
                        </span>
                      </div>

                      {product.avatarUrl ? (
                        <OptimizedImage src={product.avatarUrl} alt={product.name} className="absolute inset-0 w-full h-full object-cover" />
                      ) : (
                        <div className="relative w-16 h-16 rounded-xl bg-white border border-[#0f29420a] shadow-sm flex items-center justify-center">
                          <BookOpen className="w-8 h-8 text-[#0F2942]" />
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#0F2942] flex items-center justify-center text-white">
                            <Sparkles className="w-2.5 h-2.5 animate-pulse" />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="p-5 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-start items-start gap-2.5">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#0f294208] flex items-center justify-center text-[#0F2942] mt-0.5 border border-[#0f294208]" title="Assistente Virtual de IA">
                            <Bot className="w-4 h-4" />
                          </div>
                          <div className="flex-1">
                            {/* Rating (Stars) */}
                            <div className="flex items-center gap-1 mb-1.5">
                              <div className="flex items-center text-[#ff9900]">
                                <Star className="w-3.5 h-3.5 fill-current" />
                                <Star className="w-3.5 h-3.5 fill-current" />
                                <Star className="w-3.5 h-3.5 fill-current" />
                                <Star className="w-3.5 h-3.5 fill-current" />
                                <Star className="w-3.5 h-3.5 fill-current" />
                              </div>
                              <span className="text-[11px] font-semibold text-[#007185] hover:text-[#c45500] cursor-pointer">
                                {product.reviewsCount} avaliações
                              </span>
                            </div>

                            <h4 className="text-sm font-bold text-[#0F2942] line-clamp-2 min-h-[40px] leading-tight">
                              {product.name}
                            </h4>
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-[#0f294270] line-clamp-3 leading-relaxed">
                          {product.description}
                        </p>
                      </div>

                      <div className="mt-5 border-t border-[#0f294208] pt-4">
                        <div className="mb-4">
                          {product.annualPriceCents == null || product.annualPriceCents <= 0 ? (
                            <div className="text-[11px] text-[#565959] line-through leading-none">
                              De: {product.originalPrice}
                            </div>
                          ) : null}
                          {product.annualPriceCents != null && product.annualPriceCents > 0 ? (
                            <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-800">Plano anual</span>
                                <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-[9px] font-extrabold text-white">20% OFF</span>
                              </div>
                              <div className="mt-0.5 flex items-baseline gap-1">
                                <span className="text-xl font-extrabold text-[#B12704]">{formatMonitorPrice(annualMonthlyEquivalentCents(product.annualPriceCents))}</span>
                                <span className="text-[11px] font-medium text-[#565959]">/mês equivalente</span>
                              </div>
                              <span className="block text-[10px] text-[#565959]">No mensal: {product.price}/mês</span>
                              <span className="block text-[10px] font-semibold text-[#565959]">12x de {formatMonitorPrice(annualMonthlyEquivalentCents(product.annualPriceCents))} no cartão</span>
                              <span className="block text-[10px] text-[#565959]">ou {formatMonitorPrice(product.annualPriceCents)} à vista</span>
                            </div>
                          ) : (
                            <div className="flex items-baseline gap-1 mt-0.5">
                              <span className="text-xl font-extrabold text-[#B12704]">{product.price}</span>
                              <span className="text-[11px] font-medium text-[#565959]">/mês</span>
                            </div>
                          )}
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openProduct(product);
                          }}
                          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#F0C14B] hover:bg-[#E2B23C] border border-[#a88734] px-4 py-2.5 text-xs font-bold text-[#111111] transition duration-150 shadow-sm cursor-pointer relative z-10"
                        >
                          <ArrowRight className="w-3.5 h-3.5 text-[#111111]" />
                          <span>Escolher esse plano</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-[#0f294208] p-12 text-center shadow-sm">
                <p className="text-sm text-[#0f294250] font-bold">Nenhum monitor encontrado para a pesquisa.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'sobre' && (
          <div className="mt-8 max-w-3xl">
            <div className="bg-white rounded-2xl border border-[#0f29420a] p-8 shadow-sm flex flex-col gap-6">
              <div>
                <h3 className="text-lg font-bold text-[#0F2942]">Sobre {teacher.fullName}</h3>
                <p className="text-xs text-[#0f294250] mt-0.5">Professor cadastrado e certificado pelo MeuMonitor AI</p>
              </div>

              {teacher.bio ? (
                <p className="text-sm text-[#0f2942b0] leading-relaxed whitespace-pre-line">
                  {teacher.bio}
                </p>
              ) : (
                <p className="text-sm text-[#0f294250] italic">Nenhuma biografia fornecida.</p>
              )}

              <div className="border-t border-[#0f294208] pt-6 flex flex-col gap-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#0f294260]">Informações de Contato</h4>
                <div className="grid gap-4 sm:grid-cols-2 text-xs text-[#0f2942b0]">
                  <div>
                    <span className="font-bold text-[#0F2942]">Área de Atuação:</span> {teacher.area}
                  </div>
                  {teacher.instagram && (
                    <div>
                      <span className="font-bold text-[#0F2942]">Instagram:</span> {teacher.instagram}
                    </div>
                  )}
                  {teacher.youtube && (
                    <div>
                      <span className="font-bold text-[#0F2942]">YouTube:</span> {teacher.youtube}
                    </div>
                  )}
                  {teacher.tiktok && (
                    <div>
                      <span className="font-bold text-[#0F2942]">TikTok:</span> {teacher.tiktok}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </main>



      {/* 9. Product Details Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          {/* Backdrop blur overlay */}
          <div 
            className="fixed inset-0 bg-[#0f294240] backdrop-blur-sm transition-opacity cursor-pointer"
            onClick={() => setSelectedProduct(null)}
          />

          <div className="flex min-h-screen items-center justify-center p-4 text-center">
            <div className="relative transform overflow-hidden rounded-3xl bg-[#F5F1E8] p-6 text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-2xl border border-[#0f29420a]">
              
              {/* Close Button */}
              <button 
                onClick={() => setSelectedProduct(null)}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-[#0f294240] hover:text-[#0F2942] hover:bg-[#0f294208] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Graphic Icon or Avatar */}
              <div className="flex items-center gap-4 mb-5">
                {selectedProduct.avatarUrl ? (
                  <div className="w-14 h-14 rounded-2xl overflow-hidden border border-[#0f29420a] shadow-sm shrink-0">
                    <OptimizedImage src={selectedProduct.avatarUrl} alt={selectedProduct.name} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-[#0F2942] flex items-center justify-center text-white shrink-0">
                    <BookOpen className="w-7 h-7" />
                  </div>
                )}
                <div>
                  <span className="text-[10px] bg-[#0F2942] text-white font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Assistente de Estudos IA
                  </span>
                  <h3 className="text-base font-extrabold text-[#0F2942] mt-0.5">
                    {selectedProduct.name}
                  </h3>
                </div>
              </div>

              {/* Content Box */}
              <div className="space-y-6 mb-6">
                <div>
                  <h4 className="text-xs font-bold text-[#0f294260] uppercase tracking-wider">Sobre este Monitor</h4>
                  <p className="text-sm text-[#0f2942b0] mt-1.5 leading-relaxed whitespace-pre-wrap">
                    {selectedProduct.detailedDescription || selectedProduct.description || "Este monitor virtual utiliza inteligência artificial avançada baseada nas aulas e materiais do professor para te auxiliar 24 horas por dia, 7 dias por semana."}
                  </p>
                </div>

                {/* Stats / Numbers available */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white border border-[#0f294208] shadow-sm rounded-2xl p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#0F2942]/5 flex items-center justify-center text-[#0F2942] shrink-0">
                      <HelpCircle className="w-5 h-5 text-[#0F2942]/70" />
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold text-[#0f294260] uppercase tracking-wider">Questões</span>
                      <span className="block text-xs font-black text-[#0F2942]">
                        {selectedProduct._count?.questions ?? 0} disponíveis
                      </span>
                    </div>
                  </div>

                  <div className="bg-white border border-[#0f294208] shadow-sm rounded-2xl p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#0F2942]/5 flex items-center justify-center text-[#0F2942] shrink-0">
                      <Brain className="w-5 h-5 text-[#0F2942]/70" />
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold text-[#0f294260] uppercase tracking-wider">Flashcards</span>
                      <span className="block text-xs font-black text-[#0F2942]">
                        {selectedProduct._count?.flashcards ?? 0} disponíveis
                      </span>
                    </div>
                  </div>
                </div>

                {/* Benefícios do Aluno */}
                <div>
                  <h4 className="text-xs font-bold text-[#0f294260] uppercase tracking-wider mb-3">Benefícios da Plataforma para o Aluno</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-white border border-emerald-500/10 hover:border-emerald-500/20 shadow-sm transition duration-200">
                      <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-700 mt-0.5 shrink-0">
                        <Trophy className="w-4 h-4" />
                      </div>
                      <div>
                        <h5 className="text-xs font-bold text-[#0F2942]">Desafio Diário</h5>
                        <p className="text-[10px] text-[#0f294280] mt-0.5 leading-relaxed">Questões diárias selecionadas para manter o ritmo e a consistência nos estudos.</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-white border border-blue-500/10 hover:border-blue-500/20 shadow-sm transition duration-200">
                      <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-700 mt-0.5 shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h5 className="text-xs font-bold text-[#0F2942]">Simulado Personalizado Semanal</h5>
                        <p className="text-[10px] text-[#0f294280] mt-0.5 leading-relaxed">Testes semanais automáticos baseados nos seus pontos fracos e evolução.</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-white border border-purple-500/10 hover:border-purple-500/20 shadow-sm transition duration-200">
                      <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-700 mt-0.5 shrink-0">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div>
                        <h5 className="text-xs font-bold text-[#0F2942]">Monitor de IA para Dúvidas</h5>
                        <p className="text-[10px] text-[#0f294280] mt-0.5 leading-relaxed">Tire dúvidas sobre matérias e resoluções instantaneamente, 24 horas por dia.</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-white border border-amber-500/10 hover:border-amber-500/20 shadow-sm transition duration-200">
                      <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-700 mt-0.5 shrink-0">
                        <Brain className="w-4 h-4" />
                      </div>
                      <div>
                        <h5 className="text-xs font-bold text-[#0F2942]">Banco de Questões & Flashcards</h5>
                        <p className="text-[10px] text-[#0f294280] mt-0.5 leading-relaxed">Acesso a milhares de questões de provas e flashcards inteligentes para fixação.</p>
                      </div>
                    </div>
                  </div>
                </div>

                {selectedProduct.subjects && selectedProduct.subjects.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-[#0f294260] uppercase tracking-wider mb-2.5">Matérias e Tópicos</h4>
                    <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                      {selectedProduct.subjects.map((subj) => (
                        <div key={subj.id} className="bg-white border border-[#0f294208] shadow-sm rounded-2xl p-4">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-[#0F2942]">
                            <BookOpen className="w-3.5 h-3.5 text-[#0F2942]/60" />
                            <span>{subj.name}</span>
                          </div>
                          {subj.topics && subj.topics.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1.5 pl-5">
                              {subj.topics.map((topic) => (
                                <span key={topic.id} className="inline-flex items-center rounded-md bg-[#0F2942]/5 px-2 py-1 text-[10px] font-medium text-[#0F2942]/80 border border-[#0F2942]/10">
                                  {topic.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[10px] text-[#0f294250] mt-1 pl-5 italic">Nenhum tópico cadastrado.</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-[#0f294208] pt-4">
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center text-[#ff9900]">
                      <Star className="w-3.5 h-3.5 fill-current" />
                      <Star className="w-3.5 h-3.5 fill-current" />
                      <Star className="w-3.5 h-3.5 fill-current" />
                      <Star className="w-3.5 h-3.5 fill-current" />
                      <Star className="w-3.5 h-3.5 fill-current" />
                    </div>
                    <span className="text-[11px] font-semibold text-[#007185]">
                      ({selectedProduct.reviewsCount}) avaliações
                    </span>
                  </div>

                  <span className="text-[11px] text-[#007600] font-bold">
                    Início imediato
                  </span>
                </div>
              </div>

              {/* Pricing section & Checkout CTA */}
              <div className="flex flex-col gap-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => { if (selectedInterval !== 'MONTHLY') setSelectedBillingType(null); setSelectedInterval('MONTHLY'); }} aria-pressed={selectedInterval === 'MONTHLY'} className={`rounded-xl border p-3 text-left ${selectedInterval === 'MONTHLY' ? 'border-emerald-700 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                    <span className="block text-xs font-bold text-[#0F2942]">Mensal</span>
                    <span className="mt-1 block text-lg font-black text-[#B12704]">{selectedProduct.price}<span className="text-xs font-medium text-[#565959]">/mês</span></span>
                  </button>
                  {selectedProduct.annualPriceCents != null && selectedProduct.annualPriceCents > 0 && <button type="button" onClick={() => { if (selectedInterval !== 'ANNUAL') setSelectedBillingType(null); setSelectedInterval('ANNUAL'); }} aria-pressed={selectedInterval === 'ANNUAL'} className={`rounded-xl border p-3 text-left ${selectedInterval === 'ANNUAL' ? 'border-emerald-700 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                    <span className="flex items-center justify-between gap-2 text-xs font-bold text-[#0F2942]">Anual · 12 meses <span className="flex items-center gap-1.5"><span className="rounded-full bg-emerald-700 px-2 py-0.5 text-[9px] font-extrabold text-white">20% OFF</span><span className="rounded-full bg-[#0F2942] px-2 py-0.5 text-[9px] font-extrabold text-white">Recomendado</span></span></span>
                    <span className="mt-1 block text-lg font-black text-[#B12704]">{formatMonitorPrice(annualMonthlyEquivalentCents(selectedProduct.annualPriceCents))}<span className="ml-1 text-xs font-semibold text-[#565959]">/mês equivalente</span></span>
                    <span className="block text-[10px] font-semibold text-[#565959]">12x de {formatMonitorPrice(annualMonthlyEquivalentCents(selectedProduct.annualPriceCents))} no cartão</span>
                    <span className="block text-[10px] text-[#565959]">ou {formatMonitorPrice(selectedProduct.annualPriceCents)} à vista</span>
                  </button>}
                </div>
                <fieldset className="min-w-0 border-0 p-0">
                  <legend className="text-xs font-bold text-[#0F2942]">Forma de pagamento</legend>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(selectedInterval === 'MONTHLY'
                    ? [
                      { value: 'CREDIT_CARD' as const, title: 'Cartão de crédito', detail: 'Cobrança recorrente mensal' },
                      { value: 'PIX' as const, title: 'Pix', detail: 'Pagamento único por 1 mês; renovação manual' },
                    ]
                    : [
                      { value: 'PIX' as const, title: 'Pix', detail: 'Pagamento à vista por 12 meses' },
                      { value: 'CREDIT_CARD' as const, title: 'Cartão de crédito', detail: 'À vista ou em até 12 parcelas' },
                    ]
                    ).map((option) => {
                    const checked = selectedBillingType === option.value;
                    return (
                      <label key={`${selectedInterval}-${option.value}`} className={`flex h-full min-w-0 cursor-pointer items-start gap-2 rounded-xl border p-2 transition-colors ${checked ? 'border-emerald-700 bg-emerald-50' : 'border-slate-200 bg-white hover:border-emerald-400'}`}>
                        <input
                          type="radio"
                          name="storefront-payment-method"
                          value={option.value}
                          checked={checked}
                          onChange={() => setSelectedBillingType(option.value)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-700"
                        />
                        <span className="flex min-w-0 flex-col">
                          <span className="break-words text-xs font-bold text-[#0F2942]">{option.title}</span>
                          <span className="mt-0.5 break-words text-[10px] leading-relaxed text-slate-500">{option.detail}</span>
                        </span>
                      </label>
                    );
                    })}
                  </div>
                </fieldset>
                <button
                  type="button"
                  disabled={!selectedBillingType || isCheckoutStarting}
                  onClick={() => {
                    if (!selectedBillingType) return;
                    handleChoosePlan(selectedProduct, selectedInterval);
                    setSelectedProduct(null);
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-emerald-600/30 transition duration-150 enabled:cursor-pointer enabled:hover:bg-emerald-700 enabled:active:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                >
                  <CheckCircle2 className="w-4.5 h-4.5 text-white" />
                  <span>{selectedInterval === 'ANNUAL' ? 'Comprar 12 meses' : 'Assinar Agora'}</span>
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
      {isCheckoutStarting && (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="status" aria-live="polite" aria-label="Abrindo checkout">
          <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl border border-white/20 bg-white px-8 py-7 text-center shadow-2xl">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" />
            </div>
            <div>
              <p className="text-base font-extrabold text-[#0F2942]">Abrindo checkout seguro...</p>
              <p className="mt-1 text-sm text-slate-500">Estamos preparando seu pagamento. Você será redirecionado em instantes.</p>
            </div>
          </div>
        </div>
      )}
      {/* Student Authentication / Checkout Modal */}
      <StudentAuthModal
        isOpen={isStudentAuthOpen}
        onClose={() => setIsStudentAuthOpen(false)}
        checkoutMode={isCheckoutAuthMode}
        cartItems={cart}
        teacherName={teacher.fullName}
        onSuccess={(userData) => {
          console.log('Aluno autenticado com sucesso:', userData);
          refreshStudentSession();
          if (isCheckoutAuthMode) {
            setIsCartOpen(false);
            void startHostedCheckout();
          }
        }}
      />
    </div>
  );
}
