import { atom, clearStack, context } from '@reatom/core';
import { mount } from '@reatom/jsx';
import type { Locale } from '../i18n/atlas-copy';

const initialLocale = atom<Locale>(document.documentElement.lang === 'ru' ? 'ru' : 'en', 'app.initialLocale');

const root = document.getElementById('app');

function showStartupError(host: HTMLElement) {
  const wrapper = document.createElement('div');
  wrapper.className = 'startup';
  const message = document.createElement('p');
  message.setAttribute('role', 'alert');
  message.textContent = host.dataset.startupError ?? '';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = host.dataset.startupRetry ?? '';
  retry.addEventListener('click', () => window.location.reload(), { once: true });
  wrapper.append(message, retry);
  host.replaceChildren(wrapper);
}

async function start(host: HTMLElement) {
  try {
    const { createAtlasRoot } = await import('./atlas-view');
    clearStack();
    context.start(() => {
      const app = createAtlasRoot(initialLocale());
      mount(host, app);
      host.querySelector('.startup')?.remove();
    });
  } catch (error) {
    console.error(error);
    showStartupError(host);
  }
}

if (root) void start(root);
