import { useNavigate } from 'react-router';
import { Sym } from '../components/Sym';
import { updateSettings, useSettings, type Settings } from '../settings';
import { LEGEND } from '../symbols';

function Choice<K extends keyof Settings>({
  label,
  field,
  options,
}: {
  label: string;
  field: K;
  options: [Settings[K], string][];
}) {
  const settings = useSettings();
  return (
    <div className="stack-sm">
      <h3>{label}</h3>
      <div className="chips">
        {options.map(([value, text]) => (
          <button
            key={String(value)}
            type="button"
            className={`chip ${settings[field] === value ? 'on' : ''}`}
            onClick={() => updateSettings({ [field]: value } as Partial<Settings>)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Настройки устройства: тема и символы таблицы (ТЗ 10, этап 5). */
export function SettingsPage() {
  const navigate = useNavigate();
  return (
    <main className="page">
      <header className="stack-sm">
        <button className="btn small back" onClick={() => navigate(-1)}>
          ← Назад
        </button>
        <h1>Настройки</h1>
        <p className="muted small">Сохраняются только на этом устройстве.</p>
      </header>

      <section className="card stack">
        <Choice
          label="Тема"
          field="theme"
          options={[
            ['tavern', 'таверна'],
            ['auto', 'как в системе'],
            ['light', 'светлая'],
            ['dark', 'тёмная'],
          ]}
        />
        <Choice
          label="Символы в таблице"
          field="symbols"
          options={[
            ['icons', 'иконки'],
            ['text', 'текстом'],
          ]}
        />
        <Choice
          label="Размер символов"
          field="symbolSize"
          options={[
            ['s', 'мелкие'],
            ['m', 'обычные'],
            ['l', 'крупные'],
          ]}
        />
        <Choice
          label="Марьяжи под числом"
          field="marriages"
          options={[
            [false, 'скрыты'],
            [true, 'показаны'],
          ]}
        />
      </section>

      <section className="card stack-sm">
        <h3>Как выглядят символы</h3>
        <ul className="legend-preview">
          {LEGEND.map((item) => (
            <li key={item.meaning}>
              <span className="row">
                {item.symbols.map((s, i) => (
                  <Sym key={i} s={s} />
                ))}
              </span>
              <span className="small">{item.meaning}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
