import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-display text-text">Daftar</h1>
          <p className="mt-1 text-body text-text-muted">
            Buat akun baru. Admin harus approve sebelum bisa login.
          </p>
        </div>
        <RegisterForm />
      </div>
    </div>
  );
}
