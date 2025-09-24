import type { FloorInput, RoomType, Edge } from "@/components/FloorForm";
import axios from "axios";

export type PlacedDoor = { x1: number; y1: number; x2: number; y2: number };

export type PlacedRoom = {
  id: string;
  type: RoomType;
  x: number; // center (m)
  y: number; // center (m)
  w: number; // width  (m)
  h: number; // height (m)
  color: string;
  label: string;
  rawDoors?: { side: Edge; width: number; offsetRatio: number }[];
};

export interface RoomValidationResult {
  isValid: boolean;
  usableArea: number;
  requiredMinArea: number;
  shortage: number;
  efficiency: number;
  details: Array<{
    type: string;
    label: string;
    count: number;
    minAreaPerRoom: number;
    totalMinArea: number;
  }>;
}

export type LayoutResult = {
  floor: { width: number; height: number; mainDoor: PlacedDoor };
  rooms: PlacedRoom[];
  warnings: string[];
  validation?: RoomValidationResult;
};

interface RoomPresetsData {
  version: string;
  units: string;
  defaults: {
    voidRatio: number;
  };
  roomTypes: RoomPresetConfig[];
  allocationProfiles: {
    default: Record<string, number>;
  };
}

interface RoomPresetConfig {
  type: string;
  label: string;
  area: { min: number; max: number };
  color: string;
  presets: Array<{ w: number; h: number; area: number }>;
}

// Cache và dynamic VOID_RATIO
let cachedPresetsData: RoomPresetsData | null = null;
let VOID_RATIO = 0.15; // Sẽ được update từ JSON

const DOOR_W_MIN = 0.6;
const MIN_SIDE = 1;
const SHRINK_STEP = 0.95;

const ROOM_BASE: Record<
  RoomType,
  { area: number; aspect: number; color: string; label: string }
> = {
  living: { area: 20, aspect: 1.25, color: "#b3e5fc", label: "Phòng khách" },
  bed: { area: 14, aspect: 4 / 3.5, color: "#ffe082", label: "Phòng ngủ" },
  kitchen: { area: 9, aspect: 1.0, color: "#c8e6c9", label: "Bếp" },
  wc: { area: 4, aspect: 1.0, color: "#ffccbc", label: "WC" },
};

// Load room presets từ JSON
const loadRoomPresets = async (): Promise<RoomPresetsData | null> => {
  if (cachedPresetsData) return cachedPresetsData;
  
  try {
    const res = await axios.get<RoomPresetsData>("/room_preset.json");
    if (res.status === 200) {
      cachedPresetsData = res.data;
      
      // Update VOID_RATIO từ JSON
      if (cachedPresetsData.defaults?.voidRatio) {
        VOID_RATIO = cachedPresetsData.defaults.voidRatio;
      }
      
      return cachedPresetsData;
    }
    throw new Error(`Unexpected response: ${res.status}`);
  } catch (error) {
    console.warn("Could not load room presets, using fallback:", error);
    return null;
  }
};

// Get room config từ presets hoặc fallback
const getRoomConfig = (roomType: RoomType, presetsData?: RoomPresetsData | null) => {
  if (presetsData) {
    const config = presetsData.roomTypes.find(rt => rt.type === roomType);
    if (config) {
      return {
        area: config.area.min,
        aspect: 1.2,
        color: config.color.startsWith('#') ? config.color : `#${config.color}`,
        label: config.label,
        minArea: config.area.min,
        maxArea: config.area.max,
        presets: config.presets
      };
    }
  }
  
  // Fallback to ROOM_BASE
  return {
    area: ROOM_BASE[roomType]?.area || 10,
    aspect: ROOM_BASE[roomType]?.aspect || 1.2,
    color: ROOM_BASE[roomType]?.color || "#f5f5f5",
    label: ROOM_BASE[roomType]?.label || roomType,
    minArea: ROOM_BASE[roomType]?.area || 10,
    maxArea: ROOM_BASE[roomType]?.area * 2 || 20,
    presets: []
  };
};

