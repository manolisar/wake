import { CheckIcon } from './Icons';

export function Toast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="vt-slide-up fixed bottom-[22px] left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-[10px] bg-navy px-[1.1rem] py-2.5 text-[0.78rem] font-semibold text-white shadow-[0_10px_40px_rgba(0,0,0,0.15)]"
    >
      <span className="inline-flex text-[#6EE7B7]">
        <CheckIcon size={15} />
      </span>
      {message}
    </div>
  );
}
