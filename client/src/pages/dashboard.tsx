import { useState } from "react";
import { Link, useRoute, Redirect } from "wouter";
import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  BarChart3, Tag, Settings, Gift,
  LayoutDashboard, Moon, Sun, LogOut, Package, Menu,
} from "lucide-react";

import ManagementDashboard from "./dashboard/management-dashboard";
import BrandDashboard from "./dashboard/brand-dashboard";
import Promotions from "./dashboard/promotions";
import SettingsPage from "./dashboard/settings";

export const CHART_COLORS = [
  "hsl(340, 65%, 47%)", "hsl(173, 58%, 39%)", "hsl(43, 74%, 49%)",
  "hsl(262, 50%, 55%)", "hsl(27, 87%, 55%)", "hsl(200, 60%, 45%)",
  "hsl(140, 50%, 40%)", "hsl(320, 50%, 50%)", "hsl(60, 60%, 45%)",
  "hsl(10, 70%, 50%)", "hsl(220, 55%, 50%)", "hsl(90, 45%, 40%)",
  "hsl(280, 45%, 55%)", "hsl(35, 80%, 50%)",
];

const navItems = [
  { path: "/dashboard", label: "Management", icon: BarChart3 },
  { path: "/dashboard/brands", label: "Brand Analytics", icon: Tag },
  { path: "/dashboard/promotions", label: "Promotions", icon: Gift },
  { path: "/dashboard/settings", label: "Settings", icon: Settings },
];

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [isDark, setIsDark] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isManagement] = useRoute("/dashboard");
  const [isBrands] = useRoute("/dashboard/brands");
  const [isPromos] = useRoute("/dashboard/promotions");
  const [isSettings] = useRoute("/dashboard/settings");

  if (!user || user.role !== "management") {
    return <Redirect to="/" />;
  }

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle("dark");
  };

  const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      <div className="p-4 flex-1">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <LayoutDashboard className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-bold leading-tight">Beauty Bliss</h1>
            <p className="text-[10px] text-muted-foreground">Management — {user.name}</p>
          </div>
        </div>
        <nav className="space-y-1">
          {navItems.map(item => {
            const isActive =
              (item.path === "/dashboard" && isManagement) ||
              (item.path === "/dashboard/brands" && isBrands) ||
              (item.path === "/dashboard/promotions" && isPromos) ||
              (item.path === "/dashboard/settings" && isSettings);
            return (
              <Link key={item.path} href={item.path}>
                <div
                  onClick={onNavigate}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm cursor-pointer transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, "-")}`}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="p-4 border-t">
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-full px-3 py-2 rounded-md hover:bg-accent transition-colors"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {isDark ? "Light Mode" : "Dark Mode"}
        </button>
        <Link href="/">
          <div onClick={onNavigate} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground px-3 py-2 rounded-md hover:bg-accent transition-colors mt-1 cursor-pointer">
            <Package className="w-4 h-4" />
            BA Entry
          </div>
        </Link>
        <button
          onClick={() => { onNavigate?.(); logout(); }}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive w-full px-3 py-2 rounded-md hover:bg-accent transition-colors mt-1"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-56 flex-shrink-0 border-r bg-sidebar flex-col">
        <SidebarContent />
      </aside>

      {/* Mobile Header + Sheet */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="md:hidden flex items-center justify-between border-b px-4 py-3 bg-background">
          <div className="flex items-center gap-2">
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-56 p-0 flex flex-col">
                <SidebarContent onNavigate={() => setSidebarOpen(false)} />
              </SheetContent>
            </Sheet>
            <span className="text-sm font-semibold">Beauty Bliss</span>
          </div>
          <span className="text-xs text-muted-foreground">{user.name}</span>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          {isManagement && <ManagementDashboard />}
          {isBrands && <BrandDashboard />}
          {isPromos && <Promotions />}
          {isSettings && <SettingsPage />}
        </main>
      </div>
    </div>
  );
}
