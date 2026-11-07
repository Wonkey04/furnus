import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type Vista = "iso" | "frente" | "arriba" | "derecha";
export const VISTAS: { id: Vista; etiqueta: string }[] = [
  { id: "iso", etiqueta: "Iso" },
  { id: "frente", etiqueta: "Frente" },
  { id: "arriba", etiqueta: "Arriba" },
  { id: "derecha", etiqueta: "Derecha" },
];

// glTF es Y-up: el «arriba» de build123d (Z) queda en +Y y el «frente» (-Y) en +Z.
const DIRECCIONES: Record<Vista, THREE.Vector3> = {
  iso: new THREE.Vector3(1, 0.9, 1.1),
  frente: new THREE.Vector3(0, 0, 1),
  arriba: new THREE.Vector3(0, 1, 0.0001),
  derecha: new THREE.Vector3(1, 0, 0),
};

function color(nombre: string): THREE.Color {
  return new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue(nombre).trim() || "#888");
}

/** Tres grises fijos por cara (BRAND): arriba claro, izquierda intermedio, derecha oscuro. */
function materialPieza() {
  return new THREE.ShaderMaterial({
    uniforms: { luz: { value: color("--piece-light") }, medio: { value: color("--piece-mid") }, oscuro: { value: color("--piece-dark") } },
    vertexShader: `varying vec3 vN; void main(){ vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 luz; uniform vec3 medio; uniform vec3 oscuro; varying vec3 vN;
      void main(){
        vec3 n = normalize(vN);
        float t = max(n.y,0.0), l = max(n.z,0.0), r = max(n.x,0.0);
        float o = max(-n.y,0.0) + max(-n.z,0.0) + max(-n.x,0.0);
        vec3 c = (luz*t + medio*l + oscuro*(r+o)) / (t+l+r+o);
        gl_FragColor = vec4(c,1.0);
      }`,
    side: THREE.DoubleSide,
  });
}

export interface Cota {
  etiqueta: string;
  a: { x: number; y: number };
  b: { x: number; y: number };
}

interface Props {
  mallaUrl: string | null;
  medidas: [number, number, number] | null;
  vista: Vista;
  /** Se incrementa para volver a encuadrar con la vista pedida. */
  versionVista: number;
}

