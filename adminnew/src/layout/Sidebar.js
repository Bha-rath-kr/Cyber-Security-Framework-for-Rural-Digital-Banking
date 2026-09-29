import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  DollarSign,
  Shield,
  Settings,
  MessageCircle,
  FileWarning,
  Clock,
  Link
} from "lucide-react";

const menu = [
  { name: "Dashboard", icon: LayoutDashboard, path: "/" },
  { name: "Users", icon: Users, path: "/users" },
  { name: "Funds", icon: DollarSign, path: "/funds" },
  { name: "Fraud", icon: Shield, path: "/fraud" },
  { name: "Reports", icon: FileWarning, path: "/reports" },
  { name: "Scheduled", icon: Clock, path: "/scheduled" },
  { name: "Live Chat", icon: MessageCircle, path: "/live-chat" },
  { name: "Blockchain", icon: Link, path: "/blockchain" },
  { name: "Settings", icon: Settings, path: "/settings" }
];

export default function Sidebar() {
  return (
    <aside className="w-64 h-screen bg-card dark:bg-darkcard border-r border-border px-4 py-5">
      {/* LOGO */}
      <h1 className="text-xl font-bold mb-8 text-primary">Grambank</h1>

      {/* MENU */}
      <nav className="space-y-2">
        {menu.map(item => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.name}
              to={item.path}
              end
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all
                ${
                  isActive
                    ? "bg-green-500 text-white shadow-sm"
                    : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`
              }
            >
              <Icon size={18} />
              {item.name}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
