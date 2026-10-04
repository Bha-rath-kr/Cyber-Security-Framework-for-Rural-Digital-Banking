import { useState, useEffect } from "react";
import { Check } from "lucide-react";

export default function Settings() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(localStorage.getItem("admin_name") || "Admin User");
    setEmail(localStorage.getItem("admin_email") || "admin@grambank.com");
    setPhone(localStorage.getItem("admin_phone") || "+1 234 567 8900");
  }, []);

  const handleSave = () => {
    localStorage.setItem("admin_name", name);
    localStorage.setItem("admin_email", email);
    localStorage.setItem("admin_phone", phone);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLogout = () => {
    localStorage.clear();
    window.location.reload();
  };

  return (
    <>
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>

      <div className="bg-card dark:bg-darkcard p-6 rounded-xl border mb-6">
        <h3 className="font-semibold mb-4">Admin Profile</h3>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-muted mb-1">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Email</label>
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Phone</label>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Role</label>
            <input
              value="Super Admin"
              disabled
              className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 w-full"
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          className="mt-6 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          {saved ? <><Check size={16} aria-hidden="true" /> Saved</> : "Save Changes"}
        </button>
      </div>

      <div className="bg-card dark:bg-darkcard p-6 rounded-xl border">
        <h3 className="font-semibold mb-4">Session Management</h3>
        <p className="text-sm text-muted mb-4">
          Clearing your session will log you out and remove all local data.
        </p>
        <button
          onClick={handleLogout}
          className="px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
        >
          Logout & Clear Session
        </button>
      </div>
    </>
  );
}
