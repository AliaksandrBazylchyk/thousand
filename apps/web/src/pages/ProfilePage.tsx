import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api';
import { useAuth, useMeUser } from '../auth';
import { Avatar } from '../components/Avatar';

const AVATAR_SIZE = 256;

/** Фото ужимается на устройстве: квадрат по центру 256×256, WebP (или JPEG, если WebP не умеет). */
async function shrinkImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = AVATAR_SIZE;
  canvas
    .getContext('2d')!
    .drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE,
    );
  bitmap.close();
  const webp = canvas.toDataURL('image/webp', 0.85);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85);
}

/** Профиль: аватар, имя, смена пароля, выход (ТЗ 5.0, 6.0). */
export function ProfilePage() {
  const navigate = useNavigate();
  const me = useMeUser();
  const { setMe, logout } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(me.name);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setStatus(null);
    try {
      setStatus({ text: await fn() });
    } catch (err) {
      setStatus({ text: (err as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }

  const uploadAvatar = (file: File) =>
    run(async () => {
      setMe(await api.setAvatar(await shrinkImage(file)));
      return 'Фото обновлено';
    });

  const saveName = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      setMe(await api.updateName(name));
      return 'Имя сохранено';
    });
  };

  const savePassword = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api.changePassword(current, next);
      setCurrent('');
      setNext('');
      return 'Пароль изменён';
    });
  };

  return (
    <main className="page">
      <header className="row">
        <button className="btn small back" onClick={() => navigate(-1)}>
          ← Назад
        </button>
        <h1>Профиль</h1>
      </header>

      <section className="profile-avatar">
        <Avatar name={me.name} url={me.avatarUrl} size={104} className="big" />
        <div className="stack-sm grow">
          <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
            Загрузить фото
          </button>
          {me.avatarUrl && (
            <button
              className="link-btn muted"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setMe(await api.setAvatar(null));
                  return 'Фото убрано';
                })
              }
            >
              Убрать фото
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void uploadAvatar(file);
            }}
          />
        </div>
      </section>

      {status && (
        <p className={status.error ? 'error-box' : 'good'} role="status">
          {status.text}
        </p>
      )}

      <form className="card stack" onSubmit={saveName}>
        <div className="row between">
          <span className="muted">Логин</span>
          <b>{me.login}</b>
        </div>
        <label className="field">
          Имя
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            required
          />
          <span className="hint">
            Псевдонимы в комнатах задаются отдельно, при входе в комнату.
          </span>
        </label>
        <button className="btn primary" disabled={busy || !name.trim() || name.trim() === me.name}>
          Сохранить
        </button>
      </form>

      <form className="card stack" onSubmit={savePassword}>
        <h3>Пароль</h3>
        <div className="two-cols">
          <label className="field">
            Текущий
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </label>
          <label className="field">
            Новый
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              minLength={6}
              required
            />
          </label>
        </div>
        <button className="btn" disabled={busy}>
          Сменить пароль
        </button>
      </form>

      <button className="btn danger" onClick={() => void logout()}>
        Выйти
      </button>
    </main>
  );
}
