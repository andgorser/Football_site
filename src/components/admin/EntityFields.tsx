import { Field, inputClass } from "@/components/ui";
import { MSU_STATUS_LABEL, POSITION_LABEL, ROLE_LABEL } from "@/lib/football";
import { toDateInput } from "@/lib/format";

type Faculty = { id: number; shortName: string; name: string };

// ───────────────────────────── Команда ──────────────────────────────────────

export function TeamFields({
  faculties,
  defaults,
}: {
  faculties: Faculty[];
  defaults?: {
    name: string;
    shortName: string;
    facultyId: number | null;
    primaryColor: string | null;
    foundedYear: number | null;
    logoUrl: string | null;
    description: string | null;
  };
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Полное название">
        <input
          name="name"
          required
          defaultValue={defaults?.name}
          placeholder="ФК «Мехмат»"
          className={inputClass}
        />
      </Field>

      <Field label="Короткое название" hint="Показывается в таблицах и на табло">
        <input
          name="shortName"
          required
          maxLength={30}
          defaultValue={defaults?.shortName}
          placeholder="Мехмат"
          className={inputClass}
        />
      </Field>

      <Field label="Факультет">
        <select name="facultyId" defaultValue={defaults?.facultyId ?? ""} className={inputClass}>
          <option value="">Не указан</option>
          {faculties.map((faculty) => (
            <option key={faculty.id} value={faculty.id}>
              {faculty.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Год основания">
        <input
          type="number"
          name="foundedYear"
          min={1900}
          max={2100}
          defaultValue={defaults?.foundedYear ?? ""}
          className={inputClass}
        />
      </Field>

      <Field label="Цвет команды" hint="Используется для эмблемы-заглушки">
        <input
          type="color"
          name="primaryColor"
          defaultValue={defaults?.primaryColor ?? "#1f6feb"}
          className="h-10 w-full cursor-pointer rounded-lg border border-border bg-surface-2 px-1"
        />
      </Field>

      <Field label="Ссылка на логотип" hint="Необязательно">
        <input
          name="logoUrl"
          type="url"
          defaultValue={defaults?.logoUrl ?? ""}
          placeholder="https://…"
          className={inputClass}
        />
      </Field>

      <div className="sm:col-span-2">
        <Field label="Описание">
          <textarea name="description" rows={3} defaultValue={defaults?.description ?? ""} className={inputClass} />
        </Field>
      </div>
    </div>
  );
}

// ───────────────────────────── Игрок ────────────────────────────────────────

export function PlayerFields({
  faculties,
  defaults,
}: {
  faculties: Faculty[];
  defaults?: {
    firstName: string;
    lastName: string;
    middleName: string | null;
    birthDate: Date | null;
    facultyId: number | null;
    course: number | null;
    msuStatus: string;
    preferredPosition: string | null;
    photoUrl: string | null;
  };
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Фамилия">
        <input name="lastName" required defaultValue={defaults?.lastName} className={inputClass} />
      </Field>

      <Field label="Имя">
        <input name="firstName" required defaultValue={defaults?.firstName} className={inputClass} />
      </Field>

      <Field label="Отчество">
        <input name="middleName" defaultValue={defaults?.middleName ?? ""} className={inputClass} />
      </Field>

      <Field label="Дата рождения">
        <input
          type="date"
          name="birthDate"
          defaultValue={toDateInput(defaults?.birthDate)}
          className={inputClass}
        />
      </Field>

      <Field label="Статус в МГУ">
        <select name="msuStatus" defaultValue={defaults?.msuStatus ?? "STUDENT"} className={inputClass}>
          {Object.entries(MSU_STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Факультет">
        <select name="facultyId" defaultValue={defaults?.facultyId ?? ""} className={inputClass}>
          <option value="">Не указан</option>
          {faculties.map((faculty) => (
            <option key={faculty.id} value={faculty.id}>
              {faculty.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Курс">
        <input
          type="number"
          name="course"
          min={1}
          max={6}
          defaultValue={defaults?.course ?? ""}
          className={inputClass}
        />
      </Field>

      <Field label="Основная позиция">
        <select
          name="preferredPosition"
          defaultValue={defaults?.preferredPosition ?? ""}
          className={inputClass}
        >
          <option value="">Не указана</option>
          {Object.entries(POSITION_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <div className="sm:col-span-2">
        <Field label="Ссылка на фото" hint="Необязательно">
          <input
            name="photoUrl"
            type="url"
            defaultValue={defaults?.photoUrl ?? ""}
            placeholder="https://…"
            className={inputClass}
          />
        </Field>
      </div>
    </div>
  );
}

// ───────────────────────────── Пользователь ─────────────────────────────────

export function UserFields({
  teams,
  defaults,
  isNew,
}: {
  teams: { id: string; name: string }[];
  defaults?: { email: string; fullName: string; role: string; teamId: string | null };
  isNew: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Email">
        <input
          name="email"
          type="email"
          required
          defaultValue={defaults?.email}
          className={inputClass}
        />
      </Field>

      <Field label="Имя и фамилия">
        <input name="fullName" required defaultValue={defaults?.fullName} className={inputClass} />
      </Field>

      <Field label="Роль">
        <select name="role" defaultValue={defaults?.role ?? "REFEREE"} className={inputClass}>
          {Object.entries(ROLE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Команда" hint="Обязательно для капитана">
        <select name="teamId" defaultValue={defaults?.teamId ?? ""} className={inputClass}>
          <option value="">Не привязан</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="sm:col-span-2">
        <Field
          label={isNew ? "Пароль" : "Новый пароль"}
          hint={isNew ? "Минимум 8 символов" : "Оставьте пустым, чтобы не менять"}
        >
          <input
            name="password"
            type="text"
            minLength={8}
            required={isNew}
            autoComplete="new-password"
            className={inputClass}
          />
        </Field>
      </div>
    </div>
  );
}
