import type { EmailPayload } from '../outbox-crypto.js';

export type SponsoredSeatInviteEmailInput = {
  from: string;
  recipient: string;
  teacherName: string;
  monitorName: string;
  interval: string;
  startsAt: Date;
  endsAt: Date;
  invitationUrl: string;
  existingAccount: boolean;
};

export type SponsoredTeacherNoticeKind = 'PAID' | 'DECLINED' | 'OVERDUE' | 'CHECKOUT_CANCELED' | 'CHECKOUT_EXPIRED' | 'CANCELED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'CHARGEBACK';

export type SponsoredTeacherNoticeInput = {
  from: string;
  recipient: string;
  teacherName: string;
  monitorName: string;
  interval: string;
  kind: SponsoredTeacherNoticeKind;
  seatCount: number;
  occurredAt: Date;
};

export function buildSponsoredSeatInviteEmail(input: SponsoredSeatInviteEmailInput): EmailPayload {
  const period = input.interval === 'ANNUAL' ? 'anual' : 'mensal';
  const intro = input.existingAccount
    ? 'Você já tem uma conta? Entre com ela para vincular a vaga patrocinada.'
    : 'Crie sua conta para começar a estudar com o monitor patrocinado.';
  const details = `${input.teacherName} preparou acesso ${period} ao monitor ${input.monitorName}.`;
  return {
    from: input.from,
    to: input.recipient,
    subject: `Você recebeu acesso patrocinado a ${input.monitorName}`,
    html: `<main><h1>Seu acesso está pronto</h1><p>${escapeHtml(details)}</p><p>${escapeHtml(intro)}</p><p>Período de acesso: ${formatDate(input.startsAt)} a ${formatDate(input.endsAt)}.</p><p><a href="${escapeHtml(input.invitationUrl)}">Abrir convite</a></p></main>`,
    text: `Seu acesso está pronto. ${details} ${intro} Período de acesso: ${formatDate(input.startsAt)} a ${formatDate(input.endsAt)}. Abra o convite: ${input.invitationUrl}`,
  };
}

export function buildSponsoredTeacherNotice(input: SponsoredTeacherNoticeInput): EmailPayload {
  const period = input.interval === 'ANNUAL' ? 'anual' : 'mensal';
  const notices: Record<SponsoredTeacherNoticeKind, { subject: string; body: string; next: string }> = {
    PAID: { subject: 'Pagamento da turma patrocinada aprovado', body: 'O pagamento foi confirmado e os convites individuais foram preparados.', next: 'Os alunos podem aceitar o convite e vincular a vaga à conta deles.' },
    DECLINED: { subject: 'Pagamento da turma patrocinada não aprovado', body: 'A captura do pagamento foi recusada.', next: 'Revise a forma de pagamento ou tente novamente no checkout.' },
    OVERDUE: { subject: 'Pagamento da turma patrocinada vencido', body: 'Uma cobrança da turma está vencida.', next: 'Regularize a cobrança para manter o acesso patrocinado.' },
    CHECKOUT_CANCELED: { subject: 'Checkout da turma patrocinada cancelado', body: 'O checkout foi cancelado antes da confirmação do pagamento.', next: 'Se ainda quiser contratar as vagas, inicie uma nova compra.' },
    CHECKOUT_EXPIRED: { subject: 'Checkout da turma patrocinada expirou', body: 'O prazo do checkout terminou sem confirmação de pagamento.', next: 'Se ainda quiser contratar as vagas, inicie uma nova compra.' },
    CANCELED: { subject: 'Renovação da turma patrocinada cancelada', body: 'A assinatura da turma foi cancelada.', next: 'O acesso permanece conforme o período já pago.' },
    REFUNDED: { subject: 'Pagamento da turma patrocinada estornado', body: 'O pagamento da turma foi estornado e o acesso correspondente foi revogado.', next: 'Confira a situação da turma na sua área do professor.' },
    PARTIALLY_REFUNDED: { subject: 'Pagamento da turma patrocinada parcialmente estornado', body: 'O pagamento recebeu um estorno parcial. Esta notificação não indica revogação integral do acesso.', next: 'Confira os detalhes financeiros na sua área do professor.' },
    CHARGEBACK: { subject: 'Contestação de pagamento da turma patrocinada', body: 'O pagamento da turma recebeu uma contestação ou chargeback.', next: 'Acompanhe a contestação e a situação de acesso na sua área do professor.' },
  };
  const notice = notices[input.kind];
  const details = `${input.monitorName} · plano ${period} · ${input.seatCount} vaga(s)`;
  const text = `${notice.body} ${details}. ${notice.next}`;
  return {
    from: input.from,
    to: input.recipient,
    subject: notice.subject,
    html: `<main><h1>${escapeHtml(notice.subject)}</h1><p>${escapeHtml(input.teacherName)},</p><p>${escapeHtml(notice.body)}</p><p>${escapeHtml(details)}</p><p>${escapeHtml(notice.next)}</p></main>`,
    text,
  };
}

function formatDate(date: Date) { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(date); }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!); }
