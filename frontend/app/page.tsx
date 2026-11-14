import { AuthProvider } from "@/components/auth-provider";
import Dashboard from "./dashboard";
export default function Page() {
  return (
    <AuthProvider>
      <Dashboard />
    </AuthProvider>
  );
}
