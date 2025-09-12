"use client";

import React, { useMemo, useState } from "react";

export type Edge = "N" | "E" | "S" | "W";
export type RoomType = "living" | "kitchen" | "bed" | "wc";

export interface DoorInput {
  id: string;
  side: Edge;
  width: number;
  offsetRatio: number;
}

export interface RoomInput {
  id: string;
  type: RoomType;
  doors: DoorInput[];
}

export interface FloorInput {
  floor: {
    width: number;
    height: number;
    mainDoor: { edge: Edge; offset: number; width: number };
  };
  rooms: RoomInput[];
}

interface Props {
  onSubmit: (data: FloorInput) => void;
}

const edges: Edge[] = ["N", "E", "S", "W"];
const edgeLabels: Record<Edge, string> = {
  N: "Bắc (N)",
  E: "Đông (E)",
  S: "Nam (S)",
  W: "Tây (W)",
};

const roomTypes: { value: RoomType; label: string; icon: string }[] = [
  { value: "living", label: "Phòng khách", icon: "🛋️" },
  { value: "kitchen", label: "Bếp", icon: "🍳" },
  { value: "bed", label: "Phòng ngủ", icon: "🛏️" },
  { value: "wc", label: "Nhà vệ sinh", icon: "🚿" },
];
const uid = () => Math.random().toString(36).slice(2, 10);

