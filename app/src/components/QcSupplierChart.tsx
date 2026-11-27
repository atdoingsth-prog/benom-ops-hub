import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export default function QcSupplierChart({ data }: { data: { supplier: string; units: number; skus: number }[] }) {
  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#EFE7DC" />
          <XAxis type="number" tick={{ fontSize: 11, fill: '#6e5543' }} />
          <YAxis dataKey="supplier" type="category" width={95} tick={{ fontSize: 11, fill: '#3B281A' }} />
          <Tooltip formatter={(v: any) => [`${v} sản phẩm lỗi`, 'Tổng lỗi']} />
          <Bar dataKey="units" fill="#9A2B26" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
