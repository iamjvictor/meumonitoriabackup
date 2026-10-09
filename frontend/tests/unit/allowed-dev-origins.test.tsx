import { expect, test } from 'vitest';
import nextConfig from '../../next.config';

test('permite que o túnel ngrok carregue recursos do Next em desenvolvimento', () => {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  expect(nextConfig.allowedDevOrigins).toEqual(appUrl ? [new URL(appUrl).hostname] : []);
});