export default function FloorForm({ onSubmit }: Props) {
  // Sàn & cửa chính - SỬA: dùng string thay vì number
  const [width, setWidth] = useState<string>("10");
  const [height, setHeight] = useState<string>("5");
  const [mainEdge, setMainEdge] = useState<Edge>("N");
  const [mainOffset, setMainOffset] = useState<string>("2");
  const [mainWidth, setMainWidth] = useState<string>("1");

  // Danh sách phòng
  const [rooms, setRooms] = useState<RoomInput[]>([]);

  // Validate cơ bản
  const errors = useMemo(() => {
    const e: string[] = [];
    const w = parseFloat(width);
    const h = parseFloat(height);
    const mw = parseFloat(mainWidth);
    const mo = parseFloat(mainOffset);

    if (!Number.isFinite(w) || w <= 0) e.push("Chiều ngang sàn phải lớn hơn 0");
    if (!Number.isFinite(h) || h <= 0) e.push("Chiều dọc sàn phải lớn hơn 0");
    if (!Number.isFinite(mw) || mw < 0.6)
      e.push("Bề rộng cửa chính tối thiểu 0.6m");
    if (!Number.isFinite(mo) || mo < 0) e.push("Vị trí cửa chính phải ≥ 0");

    rooms.forEach((r, i) => {
      if (!r.type) e.push(`Phòng ${i + 1}: chưa chọn loại phòng`);
    });
    return e;
  }, [width, height, mainWidth, mainOffset, rooms]);

  /* ==== handlers ==== */
  const addRoom = () => {
    const id = `room_${uid()}`;
    setRooms((prev) => [...prev, { id, type: "living", doors: [] }]);
  };
  const removeRoom = (roomId: string) => {
    setRooms((prev) => prev.filter((r) => r.id !== roomId));
  };
  const updateRoom = (roomId: string, patch: Partial<RoomInput>) => {
    setRooms((prev) =>
      prev.map((r) => (r.id === roomId ? { ...r, ...patch } : r))
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (errors.length) return;

    // SỬA: parse sang number khi submit
    const data: FloorInput = {
      floor: {
        width: parseFloat(width),
        height: parseFloat(height),
        mainDoor: {
          edge: mainEdge,
          offset: parseFloat(mainOffset),
          width: parseFloat(mainWidth),
        },
      },
      rooms,
    };
    onSubmit?.(data);
  };

  // Safe helpers để tránh NaN
  const safeParseFloat = (value: string, fallback: number = 0): number => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const getDisplayArea = (): string => {
    const w = safeParseFloat(width);
    const h = safeParseFloat(height);
    return w > 0 && h > 0 ? (w * h).toFixed(1) : "--";
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold text-gray-900">
            🏠 Thiết kế bố cục sàn nhà
          </h1>
          <p className="text-gray-600">
            Nhập thông tin kích thước và bố trí phòng để tạo thiết kế
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Thông tin sàn */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
                📐
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Kích thước sàn & cửa chính
                </h2>
                <p className="text-sm text-gray-600">
                  Thiết lập kích thước tổng thể và vị trí cửa chính
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Kích thước sàn */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700">
                  Kích thước sàn
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-2 block text-sm text-gray-600">
                      Chiều ngang (m)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min={1}
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 transition"
                      placeholder="10"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm text-gray-600">
                      Chiều dọc (m)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min={1}
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 transition"
                      placeholder="8"
                    />
                  </div>
                </div>
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700">
                  💡 Diện tích:{" "}
                  <span className="text-blue-800 font-semibold">
                    {getDisplayArea()} m²
                  </span>
                </div>
              </div>

              {/* Cửa chính */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700">Cửa chính</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-2 block text-sm text-gray-600">
                      Hướng cửa
                    </label>
                    <select
                      value={mainEdge}
                      onChange={(e) => setMainEdge(e.target.value as Edge)}
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 transition"
                    >
                      {edges.map((e) => (
                        <option key={e} value={e} className="bg-white">
                          {edgeLabels[e]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm text-gray-600">
                      Bề rộng (m)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min={0.6}
                      value={mainWidth}
                      onChange={(e) => setMainWidth(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 transition"
                      placeholder="1"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm text-gray-600">
                    Vị trí trên cạnh (m)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    value={mainOffset}
                    onChange={(e) => setMainOffset(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 transition"
                    placeholder="2"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Phòng */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-600 text-white">
                  🏡
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Phòng</h2>
                  <p className="text-sm text-gray-600">
                    Thêm các phòng (không cấu hình cửa phòng)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={addRoom}
                className="flex items-center gap-2 rounded-lg bg-blue-600 hover:cursor-pointer hover:bg-blue-700 px-4 py-2.5 text-sm font-medium text-white shadow transition-colors"
              >
                <span>➕</span>
                Thêm phòng
              </button>
            </div>

            {rooms.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center">
                <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center text-2xl">
                  🏠
                </div>
                <p className="text-gray-600 mb-2">Chưa có phòng nào</p>
                <p className="text-sm text-gray-500">
                  Nhấn {'"Thêm phòng"'} để bắt đầu thiết kế
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {rooms.map((room, idx) => {
                  const roomType = roomTypes.find((t) => t.value === room.type);
                  return (
                    <div
                      key={room.id}
                      className="group rounded-lg border border-gray-200 bg-gray-50 p-5 hover:border-gray-300 hover:bg-white transition-all"
                    >
                      {/* Header phòng */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white font-bold">
                            {idx + 1}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{roomType?.icon}</span>
                            <select
                              value={room.type}
                              onChange={(e) =>
                                updateRoom(room.id, {
                                  type: e.target.value as RoomType,
                                })
                              }
                              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none transition"
                            >
                              {roomTypes.map((t) => (
                                <option
                                  key={t.value}
                                  value={t.value}
                                  className="bg-white"
                                >
                                  {t.icon} {t.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeRoom(room.id)}
                          className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-600 transition-colors hover:cursor-pointer hover:bg-red-100 hover:border-red-400"
                        >
                          🗑️ Xóa
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-red-600">
                <span>⚠️</span>
                <span className="font-medium">Cần khắc phục:</span>
              </div>
              <ul className="space-y-1 text-sm text-red-600">
                {errors.map((error, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 text-red-500">•</span>
                    <span>{error}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center justify-between rounded-lg bg-white shadow border p-6">
            <div className="text-sm text-gray-600">
              <p>
                ✅ Sàn:{" "}
                <span className="text-blue-600 font-semibold">
                  {width}×{height}m ({getDisplayArea()}m²)
                </span>
              </p>
              <p>
                ✅ Phòng:{" "}
                <span className="text-green-600 font-semibold">
                  {rooms.length} phòng
                </span>
              </p>
            </div>
            <button
              type="submit"
              disabled={errors.length > 0}
              className="flex items-center gap-3 rounded-lg bg-blue-600 hover:cursor-pointer hover:bg-blue-700 px-6 py-3 font-semibold text-white shadow transition-colors disabled:cursor-not-allowed disabled:bg-gray-400 disabled:opacity-50"
            >
              <span>🎯</span>
              Tạo thiết kế
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
