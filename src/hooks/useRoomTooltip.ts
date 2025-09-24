import { useState, useCallback } from "react";

export interface TooltipData {
  visible: boolean;
  x: number;
  y: number;
  roomName: string;
  width: number;
  height: number;
  interiorWallThickness?: number;
  exteriorWallThickness?: number;
}

export const useRoomTooltip = () => {
  const [tooltip, setTooltip] = useState<TooltipData>({
    visible: false,
    x: 0,
    y: 0,
    roomName: "",
    width: 0,
    height: 0,
    interiorWallThickness: 0,
    exteriorWallThickness: 0,
  });

  const showTooltip = useCallback(
    (
      x: number,
      y: number,
      roomName: string,
      width: number,
      height: number,
      interiorWallThickness?: number, 
      exteriorWallThickness?: number  
    ) => {
      setTooltip({
        visible: true,
        x,
        y,
        roomName,
        width,
        height,
        interiorWallThickness,
        exteriorWallThickness,
      });
    },
    []
  );

  const hideTooltip = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  const updateTooltipPosition = useCallback((x: number, y: number) => {
    setTooltip((prev) => ({ ...prev, x, y }));
  }, []);

  const updateTooltipContent = useCallback(
    (
      roomName: string,
      width: number,
      height: number,
      interiorWallThickness?: number,
      exteriorWallThickness?: number
    ) => {
      setTooltip((prev) => ({
        ...prev,
        roomName,
        width,
        height,
        interiorWallThickness,
        exteriorWallThickness,
      }));
    },
    []
  );

  return {
    tooltip,
    showTooltip,
    hideTooltip,
    updateTooltipPosition,
    updateTooltipContent,
  };
};