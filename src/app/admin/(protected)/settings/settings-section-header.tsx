export function SettingsSectionHeader({
  description,
  icon,
  title,
}: {
  description: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-stone-100 text-stone-600 [&_svg]:size-5">
        {icon}
      </div>
      <div>
        <h3 className="font-medium text-stone-950">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-stone-500">{description}</p>
      </div>
    </div>
  );
}
