const overlayClassName =
  "fixed inset-0 z-50 bg-forest-950/20 duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:duration-0 motion-reduce:animate-none";

const modalContentClassName =
  "fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-112 -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border border-line bg-popover p-6 text-popover-foreground shadow-[0_8px_24px_rgba(16,41,30,0.08)] duration-200 outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 motion-reduce:duration-0 motion-reduce:animate-none";

export { modalContentClassName, overlayClassName };
