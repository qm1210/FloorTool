"use client";

import {
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
  useCallback,
} from "react";
import * as THREE from "three";
import type { LayoutResult } from "@/utils/GenerateLayout";

export type Floor2DHandle = {
  fitView: (padding?: number) => void;
  resetAndFit: (padding?: number) => void;
  resetCameraPan: () => void;
};

type Handle = "MOVE" | "N" | "E" | "S" | "W" | "NE" | "NW" | "SE" | "SW";
type Side = "N" | "E" | "S" | "W";

type Props = {
  layout: LayoutResult;
  onRoomEdit?: (
    id: string,
    patch: { x?: number; y?: number; w?: number; h?: number }
  ) => void;
  height?: number | string;
};

// ✅ Interface cho fitViewToFloor với min/max properties
interface FitViewToFloor {
  (padding?: number): void;
  _min?: number;
  _max?: number;
}

const Z_STEP = 0.0005;
const Z_BASE = 0.01;

const Floor2DCanvas = forwardRef<Floor2DHandle, Props>(
  ({ layout, onRoomEdit, height = "70vh" }, ref) => {
    const wrapRef = useRef<HTMLDivElement | null>(null);

    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
    const contentRef = useRef<THREE.Group | null>(null);
    const previousLayoutRef = useRef<LayoutResult | null>(null);
    const isRoomEditRef = useRef(false);

    const roomsRef = useRef<
      Array<{ id: string; mesh: THREE.Mesh; w: number; h: number }>
    >([]);
    const floorSizeRef = useRef({ w: 0, h: 0 });

    const zStackRef = useRef<string[]>([]);
    const zIndexMapRef = useRef<Map<string, number>>(new Map());

    const hoveredRoomIdRef = useRef<string | null>(null);
    const lastActiveRoomIdRef = useRef<string | null>(null);

    // ✅ THÊM STATE CHO CAMERA PAN
    const cameraPanRef = useRef<{
      isPanning: boolean;
      startPosition: { x: number; y: number };
      startCameraPosition: { x: number; y: number };
    } | null>(null);

    // drag / resize state
    const draggingRef = useRef<null | {
      r: { id: string; mesh: THREE.Mesh; w: number; h: number };
      offset: THREE.Vector3;
    }>(null);

    const dragModeRef = useRef<Handle>("MOVE");
    const anchorRef = useRef<{ x: number; y: number } | null>(null);
    const startSizeRef = useRef<{ w: number; h: number } | null>(null);

    const camScaleRef = useRef(50);
    const autoFitRef = useRef(true);

    const MIN_W = 0.9;
    const MIN_H = 0.9;
    const HANDLE_EPS = 0.05;
    const SNAP = 0.25;
    const WALL_EPS = SNAP * 0.5;

    const bringToFront = useCallback((roomId: string) => {
      if (!zStackRef.current.includes(roomId)) return;

      zStackRef.current = zStackRef.current.filter((id) => id !== roomId);
      zStackRef.current.push(roomId);

      zStackRef.current.forEach((id, index) => {
        zIndexMapRef.current.set(id, index);

        const room = roomsRef.current.find((r) => r.id === id);
        if (room) {
          const zPos = Z_BASE + index * Z_STEP;
          room.mesh.position.setZ(zPos);
          room.mesh.renderOrder = index;
        }
      });

      lastActiveRoomIdRef.current = roomId;
    }, []);

    const applyOrthoFromScale = useCallback(() => {
      const wrap = wrapRef.current,
        camera = cameraRef.current,
        renderer = rendererRef.current;
      if (!wrap || !camera || !renderer) return;
      const w = wrap.clientWidth,
        h = wrap.clientHeight || window.innerHeight,
        s = camScaleRef.current;
      camera.left = w / -s;
      camera.right = w / s;
      camera.top = h / s;
      camera.bottom = h / -s;
      camera.updateProjectionMatrix();
    }, []);

    const fitViewToFloor: FitViewToFloor = useCallback(
      (padding = 1.0) => {
        const wrap = wrapRef.current,
          camera = cameraRef.current;
        if (!wrap || !camera) return;
        const wpx = wrap.clientWidth,
          hpx = wrap.clientHeight || window.innerHeight;
        const halfX = floorSizeRef.current.w / 2 + padding;
        const halfY = floorSizeRef.current.h / 2 + padding;
        const next = Math.min(
          wpx / Math.max(halfX, 0.001),
          hpx / Math.max(halfY, 0.001)
        );
        const MAX = next * 4,
          MIN = next * 0.25;
        fitViewToFloor._min = MIN;
        fitViewToFloor._max = MAX;
        camScaleRef.current = next;
        // ✅ RESET CAMERA POSITION KHI FIT VIEW
        if (camera && !cameraPanRef.current?.isPanning) {
          camera.position.x = 0;
          camera.position.y = 0;
        }
        applyOrthoFromScale();
      },
      [applyOrthoFromScale]
    );

    const pickHandleLocal = useCallback(
      (localX: number, localY: number, w: number, h: number): Handle => {
        const halfW = w / 2,
          halfH = h / 2;

        if (
          Math.abs(localX) > halfW + HANDLE_EPS ||
          Math.abs(localY) > halfH + HANDLE_EPS
        ) {
          return "MOVE";
        }

        const nearL = Math.abs(localX + halfW) <= HANDLE_EPS;
        const nearR = Math.abs(localX - halfW) <= HANDLE_EPS;
        const nearB = Math.abs(localY + halfH) <= HANDLE_EPS;
        const nearT = Math.abs(localY - halfH) <= HANDLE_EPS;

        const inX = Math.abs(localX) <= halfW;
        const inY = Math.abs(localY) <= halfH;

        if (nearT && nearR) return "NE";
        if (nearT && nearL) return "NW";
        if (nearB && nearR) return "SE";
        if (nearB && nearL) return "SW";

        if (nearT && inX) return "N";
        if (nearB && inX) return "S";
        if (nearR && inY) return "E";
        if (nearL && inY) return "W";

        return "MOVE";
      },
      [HANDLE_EPS]
    );

    const cursorForHandle = useCallback((h: Handle) => {
      switch (h) {
        case "N":
        case "S":
          return "ns-resize";
        case "E":
        case "W":
          return "ew-resize";
        case "NE":
        case "SW":
          return "nesw-resize";
        case "NW":
        case "SE":
          return "nwse-resize";
        default:
          return h === "MOVE" ? "grab" : "default";
      }
    }, []);

    const positionDoorLocal = useCallback(
      (
        mesh: THREE.Mesh,
        doorMesh: THREE.Mesh,
        spec: { side: Side; width: number; offsetRatio: number }
      ) => {
        const geom = mesh.geometry as THREE.PlaneGeometry;
        const w: number = (
          geom as THREE.PlaneGeometry & {
            parameters: { width: number; height: number };
          }
        ).parameters.width;
        const h: number = (
          geom as THREE.PlaneGeometry & {
            parameters: { width: number; height: number };
          }
        ).parameters.height;

        const along = spec.side === "N" || spec.side === "S" ? w : h;
        const doorW = Math.max(0.6, Math.min(spec.width, along - 0.05));
        const maxOff = Math.max(0, along - doorW);
        const off = Math.max(0, Math.min(1, spec.offsetRatio)) * maxOff;

        let A: THREE.Vector3, B: THREE.Vector3;
        if (spec.side === "N") {
          const y = h / 2,
            x1 = -w / 2 + off;
          A = new THREE.Vector3(x1, y, 0.02);
          B = new THREE.Vector3(x1 + doorW, y, 0.02);
        } else if (spec.side === "S") {
          const y = -h / 2,
            x1 = -w / 2 + off;
          A = new THREE.Vector3(x1, y, 0.02);
          B = new THREE.Vector3(x1 + doorW, y, 0.02);
        } else if (spec.side === "E") {
          const x = w / 2,
            y1 = -h / 2 + off;
          A = new THREE.Vector3(x, y1, 0.02);
          B = new THREE.Vector3(x, y1 + doorW, 0.02);
        } else {
          const x = -w / 2,
            y1 = -h / 2 + off;
          A = new THREE.Vector3(x, y1, 0.02);
          B = new THREE.Vector3(x, y1 + doorW, 0.02);
        }

        const mid = new THREE.Vector3().addVectors(A, B).multiplyScalar(0.5);
        const dir = new THREE.Vector3().subVectors(B, A).normalize();
        const angle = Math.atan2(dir.y, dir.x);
        const doorLen = A.distanceTo(B);

        (doorMesh.geometry as THREE.PlaneGeometry).dispose?.();
        doorMesh.geometry = new THREE.PlaneGeometry(doorLen, 0.08);
        doorMesh.position.copy(mid);
        doorMesh.position.z = 0.021;
        doorMesh.rotation.z = angle;
        doorMesh.renderOrder = 2;
        doorMesh.userData.isDoor = true;
      },
      []
    );

    const roomFromHitObject = useCallback((obj: THREE.Object3D | null) => {
      let cur: THREE.Object3D | null = obj;
      while (cur && !(cur.userData as { roomId?: string }).roomId)
        cur = cur.parent;
      if (!cur) return null;
      return roomsRef.current.find((x) => x.mesh === cur);
    }, []);

    const findTopmostRoom = useCallback(
      (hits: THREE.Intersection[]) => {
        const hitRooms: {
          id: string;
          room: { id: string; mesh: THREE.Mesh; w: number; h: number };
          hit: THREE.Intersection;
        }[] = [];

        for (const hit of hits) {
          const room = roomFromHitObject(hit.object);
          if (room) {
            hitRooms.push({
              id: room.id,
              room: room,
              hit: hit,
            });
          }
        }

        if (hitRooms.length === 0) return null;

        hitRooms.sort((a, b) => {
          const zIndexA = zIndexMapRef.current.get(a.id) || 0;
          const zIndexB = zIndexMapRef.current.get(b.id) || 0;
          return zIndexB - zIndexA;
        });

        return {
          room: hitRooms[0].room,
          hit: hitRooms[0].hit,
        };
      },
      [roomFromHitObject]
    );

    const restoreZOrder = useCallback(() => {
      zStackRef.current = zStackRef.current.filter((id) =>
        roomsRef.current.some((r) => r.id === id)
      );

      for (const room of roomsRef.current) {
        if (!zStackRef.current.includes(room.id)) {
          zStackRef.current.push(room.id);
        }
      }

      zStackRef.current.forEach((id, index) => {
        zIndexMapRef.current.set(id, index);
        const room = roomsRef.current.find((r) => r.id === id);
        if (room) {
          const zPos = Z_BASE + index * Z_STEP;
          room.mesh.position.setZ(zPos);
          room.mesh.renderOrder = index;
        }
      });
    }, []);

    const getWorldPosition = useCallback(
      (evt: PointerEvent): THREE.Vector2 | null => {
        const camera = cameraRef.current;
        const renderer = rendererRef.current;
        if (!camera || !renderer) return null;

        const rect = renderer.domElement.getBoundingClientRect();
        const ndcX = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -((evt.clientY - rect.top) / rect.height) * 2 + 1;

        const worldX =
          (ndcX * (camera.right - camera.left)) / 2 + camera.position.x;
        const worldY =
          (ndcY * (camera.top - camera.bottom)) / 2 + camera.position.y;

        return new THREE.Vector2(worldX, worldY);
      },
      []
    );

    const resetCameraPan = useCallback(() => {
      cameraPanRef.current = null;
      autoFitRef.current = true;
      if (cameraRef.current) {
        cameraRef.current.position.x = 0;
        cameraRef.current.position.y = 0;
      }
      fitViewToFloor(1.0);
    }, [fitViewToFloor]);

    useImperativeHandle(
      ref,
      () => ({
        fitView: (padding = 1.0) => {
          fitViewToFloor(padding);
        },
        resetAndFit: (padding = 1.0) => {
          autoFitRef.current = true;
          fitViewToFloor(padding);
        },
        resetCameraPan,
      }),
      [fitViewToFloor, resetCameraPan]
    );

    useEffect(() => {
      const wrap = wrapRef.current;
      if (!wrap) return;

      // ✅ COPY REF VALUE ĐỂ TRÁNH WARNING
      const wrapElement = wrap;

      wrapElement.replaceChildren();

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xffffff);
      sceneRef.current = scene;

      const w = wrapElement.clientWidth;
      const h = wrapElement.clientHeight || window.innerHeight;

      const camera = new THREE.OrthographicCamera(
        w / -camScaleRef.current,
        w / camScaleRef.current,
        h / camScaleRef.current,
        h / -camScaleRef.current,
        -1000,
        1000
      );
      camera.position.set(0, 0, 10);
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.domElement.style.display = "block";
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      rendererRef.current = renderer;
      wrapElement.appendChild(renderer.domElement);

      // grid
      const grid = new THREE.GridHelper(200, 200, 0xdddddd, 0xdddddd);
      (grid as THREE.GridHelper & { rotation: THREE.Euler }).rotation.x =
        Math.PI / 2;
      const gridMat = grid.material as THREE.LineBasicMaterial;
      gridMat.transparent = true;
      gridMat.opacity = 0.45;
      scene.add(grid);

      const content = new THREE.Group();
      contentRef.current = content;
      scene.add(content);

      const onResize = () => {
        if (!wrapRef.current || !rendererRef.current) return;
        rendererRef.current.setSize(
          wrapRef.current.clientWidth,
          wrapRef.current.clientHeight || window.innerHeight
        );
        if (autoFitRef.current) fitViewToFloor();
        else applyOrthoFromScale();
      };
      window.addEventListener("resize", onResize);

      const onWheel = (e: WheelEvent) => {
        if (!rendererRef.current) return;
        e.preventDefault();
        const ZOOM_SPEED = 0.0015;
        const factor = Math.exp(-e.deltaY * ZOOM_SPEED);
        const min = fitViewToFloor._min ?? 5;
        const max = fitViewToFloor._max ?? 1000;
        camScaleRef.current = Math.min(
          max,
          Math.max(min, camScaleRef.current * factor)
        );
        autoFitRef.current = false;
        applyOrthoFromScale();
      };
      renderer.domElement.addEventListener("wheel", onWheel, {
        passive: false,
      });

      const ray = new THREE.Raycaster();
      const mouse = new THREE.Vector2();
      const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      const hit = new THREE.Vector3();

      const getMouseNDC = (evt: PointerEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
      };

      // ✅ SỬA ĐỔI HÀM onDown ĐỂ XỬ LÝ CAMERA PAN
      const onDown = (evt: PointerEvent) => {
        if (!cameraRef.current || !rendererRef.current) return;

        const element = rendererRef.current.domElement as HTMLElement & {
          setPointerCapture?: (pointerId: number) => void;
        };
        element.setPointerCapture?.(evt.pointerId);

        getMouseNDC(evt);
        ray.setFromCamera(mouse, cameraRef.current);

        // Raycast tất cả phòng
        const hits = ray.intersectObjects(
          roomsRef.current.map((r) => r.mesh),
          true
        );

        if (hits.length > 0) {
          // ✅ CÓ PHÒNG ĐƯỢC CLICK - XỬ LÝ ROOM INTERACTION
          const topmost = findTopmostRoom(hits);
          if (!topmost) return;

          const { room: r, hit: hitInfo } = topmost;
          bringToFront(r.id);

          const worldPoint = hitInfo.point.clone();
          const local = r.mesh.worldToLocal(worldPoint.clone());
          const handle = pickHandleLocal(local.x, local.y, r.w, r.h);
          dragModeRef.current = handle;

          if (!ray.ray.intersectPlane(planeZ, hit)) return;

          if (handle === "MOVE") {
            const offset = new THREE.Vector3().subVectors(r.mesh.position, hit);
            offset.z = r.mesh.position.z;
            draggingRef.current = { r, offset };
            document.body.style.cursor = "grabbing";
            rendererRef.current.domElement.style.cursor = "grabbing";
          } else {
            // Resize mode
            draggingRef.current = { r, offset: new THREE.Vector3() };
            startSizeRef.current = { w: r.w, h: r.h };

            const halfW = r.w / 2,
              halfH = r.h / 2;
            let ax = 0,
              ay = 0;
            switch (handle) {
              case "N":
                ax = 0;
                ay = -halfH;
                break;
              case "S":
                ax = 0;
                ay = halfH;
                break;
              case "E":
                ax = -halfW;
                ay = 0;
                break;
              case "W":
                ax = halfW;
                ay = 0;
                break;
              case "NE":
                ax = -halfW;
                ay = -halfH;
                break;
              case "NW":
                ax = halfW;
                ay = -halfH;
                break;
              case "SE":
                ax = -halfW;
                ay = halfH;
                break;
              case "SW":
                ax = halfW;
                ay = halfH;
                break;
            }
            const anchorLocal = new THREE.Vector3(ax, ay, 0);
            const anchorWorld = anchorLocal.applyMatrix4(r.mesh.matrixWorld);
            anchorRef.current = { x: anchorWorld.x, y: anchorWorld.y };

            const cur = cursorForHandle(handle);
            document.body.style.cursor = cur;
            rendererRef.current.domElement.style.cursor = cur;
          }
        } else {
          // ✅ KHÔNG CÓ PHÒNG NÀO - BẮT ĐẦU CAMERA PAN
          const worldPos = getWorldPosition(evt);
          if (worldPos) {
            cameraPanRef.current = {
              isPanning: true,
              startPosition: { x: evt.clientX, y: evt.clientY },
              startCameraPosition: {
                x: cameraRef.current.position.x,
                y: cameraRef.current.position.y,
              },
            };
            autoFitRef.current = false; // Tắt auto fit khi pan thủ công
            document.body.style.cursor = "move";
            rendererRef.current.domElement.style.cursor = "move";
          }
        }
      };

      // ✅ SỬA ĐỔI HÀM onMove ĐỂ XỬ LÝ CAMERA PAN
      const onMove = (evt: PointerEvent) => {
        if (!cameraRef.current || !rendererRef.current) return;

        // ✅ XỬ LÝ CAMERA PAN
        if (cameraPanRef.current?.isPanning) {
          const deltaX = evt.clientX - cameraPanRef.current.startPosition.x;
          const deltaY = evt.clientY - cameraPanRef.current.startPosition.y;

          // Chuyển đổi pixel movement thành world movement
          const camera = cameraRef.current;
          const wrap = wrapRef.current!;
          const worldDeltaX =
            (deltaX / wrap.clientWidth) * (camera.right - camera.left);
          const worldDeltaY =
            -(deltaY / wrap.clientHeight) * (camera.top - camera.bottom);

          // Cập nhật vị trí camera
          camera.position.x =
            cameraPanRef.current.startCameraPosition.x - worldDeltaX;
          camera.position.y =
            cameraPanRef.current.startCameraPosition.y - worldDeltaY;

          return;
        }

        getMouseNDC(evt);
        ray.setFromCamera(mouse, cameraRef.current);

        // Khi CHƯA kéo: chỉ set cursor chính xác theo handle
        if (!draggingRef.current) {
          const hits = ray.intersectObjects(
            roomsRef.current.map((r) => r.mesh),
            true
          );

          if (hits.length) {
            const topmost = findTopmostRoom(hits);
            if (topmost) {
              const { room: r, hit: hitInfo } = topmost;

              if (hoveredRoomIdRef.current !== r.id) {
                hoveredRoomIdRef.current = r.id;
                bringToFront(r.id);
              }

              const worldPoint = hitInfo.point.clone();
              const local = r.mesh.worldToLocal(worldPoint);
              const h = pickHandleLocal(local.x, local.y, r.w, r.h);
              rendererRef.current.domElement.style.cursor = cursorForHandle(h);
              return;
            }
          }

          hoveredRoomIdRef.current = null;
          rendererRef.current.domElement.style.cursor = "default";
          return;
        }

        // ĐANG kéo phòng
        if (!ray.ray.intersectPlane(planeZ, hit)) return;

        const mode = dragModeRef.current;
        const ctx = draggingRef.current!;
        const { r, offset } = ctx;

        if (mode === "MOVE") {
          const target = new THREE.Vector3().addVectors(hit, offset);

          const halfW = floorSizeRef.current.w / 2,
            halfH = floorSizeRef.current.h / 2;
          const w2 = r.w / 2,
            h2 = r.h / 2;

          let nx = Math.max(-halfW + w2, Math.min(halfW - w2, target.x));
          let ny = Math.max(-halfH + h2, Math.min(halfH - h2, target.y));

          nx = Math.round(nx / SNAP) * SNAP;
          ny = Math.round(ny / SNAP) * SNAP;

          const right = halfW - w2,
            left = -halfW + w2,
            top = halfH - h2,
            bot = -halfH + h2;
          if (Math.abs(nx - right) < WALL_EPS) nx = right;
          if (Math.abs(nx - left) < WALL_EPS) nx = left;
          if (Math.abs(ny - top) < WALL_EPS) ny = top;
          if (Math.abs(ny - bot) < WALL_EPS) ny = bot;

          r.mesh.position.set(nx, ny, r.mesh.position.z);
          return;
        }

        // RESIZE logic
        const anchor = anchorRef.current!;
        const dx = hit.x - anchor.x;
        const dy = hit.y - anchor.y;

        let newW = startSizeRef.current!.w;
        let newH = startSizeRef.current!.h;

        const sgnX = mode.includes("E") ? 1 : mode.includes("W") ? -1 : 0;
        const sgnY = mode.includes("N") ? 1 : mode.includes("S") ? -1 : 0;

        if (sgnX !== 0) newW = Math.max(MIN_W, Math.abs(dx));
        if (sgnY !== 0) newH = Math.max(MIN_H, Math.abs(dy));

        newW = Math.max(MIN_W, Math.round(newW / SNAP) * SNAP);
        newH = Math.max(MIN_H, Math.round(newH / SNAP) * SNAP);

        let cx = anchor.x + (sgnX * newW) / 2;
        let cy = anchor.y + (sgnY * newH) / 2;

        const halfW = floorSizeRef.current.w / 2,
          halfH = floorSizeRef.current.h / 2;
        const left = -halfW + newW / 2,
          right = halfW - newW / 2;
        const bottom = -halfH + newH / 2,
          top = halfH - newH / 2;
        cx = Math.min(Math.max(cx, left), right);
        cy = Math.min(Math.max(cy, bottom), top);

        r.mesh.position.set(cx, cy, r.mesh.position.z);

        (r.mesh.geometry as THREE.PlaneGeometry).dispose();
        const newGeom = new THREE.PlaneGeometry(newW, newH);
        r.mesh.geometry = newGeom;

        const frame = r.mesh.userData.frame as THREE.LineSegments | undefined;
        if (frame) {
          (frame.geometry as THREE.EdgesGeometry)?.dispose?.();
          frame.geometry = new THREE.EdgesGeometry(newGeom);
        }

        const doorMeshes: THREE.Mesh[] | undefined = r.mesh.userData.doors;
        if (doorMeshes && doorMeshes.length) {
          for (const dm of doorMeshes) {
            const spec = dm.userData.spec as {
              side: Side;
              width: number;
              offsetRatio: number;
            };
            if (spec) positionDoorLocal(dm.parent as THREE.Mesh, dm, spec);
          }
        }

        r.w = newW;
        r.h = newH;
      };

      const onUp = (evt?: PointerEvent) => {
        const element = rendererRef.current?.domElement as HTMLElement & {
          releasePointerCapture?: (pointerId: number) => void;
        };
        if (evt?.pointerId !== undefined) {
          element?.releasePointerCapture?.(evt.pointerId);
        }

        // ✅ KẾT THÚC CAMERA PAN
        if (cameraPanRef.current?.isPanning) {
          cameraPanRef.current = null;
          document.body.style.cursor = "default";
          if (rendererRef.current)
            rendererRef.current.domElement.style.cursor = "default";
          return;
        }

        // ✅ KẾT THÚC ROOM DRAG/RESIZE
        const dragging = draggingRef.current;
        if (dragging && onRoomEdit) {
          const { r } = dragging;
          onRoomEdit(r.id, {
            x: r.mesh.position.x,
            y: r.mesh.position.y,
            w: r.w,
            h: r.h,
          });

          lastActiveRoomIdRef.current = r.id;
        }

        draggingRef.current = null;
        dragModeRef.current = "MOVE";
        document.body.style.cursor = "default";
        if (rendererRef.current)
          rendererRef.current.domElement.style.cursor = "default";
      };

      renderer.domElement.addEventListener("pointerdown", onDown);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);

      let raf = 0;
      const loop = () => {
        raf = requestAnimationFrame(loop);
        renderer.render(scene, camera);
      };
      loop();

      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", onResize);
        renderer.domElement.removeEventListener("wheel", onWheel);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        renderer.domElement.removeEventListener("pointerdown", onDown);

        scene.traverse((o) => {
          const m = o as THREE.Mesh;
          m.geometry?.dispose?.();
          const mat = m.material as
            | THREE.Material
            | THREE.Material[]
            | undefined;
          if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose?.());
          else mat?.dispose?.();
          if (o.type === "Sprite") {
            const sprite = o as THREE.Sprite;
            const spriteMat = sprite.material as THREE.SpriteMaterial;
            spriteMat.map?.dispose?.();
          }
        });

        renderer.dispose();
        rendererRef.current = null;
        sceneRef.current = null;
        cameraRef.current = null;
        contentRef.current = null;
        roomsRef.current = [];
        draggingRef.current = null;
        cameraPanRef.current = null;

        // ✅ SỬ DỤNG WRAP ELEMENT ĐÃ COPY
        if (wrapElement) wrapElement.replaceChildren();
      };
    }, [
      fitViewToFloor,
      applyOrthoFromScale,
      findTopmostRoom,
      bringToFront,
      pickHandleLocal,
      cursorForHandle,
      getWorldPosition,
      positionDoorLocal,
      onRoomEdit,
      WALL_EPS,
    ]);

    useEffect(() => {
      const content = contentRef.current;
      if (!content) return;

      const isRoomEdit =
        previousLayoutRef.current &&
        previousLayoutRef.current.floor.width === layout.floor.width &&
        previousLayoutRef.current.floor.height === layout.floor.height &&
        previousLayoutRef.current.rooms.length === layout.rooms.length;

      isRoomEditRef.current = Boolean(isRoomEdit);
      previousLayoutRef.current = layout;

      const activeRoomId = lastActiveRoomIdRef.current;

      while (content.children.length) {
        const c = content.children.pop()!;
        disposeObject(c);
        content.remove(c);
      }

      const oldZStack = [...zStackRef.current];

      roomsRef.current = [];
      zStackRef.current = [];
      zIndexMapRef.current.clear();

      const { width: floorW, height: floorH, mainDoor } = layout.floor;
      floorSizeRef.current = { w: floorW, h: floorH };

      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(floorW, floorH),
        new THREE.MeshBasicMaterial({ color: 0xf8fafc, side: THREE.DoubleSide })
      );
      floor.position.set(0, 0, -0.02);
      content.add(floor);

      const floorEdge = new THREE.LineSegments(
        new THREE.EdgesGeometry(floor.geometry as THREE.PlaneGeometry),
        new THREE.LineBasicMaterial({ color: 0x333333 })
      );
      content.add(floorEdge);

      // cửa chính
      {
        const md = mainDoor;
        const dx = md.x2 - md.x1;
        const dy = md.y2 - md.y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);

        const doorMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(len, 0.1),
          new THREE.MeshBasicMaterial({ color: 0x2b8a3e })
        );
        doorMesh.position.set((md.x1 + md.x2) / 2, (md.y1 + md.y2) / 2, 0.01);
        doorMesh.rotation.z = angle;
        doorMesh.renderOrder = 5;
        content.add(doorMesh);
      }

      // rooms
      for (const [idx, r] of layout.rooms.entries()) {
        const geom = new THREE.PlaneGeometry(r.w, r.h);
        const mat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(r.color),
          side: THREE.DoubleSide,
          depthTest: true,
          depthWrite: true,
          transparent: false,
          opacity: 0.95,

          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        });
        const mesh = new THREE.Mesh(geom, mat);

        zStackRef.current.push(r.id);

        const zIndex = idx;
        zIndexMapRef.current.set(r.id, zIndex);
        const zPos = Z_BASE + zIndex * Z_STEP;

        mesh.position.set(r.x, r.y, zPos);
        mesh.renderOrder = zIndex;
        mesh.userData.roomId = r.id;
        content.add(mesh);

        const edgeGeom = new THREE.EdgesGeometry(
          new THREE.PlaneGeometry(r.w, r.h)
        );

        const frameMat = new THREE.LineBasicMaterial({
          color: 0x000000,
          transparent: true,
          depthTest: true,
          depthWrite: false,
        });

        const frame = new THREE.LineSegments(edgeGeom, frameMat);
        frame.position.set(0, 0, 0.0002);
        frame.raycast = () => {};
        frame.userData.isFrame = true;
        frame.renderOrder = (mesh.renderOrder ?? 0) + 1;
        mesh.add(frame);
        mesh.userData.frame = frame;

        // label
        const sprCanvas = document.createElement("canvas");
        const ctx = sprCanvas.getContext("2d")!;
        sprCanvas.width = 92;
        sprCanvas.height = 80;
        ctx.fillStyle = "#000";
        ctx.font = "16px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(r.label, sprCanvas.width / 2, sprCanvas.height / 2);

        const tex = new THREE.CanvasTexture(sprCanvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;

        const sMat = new THREE.SpriteMaterial({
          map: tex,
          transparent: true,
          depthTest: true,
          depthWrite: false,
          alphaTest: 0.1,
        });

        const spr = new THREE.Sprite(sMat);
        spr.position.set(0, 0, 0.0001);
        spr.renderOrder = (mesh.renderOrder ?? 10) + 1;
        mesh.add(spr);

        const doorMeshes: THREE.Mesh[] = [];
        if (r.rawDoors?.length) {
          for (const d of r.rawDoors) {
            const dummy = new THREE.Mesh(
              new THREE.PlaneGeometry(1, 0.08),
              new THREE.MeshBasicMaterial({
                color: 0x1d4ed8,
                side: THREE.DoubleSide,
                depthTest: true,
                depthWrite: false,
              })
            );
            dummy.userData.spec = {
              side: d.side as Side,
              width: d.width,
              offsetRatio: d.offsetRatio,
            };
            mesh.add(dummy);
            positionDoorLocal(mesh, dummy, dummy.userData.spec);
            doorMeshes.push(dummy);
          }
        }
        if (doorMeshes.length) mesh.userData.doors = doorMeshes;

        roomsRef.current.push({ id: r.id, mesh, w: r.w, h: r.h });
      }

      if (oldZStack.length > 0) {
        const existingIds = new Set(oldZStack);
        const currentIds = roomsRef.current.map((r) => r.id);
        const newIds = currentIds.filter((id) => !existingIds.has(id));

        zStackRef.current = oldZStack.filter((id) => currentIds.includes(id));

        zStackRef.current = [...zStackRef.current, ...newIds];

        if (activeRoomId && currentIds.includes(activeRoomId)) {
          bringToFront(activeRoomId);
        }

        restoreZOrder();
      }

      if (!isRoomEdit && !cameraPanRef.current?.isPanning) {
        autoFitRef.current = true;
        fitViewToFloor(1.0);
      } else {
        // Chỉ update projection matrix
        applyOrthoFromScale();
      }
    }, [
      layout,
      fitViewToFloor,
      applyOrthoFromScale,
      positionDoorLocal,
      bringToFront,
      restoreZOrder,
    ]);

    return (
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden rounded-lg border border-gray-300 bg-white shadow"
        style={{ height }}
      />
    );
  }
);

// ✅ THÊM DISPLAY NAME
Floor2DCanvas.displayName = "Floor2DCanvas";

const disposeObject = (obj: THREE.Object3D) => {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose?.();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose?.());
    else mat?.dispose?.();
    if (o.type === "Sprite") {
      const sprite = o as THREE.Sprite;
      const spriteMat = sprite.material as THREE.SpriteMaterial;
      spriteMat.map?.dispose?.();
    }
  });
};

export default Floor2DCanvas;
