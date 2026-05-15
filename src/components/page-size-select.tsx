"use client";

type PageSizeSelectProps = {
  ariaLabel: string;
  className: string;
  name: string;
  options: readonly number[];
  value: number;
};

export function PageSizeSelect({
  ariaLabel,
  className,
  name,
  options,
  value,
}: PageSizeSelectProps) {
  return (
    <select
      aria-label={ariaLabel}
      className={className}
      defaultValue={String(value)}
      name={name}
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
