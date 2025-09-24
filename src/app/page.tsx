"use client";

import { useState, useRef } from "react";
import { toast } from "react-toastify"; // ✅ Thêm import
import FloorForm, { type FloorInput } from "@/components/FloorForm";
import generateLayout, {
  type LayoutResult,
  validateBeforeGenerate, // ✅ Thêm import validation
} from "@/utils/GenerateLayout";
import Floor2DCanvas, { type Floor2DHandle } from "@/components/Floor2DCanvas";

function DesignPage() {
  const [layout, setLayout] = useState<LayoutResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const canvasRef = useRef<Floor2DHandle>(null);

  const handleSubmit = async (data: FloorInput) => {
    setIsGenerating(true);

    try {
      const validation = await validateBeforeGenerate(data);

      if (!validation.isValid) {
        toast.error(
          `Không đủ diện tích để tạo ${data.rooms?.length || 0} phòng!`,
          {
            position: "top-right",
            autoClose: 8000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
            style: {
              whiteSpace: "pre-line",
              maxWidth: "450px",
            },
          }
        );

        return;
      }

      const out = await generateLayout(data, true);
      setLayout(out);
    } catch (error) {
      console.error("❌ Generation failed:", error);
      toast.error("Có lỗi xảy ra khi tạo thiết kế!");
    } finally {
      setIsGenerating(false);
    }
  };

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
        <FloorForm onSubmit={handleSubmit} canvasRef={canvasRef} />

        {/* ✅ Loading indicator */}
        {isGenerating && (
          <div className="mt-6 rounded-lg border shadow bg-white p-6 text-center">
            <div className="animate-spin w-6 h-6 border-3 border-blue-500 border-t-transparent rounded-full mx-auto mb-3"></div>
            <div className="text-gray-600">
              Đang validate và tạo thiết kế...
            </div>
          </div>
        )}

        {layout && !isGenerating && (
          <div className="mt-6 rounded-lg border shadow bg-white">
            <Floor2DCanvas
              ref={canvasRef}
              layout={layout}
              onRoomEdit={handleRoomEdit}
              showWalls={true}
              exteriorWallThickness={0.2}
              interiorWallThickness={0.1}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default DesignPage;
