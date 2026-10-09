import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('dashboard action cards cover mobile, tablet and desktop breakpoints', () => {
  const source = read('src/modules/student/components/dashboard/DashboardStudyActions.tsx');
  assert.match(source, /grid-cols-1/);
  assert.match(source, /md:grid-cols-2/);
  assert.match(source, /lg:grid-cols-3/);
  assert.match(source, /min-h-11/);
});

test('dashboard reusable cards use container queries and intermediate grids', () => {
  const source = ['DashboardAgentList', 'DashboardPerformanceCard', 'DashboardDailyChallenges']
    .map((name) => read(`src/modules/student/components/dashboard/${name}.tsx`)).join('\n');
  assert.match(source, /@container/);
  assert.match(source, /@sm:grid-cols-2/);
  assert.match(source, /@lg:grid-cols-3|@lg:grid-cols-12/);
});

test('student navigation is collapsed on mobile and touch-safe', () => {
  const source = read('src/modules/student/components/StudentSidebar.tsx');
  assert.match(source, /lg:flex/);
  assert.match(source, /min-h-11|h-11/);
  const dashboard = read('src/app/(student-app)/areadoaluno/page.tsx');
  const shell = read('src/modules/student/components/StudentAppShell.tsx');
  assert.match(dashboard, /StudentAppShell/);
  assert.match(shell, /min-w-0 flex-1/);
  assert.match(shell, /pb-\[calc\(5rem\+env\(safe-area-inset-bottom\)\)\]/);
});

test('student mobile navigation is mounted by the shared student layout', () => {
  const layout = read('src/app/(student-app)/areadoaluno/layout.tsx');
  assert.match(layout, /StudentMobileNavigation/);
});

test('monitor layout avoids dangerous clipping and keeps controls touch-safe', () => {
  const workspace = read('src/modules/teacher/components/monitor/MonitorWorkspace.tsx');
  const sidebar = read('src/modules/teacher/components/monitor/MonitorStructureSidebar.tsx');
  assert.match(workspace, /min-h-screen w-full/);
  assert.match(workspace, /lg:h-screen lg:overflow-hidden/);
  assert.match(workspace, /flex-col overflow-y-auto lg:flex-row/);
  assert.match(workspace, /p-4 space-y-6 sm:p-6 lg:p-8/);
  assert.match(sidebar, /h-\[40vh\] w-full/);
  assert.match(sidebar, /lg:h-full lg:w-80/);
});

test('critical responsive surfaces declare wide container limits', () => {
  for (const path of [
    'src/modules/marketing/components/HeroSection.tsx',
    'src/app/(public-teacher)/p/[teacherSlug]/StorefrontClient.tsx',
  ]) {
    assert.match(read(path), /max-w-7xl/, path);
  }
});

test('teacher dashboard has an intermediate tablet layout', () => {
  const source = read('src/modules/teacher/components/TeacherDashboardOverview.tsx');
  assert.match(source, /grid-cols-1 md:grid-cols-2 lg:grid-cols-12/);
  assert.match(source, /min-h-11/);
});

test('student header controls keep touch targets on narrow screens', () => {
  const source = read('src/modules/student/components/StudentHeader.tsx');
  assert.match(source, /min-h-11 min-w-11/);
});
