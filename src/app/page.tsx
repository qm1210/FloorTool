// src/app/page.tsx
"use client";

import { useState } from "react";
import FloorForm, { type FloorInput } from "@/components/FloorForm";
import generateLayout, { type LayoutResult } from "@/utils/GenerateLayout";
import Floor2DCanvas from "@/components/Floor2DCanvas";

export default function DesignPage() {
  const [layout, setLayout] = useState<LayoutResult | null>(null);

  const handleSubmit = (data: FloorInput) => {
    const out = generateLayout(data);
    setLayout(out);
  };

  // nhận patch từ canvas và merge vào layout hiện có
  const handleRoomEdit = (
    id: string,
    patch: { x?: number; y?: number; w?: number; h?: number }
  ) => {
    setLayout((prev: LayoutResult | null) => {
      if (!prev) return prev;
      const rooms = prev.rooms.map((r): LayoutResult["rooms"][number] =>
        r.id === id ? { ...r, ...patch } : r
      );
      return { ...prev, rooms };
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl p-6">
        <FloorForm onSubmit={handleSubmit} />
        {layout && (
          <div className="mt-6 rounded-lg border shadow bg-white">
            <Floor2DCanvas
              layout={layout}
              onRoomEdit={handleRoomEdit}
              height="80vh"
            />
          </div>
        )}
      </div>
    </div>
  );
}
