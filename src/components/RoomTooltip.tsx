import React from "react";
import type { TooltipData } from "@/hooks/useRoomTooltip";

interface RoomTooltipProps {
  data: TooltipData;
  showArea?: boolean;
  className?: string;
  containerRef?: React.RefObject<HTMLDivElement | null>; // ✅ Sửa type để chấp nhận null
}

const RoomTooltip: React.FC<RoomTooltipProps> = ({
  data,
  showArea = false,
  className = "",
  containerRef,
}) => {
  if (!data.visible) return null;

  const area = data.width * data.height;

  const getTooltipPosition = () => {
    const tooltipWidth = 200;
    const tooltipHeight = 120;
    const padding = 10;

    const containerRect = containerRef?.current?.getBoundingClientRect();
    const containerX = containerRect?.left || 0;
    const containerY = containerRect?.top || 0;

    const globalX = data.x + containerX;
    const globalY = data.y + containerY;

    let left = globalX + padding - 40;
    let top = globalY - padding - 10;
    let transform = "translateY(-100%)";

    if (left + tooltipWidth > window.innerWidth) {
      left = globalX - tooltipWidth - padding;
    }

    if (globalY - tooltipHeight < 0) {
      top = globalY + padding;
      transform = "translateY(0%)";
    }

    return { left, top, transform };
  };

  const position = getTooltipPosition();

  return (
    <div
      className={`fixed z-[99999] rounded-lg bg-gray-900/95 backdrop-blur-sm px-3 py-2.5 text-sm text-white shadow-xl border border-gray-700/50 pointer-events-none ${className}`}
      style={{
        left: position.left,
        top: position.top,
        transform: position.transform,
        minWidth: "180px",
        maxWidth: "220px",
      }}
    >
      <div className="space-y-1 text-xs text-gray-200">
        <div className="flex justify-between items-center">
          <span className="text-gray-300">Kích thước:</span>
          <span className="font-mono">
            {data.width.toFixed(2)}m × {data.height.toFixed(2)}m
          </span>
        </div>

        {showArea && (
          <div className="flex justify-between items-center">
            <span className="text-gray-300">Diện tích:</span>
            <span className="font-mono font-medium text-blue-300">
              {area.toFixed(2)}m²
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default RoomTooltip;
