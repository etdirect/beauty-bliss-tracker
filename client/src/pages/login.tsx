import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShoppingBag, LogIn } from "lucide-react";

interface LoginProps {
  onLogin: (user: { id: string; username: string; name: string; role: string; assignedPos: any[] }) => void;
}

export default function LoginPage({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/login", { username, pin });
      const user = await res.json();
      onLogin(user);
    } catch (err: any) {
      setError("Invalid username or PIN");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-3 pb-2">
          <div className="mx-auto w-14 h-14 rounded-xl bg-primary flex items-center justify-center">
            <ShoppingBag className="w-7 h-7 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-xl">Beauty Bliss</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Sales Tracker</p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Username</label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                autoComplete="username"
                data-testid="login-username"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">PIN</label>
              <Input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter PIN"
                autoComplete="current-password"
                data-testid="login-pin"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}
            <Button
              type="submit"
              className="w-full h-11"
              disabled={loading || !username.trim() || !pin.trim()}
              data-testid="login-submit"
            >
              {loading ? "Signing in..." : (
                <>
                  <LogIn className="w-4 h-4 mr-2" />
                  Sign In
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