// Count rooms by type
const countRoomsByType = (rooms: Array<{ type: RoomType }>): Array<{ type: RoomType; count: number }> => {
  const counts = rooms.reduce((acc, room) => {
    acc[room.type] = (acc[room.type] || 0) + 1;
    return acc;
  }, {} as Record<RoomType, number>);
  
  return Object.entries(counts).map(([type, count]) => ({ 
    type: type as RoomType, 
    count 
  }));
};

// Validate room area requirements
const validateRoomAreaRequirements = async (
  floorWidth: number,
  floorHeight: number,
  rooms: Array<{ type: RoomType; count?: number }>,
  voidRatio: number = VOID_RATIO,
  exteriorWallThickness: number = 0.2
): Promise<RoomValidationResult> => {
  const presetsData = await loadRoomPresets();
  
  // Tính usable area
  const innerWidth = floorWidth - (2 * exteriorWallThickness);
  const innerHeight = floorHeight - (2 * exteriorWallThickness);
  const innerArea = Math.max(0, innerWidth * innerHeight);
  const usableArea = innerArea * (1 - voidRatio);
  
  let totalRequiredArea = 0;
  const details: RoomValidationResult['details'] = [];
  
  // Tính tổng diện tích minimum
  for (const roomReq of rooms) {
    const count = roomReq.count || 1;
    const roomConfig = getRoomConfig(roomReq.type, presetsData);
    const minAreaPerRoom = roomConfig.minArea;
    const totalMinArea = minAreaPerRoom * count;
    
    totalRequiredArea += totalMinArea;
    
    details.push({
      type: roomReq.type,
      label: roomConfig.label,
      count,
      minAreaPerRoom,
      totalMinArea
    });
  }
  
  const shortage = Math.max(0, totalRequiredArea - usableArea);
  const isValid = shortage === 0;
  const efficiency = usableArea > 0 ? (totalRequiredArea / usableArea) * 100 : 0;
  
  return {
    isValid,
    usableArea,
    requiredMinArea: totalRequiredArea,
    shortage,
    efficiency,
    details
  };
};

// Export validation function
export const validateBeforeGenerate = async (input: FloorInput): Promise<RoomValidationResult> => {
  const { width: floorW, height: floorH } = input.floor;
  const rooms = input.rooms ?? [];
  const exteriorWallThickness = input.walls?.exteriorThickness ?? 0.2;
  
  const roomCounts = countRoomsByType(rooms);
  return validateRoomAreaRequirements(
    floorW, 
    floorH, 
    roomCounts, 
    VOID_RATIO, 
    exteriorWallThickness
  );
};

const rectsOverlap = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
) => {
  return !(
    a.x + a.w / 2 <= b.x - b.w / 2 ||
    a.x - a.w / 2 >= b.x + b.w / 2 ||
    a.y + a.h / 2 <= b.y - b.h / 2 ||
    a.y - a.h / 2 >= b.y + b.h / 2
  );
};

const mainDoorToLine = (
  floorW: number,
  floorH: number,
  edge: Edge,
  offset: number,
  width: number
): PlacedDoor => {
  const halfW = floorW / 2,
    halfH = floorH / 2;
  const maxAlong = edge === "N" || edge === "S" ? floorW : floorH;
  const clampedWidth = Math.max(DOOR_W_MIN, Math.min(width, maxAlong));
  const clampedOffset = Math.max(0, Math.min(offset, maxAlong - clampedWidth));

  if (edge === "S") {
    const x = -halfW + clampedOffset + clampedWidth / 2;
    return {
      x1: x - clampedWidth / 2,
      y1: -halfH,
      x2: x + clampedWidth / 2,
      y2: -halfH,
    };
  }
  if (edge === "N") {
    const x = -halfW + clampedOffset + clampedWidth / 2;
    return {
      x1: x - clampedWidth / 2,
      y1: halfH,
      x2: x + clampedWidth / 2,
      y2: halfH,
    };
  }
  if (edge === "E") {
    const y = -halfH + clampedOffset + clampedWidth / 2;
    return {
      x1: halfW,
      y1: y - clampedWidth / 2,
      x2: halfW,
      y2: y + clampedWidth / 2,
    };
  }
  // W
  const y = -halfH + clampedOffset + clampedWidth / 2;
  return {
    x1: -halfW,
    y1: y - clampedWidth / 2,
    x2: -halfW,
    y2: y + clampedWidth / 2,
  };
};

