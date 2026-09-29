import { useState } from "react";

export default function AdminLogin() {
  const [aadhaar, setAadhaar] = useState("");
  const [mpin, setMpin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!aadhaar.trim() || !mpin.trim()) {
      setError("Please enter Aadhaar number and MPIN");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const { default: api } = await import("../api/axios");
      const res = await api.post("/admin/login", { aadhaarNumber: aadhaar.trim(), mpin });
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("admin_name", res.data.user?.name || "Admin");
      localStorage.setItem("admin_email", res.data.user?.phoneNumber || "");
      window.location.href = "/";
    } catch (err) {
      if (err.response?.status === 401) setError("Invalid MPIN");
      else if (err.response?.status === 404) setError("User not found");
      else if (err.response?.status === 403) setError(err.response.data?.error || "Unauthorized admin access");
      else setError(err.response?.data?.error || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="w-full max-w-md mx-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-green-600 mb-1">Grambank</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Admin Panel Login</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Aadhaar Number
              </label>
              <input
                type="text"
                value={aadhaar}
                onChange={(e) => setAadhaar(e.target.value)}
                placeholder="Enter your Aadhaar number"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                MPIN
              </label>
              <input
                type="password"
                value={mpin}
                onChange={(e) => setMpin(e.target.value)}
                placeholder="Enter your MPIN"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm px-4 py-2.5 rounded-lg border border-red-200 dark:border-red-800">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium rounded-lg transition-colors"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
