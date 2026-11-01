import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeacherRegistrationModal } from '@/modules/marketing/components/TeacherRegistrationModal';
import { TeacherRegistrationService } from '@/modules/marketing/services/TeacherRegistrationService';

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('@/shared', () => ({ OptimizedImage: () => null }));

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

describe('fluxo de cadastro do professor', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn());
    pushMock.mockReset();
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
  });

  it('envia conta e perfil em sequência com os dados preenchidos na interface', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: { userId: 'teacher-1' } }, 201))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'profile-1' } }, 201));

    const user = userEvent.setup();
    render(<TeacherRegistrationModal isOpen onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('Ex: Prof. João Victor Silva'), 'João Victor Silva');
    await user.type(screen.getByPlaceholderText('joao@professor.com.br'), 'joao.teste@example.com');
    await user.type(screen.getByPlaceholderText('(11) 99999-8888'), '11999998888');
    await user.type(screen.getByPlaceholderText('000.000.000-00'), '52998224725');

    const passwordInputs = document.querySelectorAll<HTMLInputElement>('input[type="password"]');
    await user.type(passwordInputs[0]!, 'Professor123!');
    await user.type(passwordInputs[1]!, 'Professor123!');
    await user.click(screen.getByRole('button', { name: 'Avançar' }));

    await screen.findByText('Passo 2 de 4: Foto de Perfil, URL Personalizada, Área de Atuação e Biografia.');
    await user.click(screen.getByRole('button', { name: 'Avançar' }));
    await screen.findByText(/Passo 3 de 4: Conecte suas Redes Sociais/);
    await user.click(screen.getByRole('button', { name: /Concluir Cadastro/ }));

    await screen.findByText('Status inicial atribuído:');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [accountUrl, accountInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [profileUrl, profileInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(accountUrl).toContain('/api/v1/auth/signup');
    expect(JSON.parse(String(accountInit.body))).toMatchObject({
      fullName: 'João Victor Silva',
      email: 'joao.teste@example.com',
      password: 'Professor123!',
      phone: '(11) 99999-8888',
      docType: 'CPF',
      documentNumber: '529.982.247-25',
      role: 'teacher',
    });
    expect(accountInit.credentials).toBe('include');

    expect(profileUrl).toContain('/api/v1/auth/register/teacher');
    expect(JSON.parse(String(profileInit.body))).toMatchObject({
      email: 'joao.teste@example.com',
      username: 'joao-victor-silva',
      pageSlug: 'joao-victor-silva',
      area: 'Concursos Públicos',
      agreedTerms: true,
    });
    expect(profileInit.credentials).toBe('include');
  }, 15000);

  it('exibe validação da API e permanece no primeiro passo quando a conta é rejeitada', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados básicos inválidos.',
        details: { email: ['Invalid email address'] },
      },
    }, 400));

    const user = userEvent.setup();
    render(<TeacherRegistrationModal isOpen onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Avançar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Confira os dados do cadastro');
    expect(screen.getByRole('alert')).toHaveTextContent('E-mail: Informe um e-mail válido.');
    expect(screen.queryByText('Passo 2 de 4: Foto de Perfil, URL Personalizada, Área de Atuação e Biografia.')).not.toBeInTheDocument();
  });

  it('não permite pular etapas nem mostrar sucesso antes de salvar conta e perfil', async () => {
    const user = userEvent.setup();
    render(<TeacherRegistrationModal isOpen onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Status/ }));

    expect(screen.getByText('Passo 1 de 4: Informações Pessoais, Cadastro de Documento e Acesso.')).toBeInTheDocument();
    expect(screen.queryByText('Status inicial atribuído:')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('não deixa dados locais de cadastro quando a criação da conta falha', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(TeacherRegistrationService.registerAccountStep1({
      fullName: 'Professor Teste',
      email: 'professor@example.com',
      password: 'Professor123!',
      docType: 'CPF',
      documentNumber: '529.982.247-25',
      role: 'teacher',
    })).rejects.toThrow();

    expect(localStorage.getItem('mm_user_info')).toBeNull();
  });

  it('orienta o professor a entrar ou recuperar a senha quando o e-mail já existe', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      error: { code: 'EMAIL_ALREADY_REGISTERED', message: 'Não foi possível criar a conta.' },
    }, 409));

    const user = userEvent.setup();
    render(<TeacherRegistrationModal isOpen onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Avançar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe uma conta com este e-mail. Entre ou use a recuperação de senha.');
  });

  it('mostra um erro se o navegador não conseguir ler a foto selecionada', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ data: { userId: 'teacher-photo' } }, 201));
    vi.stubGlobal('FileReader', class {
      result: string | null = null;
      onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;
      readAsDataURL() {
        this.onerror?.({} as ProgressEvent<FileReader>);
      }
    });

    const user = userEvent.setup();
    const { container } = render(<TeacherRegistrationModal isOpen onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Avançar' }));
    await screen.findByText('Passo 2 de 4: Foto de Perfil, URL Personalizada, Área de Atuação e Biografia.');
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput!, {
      target: { files: [new File(['broken-image'], 'profile.png', { type: 'image/png' })] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível ler a imagem selecionada.');
  });

  it('mostra um erro se o navegador não conseguir decodificar a foto para recorte', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ data: { userId: 'teacher-photo' } }, 201));
    vi.stubGlobal('FileReader', class {
      result: string | null = 'data:image/png;base64,cG5n';
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      readAsDataURL() {
        this.onload?.({} as ProgressEvent<FileReader>);
      }
    });
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin: string | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    });

    const user = userEvent.setup();
    const { container } = render(<TeacherRegistrationModal isOpen onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Avançar' }));
    await screen.findByText('Passo 2 de 4: Foto de Perfil, URL Personalizada, Área de Atuação e Biografia.');
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput!, {
      target: { files: [new File(['png'], 'profile.png', { type: 'image/png' })] },
    });
    await screen.findByRole('heading', { name: 'Ajustar e Cortar Foto de Perfil' });
    await user.click(screen.getByRole('button', { name: 'Confirmar Foto' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível processar a foto selecionada.');
  });

  it('mostra a falha ao salvar o perfil após a conta ter sido criada', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ data: { userId: 'teacher-2' } }, 201))
      .mockResolvedValueOnce(jsonResponse({ error: 'PROFILE_REGISTRATION_FAILED', message: 'Não foi possível salvar o perfil.' }, 500));

    const user = userEvent.setup();
    render(<TeacherRegistrationModal isOpen onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('Ex: Prof. João Victor Silva'), 'Maria Teste');
    await user.type(screen.getByPlaceholderText('joao@professor.com.br'), 'maria.teste@example.com');
    await user.type(screen.getByPlaceholderText('(11) 99999-8888'), '11999998888');
    await user.type(screen.getByPlaceholderText('000.000.000-00'), '52998224725');
    const passwordInputs = document.querySelectorAll<HTMLInputElement>('input[type="password"]');
    await user.type(passwordInputs[0]!, 'Professor123!');
    await user.type(passwordInputs[1]!, 'Professor123!');
    await user.click(screen.getByRole('button', { name: 'Avançar' }));
    await screen.findByText('Passo 2 de 4: Foto de Perfil, URL Personalizada, Área de Atuação e Biografia.');
    await user.click(screen.getByRole('button', { name: 'Avançar' }));
    await screen.findByText(/Passo 3 de 4: Conecte suas Redes Sociais/);
    await user.click(screen.getByRole('button', { name: /Concluir Cadastro/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar seu perfil. Seus dados continuam preenchidos; tente novamente.');
    expect(screen.queryByText('Status inicial atribuído:')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('envia a foto como multipart e retorna a URL confirmada pelo backend', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(new Blob(['png-data'], { type: 'image/png' })))
      .mockResolvedValueOnce(jsonResponse({ data: { avatarUrl: 'https://storage.test/teacher/avatar.png' } }));

    const avatarUrl = await TeacherRegistrationService.uploadProfileImage('data:image/png;base64,cG5nLWRhdGE=');

    expect(avatarUrl).toBe('https://storage.test/teacher/avatar.png');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [uploadUrl, uploadInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(uploadUrl).toContain('/api/v1/teachers/me/avatar');
    expect(uploadInit.method).toBe('POST');
    expect(uploadInit.credentials).toBe('include');
    expect(uploadInit.body).toBeInstanceOf(FormData);
    expect((uploadInit.body as FormData).get('file')).toBeInstanceOf(File);
  });
});
