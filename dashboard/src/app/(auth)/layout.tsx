export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Uho logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <img src="/logo.svg" alt="Uho" className="w-10 h-10 rounded-lg" />
          <span className="text-2xl font-bold text-[#EDEDEF]">Uho</span>
        </div>
        {children}
      </div>
    </div>
  );
}
