"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

export default function AdminAttemptsChart({
  data,
}: {
  data: Array<{ day: string; attempts: number; accuracy: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="day" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
        <Tooltip />
        <Line yAxisId="left" type="monotone" dataKey="attempts" dot={false} />
        <Line yAxisId="right" type="monotone" dataKey="accuracy" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
