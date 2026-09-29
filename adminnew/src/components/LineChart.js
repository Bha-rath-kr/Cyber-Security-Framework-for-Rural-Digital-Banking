import {
  LineChart as LC,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts";

export default function LineChart({ data }) {

  

  return (
    <>
      <h3 className="font-semibold mb-4">Transaction Volume (7 Days)</h3>

      <ResponsiveContainer width="100%" height={260}>
        <LC data={data}>
          <XAxis dataKey="day" />
          <YAxis />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="total"
            stroke="#22C55E"
            strokeWidth={3}
          />
        </LC>
      </ResponsiveContainer>
    </>
  );
}
