import type { FloorInput, RoomType, Edge } from "@/components/FloorForm";

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

export type LayoutResult = {
  floor: { width: number; height: number; mainDoor: PlacedDoor };
  rooms: PlacedRoom[];
  warnings: string[];
};

const VOID_RATIO = 0.15; // diện tích trống
const DOOR_W_MIN = 0.6; // cửa chính tối thiểu
const EDGE_MARGIN = 0.5; // cách mép tường (m)
const MIN_SIDE = 1; // cạnh nhỏ nhất (m)
const SHRINK_STEP = 0.95; // dùng khi co ở bước góc

const ROOM_BASE: Record<
  RoomType,
  { area: number; aspect: number; color: string; label: string }
> = {
  living: { area: 20, aspect: 1.25, color: "#b3e5fc", label: "Phòng khách" },
  bed: { area: 14, aspect: 4 / 3.5, color: "#ffe082", label: "Phòng ngủ" },
  kitchen: { area: 9, aspect: 1.0, color: "#c8e6c9", label: "Bếp" },
  wc: { area: 4, aspect: 1.0, color: "#ffccbc", label: "WC" },
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
  const maxAlong =
    edge === "N" || edge === "S"
      ? floorW - 2 * EDGE_MARGIN
      : floorH - 2 * EDGE_MARGIN;
  const clampedWidth = Math.max(DOOR_W_MIN, Math.min(width, maxAlong));
  const clampedOffset = Math.max(0, Math.min(offset, maxAlong - clampedWidth));

  if (edge === "S") {
    const x = -halfW + EDGE_MARGIN + clampedOffset + clampedWidth / 2;
    return {
      x1: x - clampedWidth / 2,
      y1: -halfH,
      x2: x + clampedWidth / 2,
      y2: -halfH,
    };
  }
  if (edge === "N") {
    const x = -halfW + EDGE_MARGIN + clampedOffset + clampedWidth / 2;
    return {
      x1: x - clampedWidth / 2,
      y1: halfH,
      x2: x + clampedWidth / 2,
      y2: halfH,
    };
  }
  if (edge === "E") {
    const y = -halfH + EDGE_MARGIN + clampedOffset + clampedWidth / 2;
    return {
      x1: halfW,
      y1: y - clampedWidth / 2,
      x2: halfW,
      y2: y + clampedWidth / 2,
    };
  }
  // W
  const y = -halfH + EDGE_MARGIN + clampedOffset + clampedWidth / 2;
  return {
    x1: -halfW,
    y1: y - clampedWidth / 2,
    x2: -halfW,
    y2: y + clampedWidth / 2,
  };
};

const idealCornerCenter = (
  floorW: number,
  floorH: number,
  corner: "NW" | "NE" | "SW" | "SE",
  w: number,
  h: number
) => {
  const halfW = floorW / 2,
    halfH = floorH / 2;
  if (corner === "NW")
    return { x: -halfW + EDGE_MARGIN + w / 2, y: halfH - EDGE_MARGIN - h / 2 };
  if (corner === "NE")
    return { x: halfW - EDGE_MARGIN - w / 2, y: halfH - EDGE_MARGIN - h / 2 };
  if (corner === "SW")
    return { x: -halfW + EDGE_MARGIN + w / 2, y: -halfH + EDGE_MARGIN + h / 2 };
  return { x: halfW - EDGE_MARGIN - w / 2, y: -halfH + EDGE_MARGIN + h / 2 };
};

