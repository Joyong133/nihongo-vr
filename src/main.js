import { App } from './app.js';
import { Sound } from './core/audio.js';
import { loadDB } from './core/db.js';
import { store } from './core/store.js';
import { Home, Onboarding } from './screens/home.js';

// data, fonts and audio live next to this page (public/)
const BASE = './';

const $ = (id) => document.getElementById(id);
const fill = $('load-fill');
const msg = $('load-msg');
const progress = (p, text) => {
  fill.style.width = `${Math.round(p * 100)}%`;
  if (text) msg.textContent = text;
};

async function loadFonts() {
  const faces = [
    new FontFace('NJP', `url(${BASE}fonts/njp.woff2)`, { weight: '100 900' }),
    new FontFace('NKR', `url(${BASE}fonts/nkr.woff2)`, { weight: '100 900' }),
  ];
  await Promise.all(
    faces.map(async (f) => {
      try {
        await f.load();
        document.fonts.add(f);
      } catch (e) {
        console.warn('font load failed, using system font', e);
      }
    })
  );
}

async function boot() {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('iwer')) {
    const { XRDevice, metaQuest3 } = await import('iwer');
    const dev = new XRDevice(metaQuest3);
    dev.installRuntime({ forceInstall: true });
    window.__xrDevice = dev;
  }
  store.load();
  progress(0.05, '글꼴을 불러오는 중…');
  await loadFonts();
  progress(0.3, '학습 데이터를 불러오는 중…');
  await loadDB(BASE, (p) => progress(0.3 + p * 0.6));
  progress(0.95, '정원을 꾸미는 중…');

  const sound = new Sound(BASE);
  const app = new App($('app'), sound);
  app.init();
  window.__app = app;
  app.go(store.d.onboarded ? new Home(app) : new Onboarding(app));
  progress(1, '준비 완료');
  $('loading').classList.add('hidden');
  $('menu').classList.remove('hidden');

  const btnVR = $('btn-vr');
  const note = $('vr-note');
  let vrOK = false;
  try {
    vrOK = !!navigator.xr && (await navigator.xr.isSessionSupported('immersive-vr'));
  } catch (e) {
    vrOK = false;
  }
  if (vrOK) {
    btnVR.disabled = false;
    note.textContent = '헤드셋을 쓰고 눌러 주세요';
  } else if (!window.isSecureContext) {
    note.textContent = 'VR은 HTTPS 주소에서만 동작합니다';
  }

  const title = $('title-screen');
  const started = () => {
    title.classList.add('hidden');
    sound.unlock();
    sound.startMusic();
  };
  btnVR.addEventListener('click', async () => {
    try {
      await app.startVR();
      started();
    } catch (e) {
      console.error(e);
      note.textContent = `VR 시작 실패: ${e.message || e}`;
    }
  });
  $('btn-flat').addEventListener('click', () => {
    app.startFlat();
    started();
  });
  app.onExitVR = () => title.classList.remove('hidden');

  if (new URLSearchParams(location.search).has('autostart')) {
    app.startFlat();
    title.classList.add('hidden');
  }
}

boot().catch((e) => {
  console.error(e);
  msg.textContent = `오류: ${e.message || e}`;
});