const idealCornerCenterUsable = (
  usableW: number,
  usableH: number,
  corner: "NW" | "NE" | "SW" | "SE",
  w: number,
  h: number
) => {
  const halfW = usableW / 2,
    halfH = usableH / 2;
  if (corner === "NW") return { x: -halfW + w / 2, y: halfH - h / 2 };
  if (corner === "NE") return { x: halfW - w / 2, y: halfH - h / 2 };
  if (corner === "SW") return { x: -halfW + w / 2, y: -halfH + h / 2 };
  return { x: halfW - w / 2, y: -halfH + h / 2 };
};

// Enhanced tryFixedLayout với presets
const tryFixedLayout = async (input: FloorInput): Promise<LayoutResult | null> => {
  const { width: floorW, height: floorH, mainDoor } = input.floor;
  const rooms = input.rooms ?? [];
  const exteriorWallThickness = input.walls?.exteriorThickness ?? 0.15;

  // Load presets data
  const presetsData = await loadRoomPresets();

  // Case 1: Nhà ống 20×5m (cửa Tây)
  if (floorW === 20 && floorH === 5 && mainDoor.edge === "W") {
    const roomCounts = rooms.reduce((acc, r) => {
      acc[r.type] = (acc[r.type] || 0) + 1;
      return acc;
    }, {} as Record<RoomType, number>);

    if (
      roomCounts.bed === 2 &&
      roomCounts.wc === 2 &&
      roomCounts.kitchen === 1 &&
      roomCounts.living === 1
    ) {
      const roomsByType = rooms.reduce((acc, r) => {
        if (!acc[r.type]) acc[r.type] = [];
        acc[r.type].push(r);
        return acc;
      }, {} as Record<RoomType, typeof rooms>);

      const offsetX = exteriorWallThickness;

      const placed: PlacedRoom[] = [
        {
          id: roomsByType.living[0].id,
          type: "living",
          x: -7.0 + offsetX,
          y: 0,
          w: 6.0,
          h: 5.0 - 2 * exteriorWallThickness,
          color: getRoomConfig("living", presetsData).color,
          label: getRoomConfig("living", presetsData).label,
        },
        {
          id: roomsByType.kitchen[0].id,
          type: "kitchen",
          x: 8.25 + offsetX,
          y: 0.75,
          w: 3.5,
          h: 3.5,
          color: getRoomConfig("kitchen", presetsData).color,
          label: getRoomConfig("kitchen", presetsData).label,
        },
        {
          id: roomsByType.bed[0].id,
          type: "bed",
          x: -1.5 + offsetX,
          y: -0.75,
          w: 5.0,
          h: 3.5,
          color: getRoomConfig("bed", presetsData).color,
          label: `${getRoomConfig("bed", presetsData).label} 1`,
        },
        {
          id: roomsByType.bed[1].id,
          type: "bed",
          x: 5.0 + offsetX,
          y: -0.75,
          w: 3.0,
          h: 3.5,
          color: getRoomConfig("bed", presetsData).color,
          label: `${getRoomConfig("bed", presetsData).label} 2`,
        },
        {
          id: roomsByType.wc[0].id,
          type: "wc",
          x: 2.25 + offsetX,
          y: -0.75,
          w: 2.5,
          h: 3.5,
          color: getRoomConfig("wc", presetsData).color,
          label: `${getRoomConfig("wc", presetsData).label} 1`,
        },
        {
          id: roomsByType.wc[1].id,
          type: "wc",
          x: 8.25 + offsetX,
          y: -1.75,
          w: 3.5,
          h: 1.5,
          color: getRoomConfig("wc", presetsData).color,
          label: `${getRoomConfig("wc", presetsData).label} 2`,
        },
      ];

      const byId = new Map(rooms.map((r) => [r.id, r]));
      for (const p of placed) {
        const src = byId.get(p.id);
        if (src?.doors?.length) {
          p.rawDoors = src.doors.map((d) => ({
            side: d.side,
            width: d.width,
            offsetRatio: d.offsetRatio,
          }));
        }
      }

      return {
        floor: {
          width: floorW,
          height: floorH,
          mainDoor: mainDoorToLine(
            floorW,
            floorH,
            mainDoor.edge,
            mainDoor.offset,
            mainDoor.width
          ),
        },
        rooms: placed,
        warnings: [],
      };
    }
  }

  return null;
};

