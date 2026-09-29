import { Moon, Sun, Bell } from "lucide-react";
import { useState } from "react";

export default function Topbar() {
  const [dark, setDark] = useState(false);

  const toggleTheme = () => {
    document.documentElement.classList.toggle("dark");
    setDark(!dark);
  };

  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-card dark:bg-darkcard">
      <div className="flex-1" />

      <div className="flex items-center gap-4">
        <Bell size={18} />
        <button onClick={toggleTheme}>
          {dark ? <Sun /> : <Moon />}
        </button>
        <div className="w-9 h-9 bg-primary text-white rounded-full flex items-center justify-center">
          AD
        </div>
      </div>
    </header>
  );
}
