import { PieChart, Pie, Cell } from "recharts";

export default function DonutChart({ data }) {
  if (!data) return null;

  const chartData = [
    { name: "Credit", value: data.Credit },
    { name: "Debit", value: data.Debit }
  ];

  return (
    <>
      <h3 className="font-semibold mb-4">Credit vs Debit</h3>

      <PieChart width={250} height={250}>
        <Pie
          data={chartData}
          innerRadius={70}
          outerRadius={100}
          dataKey="value"
        >
          <Cell fill="#22C55E" />
          <Cell fill="#0F172A" />
        </Pie>
      </PieChart>

      <div className="flex justify-center gap-4 text-sm mt-4">
          <span className="text-green-600">
            ■ Credit: {data.Credit}
          </span>
          <span className="text-gray-700 dark:text-gray-300">
            ■ Debit: {data.Debit}
          </span>
      </div>
    </>
  );
}