function tryFixedLayout(input: FloorInput): LayoutResult | null {
  const { width: floorW, height: floorH, mainDoor } = input.floor;
  const rooms = input.rooms ?? [];

  // 🏠 Case 1: Nhà ống 10×5m (cửa Tây)
  if (floorW === 10 && floorH === 5 && mainDoor.edge === "W") {
    const roomMap = new Map(rooms.map((r) => [r.type, r]));
    if (
      roomMap.has("living") &&
      roomMap.has("bed") &&
      roomMap.has("kitchen") &&
      roomMap.has("wc")
    ) {
      const placed: PlacedRoom[] = [
        {
          id: roomMap.get("living")!.id,
          type: "living",
          x: -3.5,
          y: 0,
          w: 3.0,
          h: 5.0,
          color: ROOM_BASE.living.color,
          label: ROOM_BASE.living.label,
        },
        {
          id: roomMap.get("bed")!.id,
          type: "bed",
          x: 0,
          y: -0.75,
          w: 4.0,
          h: 3.5,
          color: ROOM_BASE.bed.color,
          label: `${ROOM_BASE.bed.label}`,
        },
        {
          id: roomMap.get("kitchen")!.id,
          type: "kitchen",
          x: 3.5,
          y: 1.0,
          w: 3.0,
          h: 3.0,
          color: ROOM_BASE.kitchen.color,
          label: ROOM_BASE.kitchen.label,
        },
        {
          id: roomMap.get("wc")!.id,
          type: "wc",
          x: 3.5,
          y: -1.5,
          w: 3.0,
          h: 2.0,
          color: ROOM_BASE.wc.color,
          label: ROOM_BASE.wc.label,
        },
      ];

      // Attach rawDoors
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

  // 🏠 Case 2: Nhà vuông 7×7m (cửa Bắc)
  if (floorW === 7 && floorH === 7 && mainDoor.edge === "N") {
    const roomMap = new Map(rooms.map((r) => [r.type, r]));
    if (
      roomMap.has("living") &&
      roomMap.has("bed") &&
      roomMap.has("kitchen") &&
      roomMap.has("wc")
    ) {
      const placed: PlacedRoom[] = [
        {
          id: roomMap.get("living")!.id,
          type: "living",
          x: 0,
          y: 2.25,
          w: 7.0,
          h: 2.5,
          color: ROOM_BASE.living.color,
          label: ROOM_BASE.living.label,
        },
        {
          id: roomMap.get("bed")!.id,
          type: "bed",
          x: -2.0,
          y: -1.25,
          w: 3.0,
          h: 4.5,
          color: ROOM_BASE.bed.color,
          label: `${ROOM_BASE.bed.label}`,
        },
        {
          id: roomMap.get("kitchen")!.id,
          type: "kitchen",
          x: 2.25,
          y: -0.5,
          w: 2.5,
          h: 3.0,
          color: ROOM_BASE.kitchen.color,
          label: ROOM_BASE.kitchen.label,
        },
        {
          id: roomMap.get("wc")!.id,
          type: "wc",
          x: 1.5,
          y: -2.75,
          w: 4.0,
          h: 1.5,
          color: ROOM_BASE.wc.color,
          label: ROOM_BASE.wc.label,
        },
      ];

      // Attach rawDoors
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

  return null; // Không khớp pattern → dùng heuristic
}

const generateLayout = (input: FloorInput): LayoutResult => {
  const fixed = tryFixedLayout(input);
  if (fixed) {
    console.log(
      "🏠 Sử dụng fixed layout cho:",
      input.floor.width,
      "×",
      input.floor.height
    );
    return fixed;
  }

  console.log("🔄 Fallback về heuristic layout");

  const { width: floorW, height: floorH, mainDoor } = input.floor;
  const warnings: string[] = [];
  const placed: PlacedRoom[] = [];

  const expanded = (input.rooms ?? []).map((r) => ({
    id: r.id,
    type: r.type,
  })) as {
    id: string;
    type: RoomType;
  }[];

  // scale sizes
  const usableArea = floorW * floorH * (1 - VOID_RATIO);
  const desiredSum =
    expanded.reduce((s, r) => s + ROOM_BASE[r.type].area, 0) || 1;
  const scale = Math.min(1, usableArea / desiredSum);

  const sized = expanded.map((r) => {
    const base = ROOM_BASE[r.type];
    const area = Math.max(MIN_SIDE * MIN_SIDE, base.area * scale);
    let w = Math.sqrt(area * base.aspect);
    let h = Math.max(MIN_SIDE, area / w);
    if (w > floorW - 2 * EDGE_MARGIN) {
      w = Math.max(MIN_SIDE, floorW - 2 * EDGE_MARGIN);
      h = Math.max(MIN_SIDE, area / w);
    }
    if (h > floorH - 2 * EDGE_MARGIN) {
      h = Math.max(MIN_SIDE, floorH - 2 * EDGE_MARGIN);
      w = Math.max(MIN_SIDE, area / h);
    }
    return {
      id: r.id,
      type: r.type,
      w,
      h,
      area,
      color: base.color,
      label: base.label,
    };
  });

  const halfW = floorW / 2,
    halfH = floorH / 2;

  // main door (không tạo strip)
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
      ly = -halfH + EDGE_MARGIN + livingBase.h / 2;
      lx = Math.max(
        -halfW + EDGE_MARGIN + livingBase.w / 2,
        Math.min(halfW - EDGE_MARGIN - livingBase.w / 2, mdCenter.x)
      );
    } else if (mainDoor.edge === "N") {
      ly = halfH - EDGE_MARGIN - livingBase.h / 2;
      lx = Math.max(
        -halfW + EDGE_MARGIN + livingBase.w / 2,
        Math.min(halfW - EDGE_MARGIN - livingBase.w / 2, mdCenter.x)
      );
    } else if (mainDoor.edge === "E") {
      lx = halfW - EDGE_MARGIN - livingBase.w / 2;
      ly = Math.max(
        -halfH + EDGE_MARGIN + livingBase.h / 2,
        Math.min(halfH - EDGE_MARGIN - livingBase.h / 2, mdCenter.y)
      );
    } else {
      lx = -halfW + EDGE_MARGIN + livingBase.w / 2;
      ly = Math.max(
        -halfH + EDGE_MARGIN + livingBase.h / 2,
        Math.min(halfH - EDGE_MARGIN - livingBase.h / 2, mdCenter.y)
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

  // priority: kitchen -> bed -> wc -> living (living đã đặt)
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

  const overlapsPlaced = (cand: {
    x: number;
    y: number;
    w: number;
    h: number;
  }) =>
    placed.some((p) => rectsOverlap(cand, { x: p.x, y: p.y, w: p.w, h: p.h }));

  function tryPlaceCorner(
    room: (typeof sized)[number],
    corner: "NW" | "NE" | "SW" | "SE"
  ) {
    let w = room.w,
      h = room.h;
    for (let k = 0; k < 25; k++) {
      const tgt = idealCornerCenter(floorW, floorH, corner, w, h);
      const cand = { x: tgt.x, y: tgt.y, w, h };
      const clash =
        (livingRect && rectsOverlap(cand, livingRect)) || overlapsPlaced(cand);
      if (!clash) {
        placed.push({
          id: room.id,
          type: room.type,
          x: cand.x,
          y: cand.y,
          w,
          h,
          color: ROOM_BASE[room.type].color,
          label: ROOM_BASE[room.type].label,
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
  }

  function tryPlaceAlongWall(room: (typeof sized)[number]) {
    const cands = [
      { x: -halfW + EDGE_MARGIN + room.w / 2, y: 0 }, // W
      { x: halfW - EDGE_MARGIN - room.w / 2, y: 0 }, // E
      { x: 0, y: -halfH + EDGE_MARGIN + room.h / 2 }, // S
      { x: 0, y: halfH - EDGE_MARGIN - room.h / 2 }, // N
    ];
    for (const c of cands) {
      const cand = { x: c.x, y: c.y, w: room.w, h: room.h };
      const clash =
        (livingRect && rectsOverlap(cand, livingRect)) || overlapsPlaced(cand);
      if (!clash) {
        placed.push({
          id: room.id,
          type: room.type,
          x: cand.x,
          y: c.y,
          w: room.w,
          h: room.h,
          color: ROOM_BASE[room.type].color,
          label: ROOM_BASE[room.type].label,
        });
        return true;
      }
    }
    return false;
  }

  function tryPlaceOnGrid(room: (typeof sized)[number], step = 1.0) {
    for (
      let y = -halfH + EDGE_MARGIN + room.h / 2;
      y <= halfH - EDGE_MARGIN - room.h / 2;
      y += step
    ) {
      for (
        let x = -halfW + EDGE_MARGIN + room.w / 2;
        x <= halfW - EDGE_MARGIN - room.w / 2;
        x += step
      ) {
        const cand = { x, y, w: room.w, h: room.h };
        const clash =
          (livingRect && rectsOverlap(cand, livingRect)) ||
          overlapsPlaced(cand);
        if (!clash) {
          placed.push({
            id: room.id,
            type: room.type,
            x,
            y,
            w: room.w,
            h: room.h,
            color: ROOM_BASE[room.type].color,
            label: ROOM_BASE[room.type].label,
          });
          return true;
        }
      }
    }
    return false;
  }

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
    if (!ok)
      warnings.push(`${ROOM_BASE[r.type].label}: không thể đặt — bỏ qua.`);
  }

  // attach rawDoors từ form (nếu có)
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

  return {
    floor: { width: floorW, height: floorH, mainDoor: mdLine },
    rooms: placed,
    warnings,
  };
};

export default generateLayout;
