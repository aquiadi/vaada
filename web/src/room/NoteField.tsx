import { useId } from "react";

interface Props {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  maxLength?: number;
}

/** A few lines of plain text in a dialog: a reason, a delivery note. */
export function NoteField({ label, hint, value, onChange, required = false, maxLength = 1000 }: Props) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        required={required}
        maxLength={maxLength}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="w-full resize-y rounded-sm border hairline bg-paper px-2 py-1.5 font-serif text-body text-ink"
      />
      {hint ? (
        <p id={`${id}-hint`} className="m-0 text-note text-ink-soft">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
