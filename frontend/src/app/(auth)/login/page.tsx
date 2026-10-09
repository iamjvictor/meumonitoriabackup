import { redirect } from 'next/navigation';

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const search = new URLSearchParams();
  search.set('login', 'true');

  for (const [key, value] of Object.entries(params)) {
    if (key !== 'login' && typeof value === 'string') {
      search.set(key, value);
    }
  }

  redirect(`/?${search.toString()}`);
}

