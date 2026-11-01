import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8');

test('design tokens define the normative semantic palette', () => {
  const tokens = read('src/styles/tokens.css');

  for (const token of [
    '--color-brand-primary',
    '--color-brand-accent',
    '--color-bg-page',
    '--color-bg-surface',
    '--color-text-primary',
    '--color-text-muted',
    '--color-focus-ring',
    '--radius-control',
  ]) {
    assert.match(tokens, new RegExp(`${token.replaceAll('-', '\\-')}\\s*:`));
  }
});

test('global CSS loads tokens before exposing the Tailwind theme', () => {
  const globals = read('src/app/globals.css');

  assert.match(globals, /^@import ['"]\.\.\/styles\/tokens\.css['"];?/m);
  assert.match(globals, /@theme inline/);
  assert.match(globals, /var\(--token-brand-primary\)/);
});

test('student and shared module barrels expose their public contracts', () => {
  const student = read('src/modules/student/index.ts');
  const shared = read('src/shared/index.ts');

  for (const exportName of ['StudentProvider', 'StudentSessionGuard', 'StudentHeader', 'useStudent']) {
    assert.match(student, new RegExp(`\\b${exportName}\\b`));
  }
  for (const exportName of ['AlertProvider', 'useAlert', 'AlertModal']) {
    assert.match(shared, new RegExp(`\\b${exportName}\\b`));
  }
});

test('each feature module has an explicit public barrel', () => {
  for (const moduleName of ['marketing', 'public-teacher', 'student', 'teacher']) {
    assert.equal(
      existsSync(resolve(root, `src/modules/${moduleName}/index.ts`)),
      true,
      `missing public barrel for ${moduleName}`,
    );
  }
});

test('legacy route-owned student and shared files no longer exist', () => {
  for (const relativePath of [
    'src/app/(student-app)/areadoaluno/StudentContext.tsx',
    'src/app/(student-app)/areadoaluno/StudentHeader.tsx',
    'src/app/(student-app)/areadoaluno/StudentSidebar.tsx',
    'src/context/AlertContext.tsx',
    'src/components/AlertModal.tsx',
  ]) {
    assert.equal(existsSync(resolve(root, relativePath)), false, `legacy file remains: ${relativePath}`);
  }
});

test('storefront displays checkout loading while preparing the hosted checkout', () => {
  const storefront = read('src/app/(public-teacher)/p/[teacherSlug]/StorefrontClient.tsx');

  assert.match(storefront, /const \[isCheckoutStarting, setIsCheckoutStarting\] = useState\(false\)/);
  assert.match(storefront, /setIsCheckoutStarting\(true\)/);
  assert.match(storefront, /setIsCheckoutStarting\(false\)/);
  assert.match(storefront, /role="status"[^>]*aria-label="Abrindo checkout"/);
  assert.match(storefront, /Abrindo checkout seguro\.\.\./);
});

test('public teacher page deduplicates profile fetch between metadata and page render', () => {
  const page = read('src/app/(public-teacher)/p/[teacherSlug]/page.tsx');

  assert.match(page, /import \{ cache \} from ['"]react['"]/);
  assert.match(page, /const getTeacherProfile = cache\(async \(slug: string\)/);
  assert.equal((page.match(/getTeacherProfile\(teacherSlug\)/g) || []).length, 2);
});

test('public storefront displays the backend monitor price instead of a fixed price', () => {
  const page = read('src/app/(public-teacher)/p/[teacherSlug]/page.tsx');
  const storefront = read('src/app/(public-teacher)/p/[teacherSlug]/StorefrontClient.tsx');

  assert.match(page, /priceCents:\s*number/);
  assert.match(storefront, /priceCents:\s*number/);
  assert.match(storefront, /price:\s*formatMonitorPrice\(m\.priceCents\)/);
  assert.match(storefront, /originalPrice:\s*formatMonitorPrice\(Math\.round\(m\.priceCents \* 1\.2\)\)/);
  assert.doesNotMatch(storefront, /price:\s*['"]R\$\s*29,90['"]/);
  assert.match(storefront, /mm_payment_checkout_idempotency_key:v2:/);
});

test('sponsored classes are reachable from the teacher dashboard and public annual offers use the configured price', () => {
  const dashboard = read('src/modules/teacher/components/TeacherDashboardOverview.tsx');
  const route = read('src/app/(teacher)/professor/turmas/page.tsx');
  const storefrontPage = read('src/app/(public-teacher)/p/[teacherSlug]/page.tsx');
  const storefront = read('src/app/(public-teacher)/p/[teacherSlug]/StorefrontClient.tsx');

  assert.match(dashboard, /href="\/professor\/turmas"/);
  assert.match(route, /TeacherSponsoredClassesPage/);
  assert.match(storefrontPage, /annualPriceCents\?: number \| null/);
  assert.match(storefront, /interval: selectedInterval/);
  assert.match(storefront, /selectedProduct\.annualPriceCents/);
});

test('storefront emits frontend timing logs for mount, session and ready states', () => {
  const storefront = read('src/app/(public-teacher)/p/[teacherSlug]/StorefrontClient.tsx');

  for (const eventName of [
    'storefront.frontend_mount_started',
    'storefront.frontend_navigation_timing',
    'storefront.frontend_first_frame',
    'storefront.frontend_session_started',
    'storefront.frontend_session_completed',
    'storefront.frontend_ready',
  ]) {
    assert.match(storefront, new RegExp(eventName.replaceAll('.', '\\.'), 'u'));
  }
});

test('interceptor bypasses the ngrok browser warning for public API requests', () => {
  const interceptor = read('src/shared/context/SessionAuthInterceptor.tsx');

  assert.match(interceptor, /ngrok-skip-browser-warning/);
  assert.match(interceptor, /ngrok-free|ngrok\.io/);
});

test('student login persists the backend access token', () => {
  const authModal = read('src/modules/student/components/StudentAuthModal.tsx');

  assert.match(authModal, /accessToken\?: string/);
  assert.match(authModal, /extractAccessToken\(data\)/);
  assert.match(authModal, /localStorage\.setItem\('mm_access_token', token\)/);
});

test('logout revoga a sessão no backend e limpa o estado local', () => {
  const session = read('src/shared/auth/client-session.ts');
  const studentContext = read('src/modules/student/context/StudentContext.tsx');
  const storefront = read('src/app/(public-teacher)/p/[teacherSlug]/StorefrontClient.tsx');

  assert.match(session, /\/api\/v1\/auth\/logout/);
  assert.match(session, /credentials: 'include'/);
  assert.match(session, /mm_access_token/);
  assert.match(studentContext, /revokeClientSession\(apiUrl\)/);
  assert.match(storefront, /revokeClientSession\(apiUrl\)/);
});