// ✅ Main generateLayout function - BỎ early return khi validation fail
const generateLayout = async (
  input: FloorInput, 
  skipValidation: boolean = false
): Promise<LayoutResult> => {
  // Load presets data
  const presetsData = await loadRoomPresets();
  
  // ✅ Validation step - CHỈ tính toán, KHÔNG early return
  let validation: RoomValidationResult | undefined;
  
  if (!skipValidation) {
    try {
      const { width: floorW, height: floorH } = input.floor;
      const rooms = input.rooms ?? [];
      const exteriorWallThickness = input.walls?.exteriorThickness ?? 0.2;
      
      const roomCounts = countRoomsByType(rooms);
      validation = await validateRoomAreaRequirements(
        floorW, 
        floorH, 
        roomCounts, 
        VOID_RATIO, 
        exteriorWallThickness
      );
      
      // ❌ BỎ early return - Không return khi validation fail
      
    } catch (error) {
      console.warn('Validation failed, proceeding with generation:', error);
    }
  }

  // Try fixed layout first
  const fixed = await tryFixedLayout(input);
  if (fixed) {
    return {
      ...fixed,
      validation
    };
  }

  const { width: floorW, height: floorH, mainDoor } = input.floor;
  const exteriorWallThickness = input.walls?.exteriorThickness ?? 0.2;

  const usableW = floorW - 2 * exteriorWallThickness;
  const usableH = floorH - 2 * exteriorWallThickness;

  const warnings: string[] = [];
  const placed: PlacedRoom[] = [];

  // Add validation warnings
  if (validation && validation.efficiency < 60) {
    warnings.push(`⚠️ Hiệu suất sử dụng thấp: ${validation.efficiency.toFixed(1)}%`);
  }
  if (validation && validation.efficiency > 90) {
    warnings.push(`⚠️ Hiệu suất sử dụng quá cao: ${validation.efficiency.toFixed(1)}% - có thể thiếu không gian lưu thông`);
  }

  const expanded = (input.rooms ?? []).map((r) => ({
    id: r.id,
    type: r.type,
  })) as {
    id: string;
    type: RoomType;
  }[];

  const usableArea = usableW * usableH * (1 - VOID_RATIO);
  
  // Use preset data cho sizing
  const desiredSum = expanded.reduce((s, r) => {
    const roomConfig = getRoomConfig(r.type, presetsData);
    return s + roomConfig.area;
  }, 0) || 1;
  
  const scale = Math.min(1, usableArea / desiredSum);

  const sized = expanded.map((r) => {
    const roomConfig = getRoomConfig(r.type, presetsData);
    const area = Math.max(MIN_SIDE * MIN_SIDE, roomConfig.area * scale);
    let w = Math.sqrt(area * roomConfig.aspect);
    let h = Math.max(MIN_SIDE, area / w);

    if (w > usableW) {
      w = Math.max(MIN_SIDE, usableW);
      h = Math.max(MIN_SIDE, area / w);
    }
    if (h > usableH) {
      h = Math.max(MIN_SIDE, usableH);
      w = Math.max(MIN_SIDE, area / h);
    }

    return {
      id: r.id,
      type: r.type,
      w,
      h,
      area,
      color: roomConfig.color,
      label: roomConfig.label,
    };
  });

  // Rest of placement logic
  const halfUsableW = usableW / 2;
  const halfUsableH = usableH / 2;

  const mdLine = mainDoorToLine(
    floorW,
    floorH,
    mainDoor.edge,
    mainDoor.offset,
    mainDoor.width
  );

  const mdCenter = {
    x: (mdLine.x1 + mdLine.x2) / 2,
    y: (mdLine.y1 + mdLine.y2) / 2,
  };

  const livingBase = sized.find((r) => r.type === "living");
  let livingRect:
    | {
        x: number;
        y: number;
        w: number;
        h: number;
        id: string;
        type: RoomType;
        color: string;
        label: string;
      }
    | undefined;

  if (livingBase) {
    let lx = 0,
      ly = 0;

    if (mainDoor.edge === "S") {
      ly = -halfUsableH + livingBase.h / 2;
      lx = Math.max(
        -halfUsableW + livingBase.w / 2,
        Math.min(halfUsableW - livingBase.w / 2, mdCenter.x)
      );
    } else if (mainDoor.edge === "N") {
      ly = halfUsableH - livingBase.h / 2;
      lx = Math.max(
        -halfUsableW + livingBase.w / 2,
        Math.min(halfUsableW - livingBase.w / 2, mdCenter.x)
      );
    } else if (mainDoor.edge === "E") {
      lx = halfUsableW - livingBase.w / 2;
      ly = Math.max(
        -halfUsableH + livingBase.h / 2,
        Math.min(halfUsableH - livingBase.h / 2, mdCenter.y)
      );
    } else {
      lx = -halfUsableW + livingBase.w / 2;
      ly = Math.max(
        -halfUsableH + livingBase.h / 2,
        Math.min(halfUsableH - livingBase.h / 2, mdCenter.y)
      );
    }

    livingRect = {
      ...livingBase,
      x: lx,
      y: ly,
      id: livingBase.id,
      type: "living",
      color: livingBase.color,
      label: livingBase.label,
    };
    placed.push({
      id: livingRect.id,
      type: "living",
      x: lx,
      y: ly,
      w: livingRect.w,
      h: livingRect.h,
      color: livingRect.color,
      label: livingRect.label,
    });
  }

  const overlapsPlaced = (cand: {
    x: number;
    y: number;
    w: number;
    h: number;
  }) =>
    placed.some((p) => rectsOverlap(cand, { x: p.x, y: p.y, w: p.w, h: p.h }));

  const tryPlaceCorner = (
    room: (typeof sized)[number],
    corner: "NW" | "NE" | "SW" | "SE"
  ) => {
    let w = room.w,
      h = room.h;
    for (let k = 0; k < 25; k++) {
      const tgt = idealCornerCenterUsable(usableW, usableH, corner, w, h);
      const cand = { x: tgt.x, y: tgt.y, w, h };
      const clash =
        (livingRect && rectsOverlap(cand, livingRect)) || overlapsPlaced(cand);
      if (!clash) {
        const roomConfig = getRoomConfig(room.type, presetsData);
        placed.push({
          id: room.id,
          type: room.type,
          x: cand.x,
          y: cand.y,
          w,
          h,
          color: roomConfig.color,
          label: roomConfig.label,
        });
        return true;
      }
      if (w > MIN_SIDE && h > MIN_SIDE) {
        w *= SHRINK_STEP;
        h *= SHRINK_STEP;
      } else {
        break;
      }
    }
    return false;
  };

  const tryPlaceAlongWall = (room: (typeof sized)[number]) => {
    const cands = [
      { x: -halfUsableW + room.w / 2, y: 0 }, // W
      { x: halfUsableW - room.w / 2, y: 0 }, // E
      { x: 0, y: -halfUsableH + room.h / 2 }, // S
      { x: 0, y: halfUsableH - room.h / 2 }, // N
    ];
    for (const c of cands) {
      const cand = { x: c.x, y: c.y, w: room.w, h: room.h };
      const clash =
        (livingRect && rectsOverlap(cand, livingRect)) || overlapsPlaced(cand);
      if (!clash) {
        const roomConfig = getRoomConfig(room.type, presetsData);
        placed.push({
          id: room.id,
          type: room.type,
          x: cand.x,
          y: c.y,
          w: room.w,
          h: room.h,
          color: roomConfig.color,
          label: roomConfig.label,
        });
        return true;
      }
    }
    return false;
  };

  const tryPlaceOnGrid = (room: (typeof sized)[number], step = 1.0) => {
    for (
      let y = -halfUsableH + room.h / 2;
      y <= halfUsableH - room.h / 2;
      y += step
    ) {
      for (
        let x = -halfUsableW + room.w / 2;
        x <= halfUsableW - room.w / 2;
        x += step
      ) {
        const cand = { x, y, w: room.w, h: room.h };
        const clash =
          (livingRect && rectsOverlap(cand, livingRect)) ||
          overlapsPlaced(cand);
        if (!clash) {
          const roomConfig = getRoomConfig(room.type, presetsData);
          placed.push({
            id: room.id,
            type: room.type,
            x,
            y,
            w: room.w,
            h: room.h,
            color: roomConfig.color,
            label: roomConfig.label,
          });
          return true;
        }
      }
    }
    return false;
  };

  const prio = (t: RoomType) =>
    t === "bed" ? 0 : t === "kitchen" ? 1 : t === "wc" ? 2 : 3;
  const others = livingBase
    ? sized.filter((r) => r.id !== livingBase.id)
    : sized;
  const othersSorted = [...others].sort((a, b) => prio(a.type) - prio(b.type));

  const cornerOrderByDoor: Record<Edge, ("NW" | "NE" | "SW" | "SE")[]> = {
    S: ["NW", "NE", "SW", "SE"],
    N: ["SW", "SE", "NW", "NE"],
    E: ["NW", "SW", "NE", "SE"],
    W: ["NE", "SE", "NW", "SW"],
  };
  const cornerOrder = cornerOrderByDoor[mainDoor.edge];

  for (const r of othersSorted) {
    let ok = false;
    for (const corner of cornerOrder) {
      if (tryPlaceCorner(r, corner)) {
        ok = true;
        break;
      }
    }
    if (!ok) ok = tryPlaceAlongWall(r);
    if (!ok) ok = tryPlaceOnGrid(r, 1.0);
    if (!ok) {
      const roomConfig = getRoomConfig(r.type, presetsData);
      warnings.push(`${roomConfig.label}: không thể đặt — bỏ qua.`);
    }
  }

  const byId = new Map((input.rooms ?? []).map((r) => [r.id, r]));
  for (const p of placed) {
    const src = byId.get(p.id);
    if (!src?.doors?.length) continue;
    p.rawDoors = src.doors.map((d) => ({
      side: d.side,
      width: d.width,
      offsetRatio: d.offsetRatio,
    }));
  }

  if (exteriorWallThickness > 0.3) {
    warnings.push(`⚠️ Tường ngoài ${exteriorWallThickness}m có thể quá dày`);
  }
  if (usableArea < desiredSum * 0.7) {
    warnings.push(`⚠️ Diện tích khả dụng có thể không đủ cho tất cả phòng`);
  }

  return {
    floor: { width: floorW, height: floorH, mainDoor: mdLine },
    rooms: placed,
    warnings,
    validation, // Include validation result
  };
};

export default generateLayout;