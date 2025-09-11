// src/components/Floor2DCanvas.tsx
"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { LayoutResult } from "@/utils/GenerateLayout";

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

const Floor2DCanvas = ({ layout, onRoomEdit, height = "70vh" }: Props) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // singletons
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const contentRef = useRef<THREE.Group | null>(null);

  // runtime
  const roomsRef = useRef<
    Array<{ id: string; mesh: THREE.Mesh; w: number; h: number }>
  >([]);
  const floorSizeRef = useRef({ w: 0, h: 0 });

  // drag / resize state
  const draggingRef = useRef<null | {
    r: { id: string; mesh: THREE.Mesh; w: number; h: number };
    offset: THREE.Vector3; // MOVE offset
  }>(null);

  const dragModeRef = useRef<Handle>("MOVE");
  const anchorRef = useRef<{ x: number; y: number } | null>(null); // world
  const startSizeRef = useRef<{ w: number; h: number } | null>(null);

  // camera
  const camScaleRef = useRef(50);
  const autoFitRef = useRef(true);

  // ===== tunables =====
  const MIN_W = 0.9;
  const MIN_H = 0.9;
  const HANDLE_EPS = 0.05; // phạm vi bắt cạnh/góc
  const SNAP = 0.25; // snap lưới (m)
  const WALL_EPS = SNAP * 0.5; // “nam châm” tường khi MOVE

  const applyOrthoFromScale = () => {
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
  };

  const fitViewToFloor = (padding = 1.0) => {
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
    (fitViewToFloor as any)._min = MIN;
    (fitViewToFloor as any)._max = MAX;
    camScaleRef.current = next;
    applyOrthoFromScale();
  };

  const pickHandleLocal = (
    localX: number,
    localY: number,
    w: number,
    h: number
  ): Handle => {
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
  };

  const cursorForHandle = (h: Handle) => {
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
        return "default";
    }
  };

  const positionDoorLocal = (
    mesh: THREE.Mesh,
    doorMesh: THREE.Mesh,
    spec: { side: Side; width: number; offsetRatio: number }
  ) => {
    const geom = mesh.geometry as THREE.PlaneGeometry;
    // @ts-ignore
    const w: number = geom.parameters.width;
    // @ts-ignore
    const h: number = geom.parameters.height;

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
  };

  const roomFromHitObject = (obj: THREE.Object3D | null) => {
    let cur: THREE.Object3D | null = obj;
    while (cur && !(cur as any).userData?.roomId) cur = cur.parent;
    if (!cur) return null;
    return roomsRef.current.find((x) => x.mesh === cur);
  };

  // ===== mount once =====
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    wrap.replaceChildren();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    sceneRef.current = scene;

    const w = wrap.clientWidth;
    const h = wrap.clientHeight || window.innerHeight;

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
    wrap.appendChild(renderer.domElement);

    // grid
    const grid = new THREE.GridHelper(200, 200, 0xdddddd, 0xdddddd);
    // @ts-ignore
    grid.rotation.x = Math.PI / 2;
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
      const min = (fitViewToFloor as any)._min ?? 5;
      const max = (fitViewToFloor as any)._max ?? 1000;
      camScaleRef.current = Math.min(
        max,
        Math.max(min, camScaleRef.current * factor)
      );
      autoFitRef.current = false;
      applyOrthoFromScale();
    };
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    // drag/resize setup...
    const ray = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();

    const getMouseNDC = (evt: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onDown = (evt: MouseEvent) => {
      if (!cameraRef.current || !rendererRef.current) return;

      // Bắt pointer để không “rơi” khi kéo ra ngoài canvas
      (rendererRef.current.domElement as any).setPointerCapture?.(
        (evt as any).pointerId
      );

      getMouseNDC(evt);
      ray.setFromCamera(mouse, cameraRef.current);

      const hits = ray.intersectObjects(
        roomsRef.current.map((r) => r.mesh),
        false
      );
      if (!hits.length) return;

      // ✅ bò lên mesh phòng thực sự
      const r = roomFromHitObject(hits[0].object);
      if (!r) return;

      // ✅ dùng đúng worldPoint tại vị trí click
      const worldPoint = hits[0].point.clone();

      // ✅ điểm local đúng từ mesh phòng
      const local = r.mesh.worldToLocal(worldPoint.clone());

      // ✅ xác định handle dựa trên local
      const handle = pickHandleLocal(local.x, local.y, r.w, r.h);
      dragModeRef.current = handle;

      // ✅ mode MOVE: lưu offset = position - hit(trên planeZ) để kéo mượt
      if (!ray.ray.intersectPlane(planeZ, hit)) return;

      if (handle === "MOVE") {
        const offset = new THREE.Vector3().subVectors(r.mesh.position, hit);
        draggingRef.current = { r, offset };
        document.body.style.cursor = "grabbing";
        rendererRef.current.domElement.style.cursor = "grabbing";
      } else {
        // ✅ mode RESIZE: cố định anchor ở góc/cạnh ngược
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
    };

    const onMove = (evt: MouseEvent) => {
      if (!cameraRef.current || !rendererRef.current) return;

      getMouseNDC(evt);
      ray.setFromCamera(mouse, cameraRef.current);

      // Khi CHƯA kéo: chỉ set cursor chính xác theo handle
      if (!draggingRef.current) {
        const hits = ray.intersectObjects(
          roomsRef.current.map((r) => r.mesh),
          true
        );
        if (hits.length) {
          const r = roomFromHitObject(hits[0].object);
          if (r) {
            const worldPoint = hits[0].point.clone();
            const local = r.mesh.worldToLocal(worldPoint);
            const h = pickHandleLocal(local.x, local.y, r.w, r.h);
            rendererRef.current.domElement.style.cursor = cursorForHandle(h);
            return;
          }
        }
        rendererRef.current.domElement.style.cursor = "default";
        return;
      }

      // ĐANG kéo
      if (!ray.ray.intersectPlane(planeZ, hit)) return;

      const mode = dragModeRef.current;
      const ctx = draggingRef.current!;
      const { r, offset } = ctx;

      if (mode === "MOVE") {
        // ✅ luôn cùng hệ toạ độ với onDown: dùng planeZ + offset
        const target = new THREE.Vector3().addVectors(hit, offset);

        const halfW = floorSizeRef.current.w / 2,
          halfH = floorSizeRef.current.h / 2;
        const w2 = r.w / 2,
          h2 = r.h / 2;

        let nx = Math.max(-halfW + w2, Math.min(halfW - w2, target.x));
        let ny = Math.max(-halfH + h2, Math.min(halfH - h2, target.y));

        nx = Math.round(nx / SNAP) * SNAP;
        ny = Math.round(ny / SNAP) * SNAP;

        // “nam châm” tường
        const right = halfW - w2,
          left = -halfW + w2,
          top = halfH - h2,
          bot = -halfH + h2;
        if (Math.abs(nx - right) < WALL_EPS) nx = right;
        if (Math.abs(nx - left) < WALL_EPS) nx = left;
        if (Math.abs(ny - top) < WALL_EPS) ny = top;
        if (Math.abs(ny - bot) < WALL_EPS) ny = bot;

        r.mesh.position.set(nx, ny, 0);
        return;
      }

      // RESIZE: thống nhất với onDown qua anchorRef + startSizeRef
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

      r.mesh.position.set(cx, cy, 0);

      // cập nhật hình học + viền + cửa
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
          if (spec) positionDoorLocal(r.mesh, dm, spec);
        }
      }

      r.w = newW;
      r.h = newH;
    };

    const onUp = (evt?: MouseEvent) => {
      (rendererRef.current?.domElement as any)?.releasePointerCapture?.(
        (evt as any)?.pointerId
      );
      const dragging = draggingRef.current;
      if (dragging && onRoomEdit) {
        const { r } = dragging;
        onRoomEdit(r.id, {
          x: r.mesh.position.x,
          y: r.mesh.position.y,
          w: r.w,
          h: r.h,
        });
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
        // @ts-ignore
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose?.());
        else mat?.dispose?.();
        // @ts-ignore
        if (o.type === "Sprite" && o.material?.map) o.material.map.dispose?.();
      });

      renderer.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      contentRef.current = null;
      roomsRef.current = [];
      draggingRef.current = null;

      if (wrapRef.current) wrapRef.current.replaceChildren();
    };
  }, []);

  // ===== rebuild content when layout changes =====
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    while (content.children.length) {
      const c = content.children.pop()!;
      disposeObject(c);
      content.remove(c);
    }
    roomsRef.current = [];

    // floor
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

    // cửa chính (xanh lá)
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
    for (const r of layout.rooms) {
      const geom = new THREE.PlaneGeometry(r.w, r.h);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(r.color),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(r.x, r.y, 0);
      mesh.userData.roomId = r.id;
      content.add(mesh);

      // ✅ GẮN VIỀN VÀO MESH (không add vào content)
      const frame = new THREE.LineSegments(
        new THREE.EdgesGeometry(geom),
        new THREE.LineBasicMaterial({
          color: 0x000000,
          transparent: false,
          opacity: 1.0,
        })
      );
      frame.position.set(0, 0, 0.01); // ✅ Local position (relative to mesh)
      frame.renderOrder = 10;
      frame.raycast = () => {};
      mesh.add(frame); // ✅ Add vào mesh, không phải content
      mesh.userData.frame = frame;

      // label
      const sprCanvas = document.createElement("canvas");
      const ctx = sprCanvas.getContext("2d")!;
      sprCanvas.width = 256;
      sprCanvas.height = 64;
      ctx.fillStyle = "#000";
      ctx.font = "20px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(r.label, sprCanvas.width / 2, sprCanvas.height / 2);
      const tex = new THREE.CanvasTexture(sprCanvas);
      const sMat = new THREE.SpriteMaterial({
        map: tex,
        depthTest: false,
        depthWrite: false,
      });
      const spr = new THREE.Sprite(sMat);
      spr.scale.set(2.5, 0.7, 1);
      spr.position.set(0, 0, 0.02);
      mesh.add(spr);

      // doors (LOCAL-SPACE)
      const doorMeshes: THREE.Mesh[] = [];
      if (r.rawDoors?.length) {
        for (const d of r.rawDoors) {
          const dummy = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 0.08),
            new THREE.MeshBasicMaterial({
              color: 0x1d4ed8,
              side: THREE.DoubleSide,
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

    autoFitRef.current = true;
    fitViewToFloor(1.0);
  }, [layout]);

  return (
    <div
      ref={wrapRef}
      className="relative w-full overflow-hidden rounded-lg border border-gray-300 bg-white shadow"
      style={{ height }}
    />
  );
};

/** dispose helper */
const disposeObject = (obj: THREE.Object3D) => {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose?.();
    // @ts-ignore
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose?.());
    else mat?.dispose?.();
    // @ts-ignore
    if (o.type === "Sprite" && o.material?.map) o.material.map.dispose?.();
  });
};

export default Floor2DCanvas;