export function Visor3D({ mallaUrl, medidas, vista, versionVista }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const escena = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    pieza: THREE.Group | null;
    caja: THREE.Box3 | null;
    render: () => void;
    encuadrar: (v: Vista) => void;
    material: THREE.ShaderMaterial;
    lineas: THREE.LineBasicMaterial;
    puntosCota: () => Cota[];
  } | null>(null);
  const [cotas, setCotas] = useState<Cota[]>([]);
  const [cargando, setCargando] = useState(false);
  const [falloMalla, setFalloMalla] = useState(false);

  // Escena
  useEffect(() => {
    const el = contenedor.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.prepend(renderer.domElement);
    renderer.domElement.setAttribute("aria-hidden", "true");
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 1, 100000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;

    const material = materialPieza();
    const lineas = new THREE.LineBasicMaterial({ color: color("--ink") });
    let marco = 0;

    const proyectar = (p: THREE.Vector3) => {
      const v = p.clone().project(camera);
      const r = renderer.domElement.getBoundingClientRect();
      return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height };
    };
    // Las cotas miden la caja real. En three: X = largo, Z = ancho (Y de la pieza), Y = alto (Z de la pieza).
    const puntosCota = (): Cota[] => {
      const e = escena.current;
      if (!e?.caja) return [];
      const { min, max } = e.caja;
      const d = Math.max(max.x - min.x, max.y - min.y, max.z - min.z) * 0.12;
      const L = (a: THREE.Vector3, b: THREE.Vector3, etiqueta: string): Cota => ({ etiqueta, a: proyectar(a), b: proyectar(b) });
      const mm = (n: number) => `${Number(n.toFixed(2))}`;
      return [
        L(new THREE.Vector3(min.x, min.y, max.z + d), new THREE.Vector3(max.x, min.y, max.z + d), mm((max.x - min.x))),
        L(new THREE.Vector3(max.x + d, min.y, max.z), new THREE.Vector3(max.x + d, max.y, max.z), mm((max.y - min.y))),
        L(new THREE.Vector3(max.x + d, min.y, min.z), new THREE.Vector3(max.x + d, min.y, max.z), mm((max.z - min.z))),
      ];
    };

    const render = () => {
      controls.update();
      renderer.render(scene, camera);
    };
    const actualizarCotas = () => setCotas(escena.current?.caja ? puntosCota() : []);
    controls.addEventListener("change", actualizarCotas);
    const ciclo = () => {
      render();
      marco = requestAnimationFrame(ciclo);
    };

    const encuadrar = (v: Vista) => {
      const e = escena.current;
      const caja = e?.caja ?? new THREE.Box3(new THREE.Vector3(-30, -12, -20), new THREE.Vector3(30, 12, 20));
      const centro = caja.getCenter(new THREE.Vector3());
      const radio = caja.getSize(new THREE.Vector3()).length() / 2 || 50;
      const vfov = THREE.MathUtils.degToRad(camera.fov);
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
      const dist = (radio / Math.sin(Math.min(vfov, hfov) / 2)) * 1.35;
      camera.position.copy(centro).add(DIRECCIONES[v].clone().normalize().multiplyScalar(dist));
      camera.near = dist / 100;
      camera.far = dist * 100;
      camera.updateProjectionMatrix();
      controls.target.copy(centro);
      controls.update();
    };

    const ajustar = () => {
      const r = el.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / Math.max(r.height, 1);
      camera.updateProjectionMatrix();
    };
    const obs = new ResizeObserver(() => {
      ajustar();
      actualizarCotas();
    });
    obs.observe(el);
    ajustar();

    escena.current = { scene, camera, controls, pieza: null, caja: null, render, encuadrar, material, lineas, puntosCota };
    ciclo();

    // Cambio de tema claro/oscuro: se releen los tokens.
    const recolorear = () => {
      material.uniforms.luz!.value = color("--piece-light");
      material.uniforms.medio!.value = color("--piece-mid");
      material.uniforms.oscuro!.value = color("--piece-dark");
      lineas.color = color("--ink");
    };
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", recolorear);
    const mo = new MutationObserver(recolorear);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      cancelAnimationFrame(marco);
      obs.disconnect();
      mq.removeEventListener("change", recolorear);
      mo.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      escena.current = null;
    };
  }, []);

  // Carga de la malla. La pieza anterior queda a la vista hasta que la nueva termina de cargar.
  useEffect(() => {
    const e = escena.current;
    if (!e) return;
    if (!mallaUrl) {
      if (e.pieza) e.scene.remove(e.pieza);
      e.pieza = null;
      e.caja = null;
      setCotas([]);
      return;
    }
    let cancelado = false;
    setCargando(true);
    new GLTFLoader().load(
      mallaUrl,
      (gltf) => {
        if (cancelado || !escena.current) return;
        const grupo = new THREE.Group();
        gltf.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          m.material = e.material;
          const bordes = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 25), e.lineas);
          m.add(bordes);
        });
        grupo.add(gltf.scene);
        grupo.scale.setScalar(1000); // glTF viene en metros; la pieza está en mm
        grupo.updateMatrixWorld(true);
        const primera = e.pieza === null;
        if (e.pieza) e.scene.remove(e.pieza);
        e.pieza = grupo;
        e.caja = new THREE.Box3().setFromObject(grupo);
        e.scene.add(grupo);
        if (primera) e.encuadrar(vistaActual.current);
        setFalloMalla(false);
        setCargando(false);
        setCotas(e.puntosCota());
      },
      undefined,
      () => {
        if (cancelado) return;
        setFalloMalla(true);
        setCargando(false);
      },
    );
    return () => {
      cancelado = true;
    };
  }, [mallaUrl]);

  const vistaActual = useRef(vista);
  vistaActual.current = vista;
  useEffect(() => {
    escena.current?.encuadrar(vista);
  }, [vista, versionVista]);

  const etiquetaCota = (c: Cota, i: number) => {
    if (![c.a.x, c.a.y, c.b.x, c.b.y].every(Number.isFinite)) return null;
    const mx = (c.a.x + c.b.x) / 2;
    const my = (c.a.y + c.b.y) / 2;
    const dx = c.b.x - c.a.x;
    const dy = c.b.y - c.a.y;
    const largo = Math.hypot(dx, dy) || 1;
    // Extremos en T: perpendicular a la línea de medida.
    const px = (-dy / largo) * 5;
    const py = (dx / largo) * 5;
    return (
      <g key={i} className="cota">
        <line x1={c.a.x} y1={c.a.y} x2={c.b.x} y2={c.b.y} />
        <line x1={c.a.x - px} y1={c.a.y - py} x2={c.a.x + px} y2={c.a.y + py} />
        <line x1={c.b.x - px} y1={c.b.y - py} x2={c.b.x + px} y2={c.b.y + py} />
        {largo > 36 && (
          <text x={mx} y={my - 7} textAnchor="middle">
            {c.etiqueta}
          </text>
        )}
      </g>
    );
  };

  return (
    <div className="visor-3d" ref={contenedor}>
      <svg className="cotas" aria-hidden="true">{cotas.map(etiquetaCota)}</svg>
      {!mallaUrl && <p className="visor-vacio">Todavía no hay pieza para mostrar.</p>}
      {cargando && <p className="visor-estado chip chip-punteado" role="status"><span className="punto hueco" aria-hidden="true" />Regenerando…</p>}
      {falloMalla && <p className="visor-estado chip" role="alert">No se pudo cargar la malla.</p>}
      <span className="solo-lectores">{medidas ? `Pieza de ${medidas.join(" por ")} milímetros` : "Sin pieza"}</span>
    </div>
  );
}
