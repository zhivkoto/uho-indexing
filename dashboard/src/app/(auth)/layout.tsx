export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Uho logo */}
        <div className="text-center mb-8">
          <span className="text-2xl font-bold text-[#EDEDEF]">uho</span>
          <span className="text-2xl font-bold text-[#22D3EE]">.</span>
        </div>
        {children}
      </div>
    </div>
  );
}
