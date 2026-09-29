import {
  FiUsers,
  FiDollarSign,
  FiTrendingUp,
  FiAlertTriangle
} from "react-icons/fi";

const iconMap = {
  users: <FiUsers size={22} />,
  balance: <FiDollarSign size={22} />,
  transactions: <FiTrendingUp size={22} />,
  fraud: <FiAlertTriangle size={22} />
};

const colorMap = {
  users: "bg-green-100 text-green-600",
  balance: "bg-gray-100 text-gray-700",
  transactions: "bg-green-100 text-green-600",
  fraud: "bg-red-100 text-red-600"
};

export default function StatCard({
  title,
  value,
  percent,
  type,
  negative
}) {
  return (
    <div className="bg-card dark:bg-darkcard p-5 rounded-xl border flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorMap[type]}`}
        >
          {iconMap[type]}
        </div>

        {percent && (
          <span
            className={`text-sm font-medium ${
              negative ? "text-red-500" : "text-green-500"
            }`}
          >
            {negative ? "-" : "+"}{percent}%
          </span>
        )}
      </div>

      <div className="mt-4">
        <p className="text-sm text-muted">{title}</p>
        <h3 className="text-2xl font-semibold mt-1">{value}</h3>
      </div>
    </div>
  );
}
