// Capa de datos: Supabase (nube compartida) o modo demo (localStorage).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY;
const TABLAS = ["movimientos", "tarjetas", "cuotas", "metas", "presupuestos", "pagos_fijos", "cierres"];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

/* ======================= SUPABASE ======================= */
let sb = null;
async function cliente() {
  if (!sb) {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm");
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  }
  return sb;
}
const ok = ({ data, error }) => { if (error) throw traducir(error); return data; };
function traducir(error) {
  const m = error?.message || String(error);
  if (/Invalid login credentials/i.test(m)) return new Error("Correo o contraseña incorrectos.");
  if (/already registered/i.test(m)) return new Error("Ese correo ya tiene cuenta. Inicia sesión.");
  if (/Password should be/i.test(m)) return new Error("La contraseña debe tener al menos 6 caracteres.");
  if (/Email not confirmed/i.test(m)) return new Error("Confirma tu correo con el enlace que te enviamos y vuelve a entrar.");
  if (/movimientos_operacion_unica|duplicate key/i.test(m)) return new Error("Ya existe un movimiento con ese Nº de operación.");
  if (/Failed to fetch|NetworkError/i.test(m)) return new Error("Sin conexión. Revisa tu internet.");
  return new Error(m);
}

const nube = {
  async sesion() {
    const c = await cliente();
    const { data } = await c.auth.getSession();
    return data.session ? { userId: data.session.user.id, email: data.session.user.email } : null;
  },
  async onAuth(cb) {
    const c = await cliente();
    c.auth.onAuthStateChange((_e, s) => cb(s ? { userId: s.user.id, email: s.user.email } : null));
  },
  async registrar(email, password) {
    const c = await cliente();
    const data = ok(await c.auth.signUp({ email, password }));
    return { confirmar: !data.session };
  },
  async entrar(email, password) { const c = await cliente(); ok(await c.auth.signInWithPassword({ email, password })); },
  async salir() { const c = await cliente(); await c.auth.signOut(); },

  async perfil(userId) {
    const c = await cliente();
    const yo = ok(await c.from("miembros").select("*").eq("user_id", userId).maybeSingle());
    if (!yo) return null;
    const hogar = ok(await c.from("hogares").select("*").eq("id", yo.hogar_id).single());
    const miembros = ok(await c.from("miembros").select("*").eq("hogar_id", yo.hogar_id).order("orden"));
    return { hogar, miembros };
  },
  async crearHogar(nombre) { const c = await cliente(); ok(await c.rpc("crear_hogar", { mi_nombre: nombre })); },
  async unirseHogar(codigo, nombre) { const c = await cliente(); ok(await c.rpc("unirse_hogar", { codigo_in: codigo, mi_nombre: nombre })); },

  async cargar(hogarId) {
    const c = await cliente();
    const desde = new Date(); desde.setMonth(desde.getMonth() - 13); desde.setDate(1);
    const res = {};
    await Promise.all(TABLAS.map(async (t) => {
      let q = c.from(t).select("*").eq("hogar_id", hogarId);
      if (t === "movimientos") q = q.gte("fecha", desde.toISOString().slice(0, 10)).order("fecha", { ascending: false }).order("creado_en", { ascending: false });
      res[t] = ok(await q);
    }));
    return res;
  },
  async guardar(tabla, fila) {
    const c = await cliente();
    if (tabla === "presupuestos") return ok(await c.from(tabla).upsert(fila).select().single());
    if (tabla === "cierres") return ok(await c.from(tabla).upsert(fila).select().single());
    if (fila.id) { const { id, ...resto } = fila; return ok(await c.from(tabla).update(resto).eq("id", id).select().single()); }
    return ok(await c.from(tabla).insert(fila).select().single());
  },
  async borrar(tabla, id) { const c = await cliente(); ok(await c.from(tabla).delete().eq("id", id)); },
  async actualizarHogar(id, cambios) { const c = await cliente(); return ok(await c.from("hogares").update(cambios).eq("id", id).select().single()); },
  async actualizarMiembro(hogarId, userId, cambios) {
    const c = await cliente();
    return ok(await c.from("miembros").update(cambios).eq("hogar_id", hogarId).eq("user_id", userId).select().single());
  },
  async subirCaptura(hogarId, blob) {
    const c = await cliente();
    const path = `${hogarId}/${uid()}.jpg`;
    ok(await c.storage.from("capturas").upload(path, blob, { contentType: blob.type || "image/jpeg" }));
    return path;
  },
  async urlCaptura(path) {
    const c = await cliente();
    const data = ok(await c.storage.from("capturas").createSignedUrl(path, 3600));
    return data.signedUrl;
  },
  async borrarCaptura(path) { const c = await cliente(); await c.storage.from("capturas").remove([path]); },
  async leerCaptura(base64, mediaType, hoy) {
    const c = await cliente();
    const { data, error } = await c.functions.invoke("leer-captura", { body: { imagen_base64: base64, media_type: mediaType, hoy } });
    if (error) {
      let msg = "No pudimos leer la captura. Ingresa los datos a mano.";
      try { const b = await error.context?.json?.(); if (b?.error) msg = b.error; } catch {}
      throw new Error(msg);
    }
    return data;
  },
};

/* ======================= DEMO ======================= */
const CLAVE = "saldo-claro-demo-v1";
const ANA = "demo-ana", LEO = "demo-leo";
const capturasDemo = new Map(); // solo en memoria: las imágenes no se guardan en el modo demo

function fechaRel(dias) { const d = new Date(); d.setDate(d.getDate() - dias); return d.toISOString().slice(0, 10); }
function semilla() {
  const h = { id: "demo-hogar", nombre: "Nuestro hogar", codigo: "DEMO42", reparto_modo: "ingresos", reparto_fijo_pct: 50 };
  const miembros = [
    { hogar_id: h.id, user_id: ANA, nombre: "Ana", color: "esmeralda", ingreso_mensual: 4850, presupuesto_personal: 3000, orden: 1 },
    { hogar_id: h.id, user_id: LEO, nombre: "Leo", color: "rosado", ingreso_mensual: 3200, presupuesto_personal: 2200, orden: 2 },
  ];
  const visa = { id: uid(), hogar_id: h.id, user_id: ANA, nombre: "Visa", ultimos4: "4821", linea: 5000, dia_cierre: 25, dia_pago: 10, color: "esmeralda" };
  const mc = { id: uid(), hogar_id: h.id, user_id: ANA, nombre: "Mastercard", ultimos4: "1907", linea: 2500, dia_cierre: 30, dia_pago: 15, color: "rosado" };
  const viaje = { id: uid(), hogar_id: h.id, nombre: "Viaje a Cusco", objetivo: 4000, fecha_meta: `${new Date().getFullYear() + 1}-07-01` };
  const fondo = { id: uid(), hogar_id: h.id, nombre: "Fondo de emergencia", objetivo: 9000, fecha_meta: null };
  const m = (o) => ({ id: uid(), hogar_id: h.id, creado_por: o.pagado_por || ANA, hora: null, nota: "", n_operacion: null, alcance: "propio",
    duenio: ANA, pagado_por: ANA, privado: false, clase: "normal", tarjeta_id: null, meta_id: null, captura_path: null, creado_en: new Date().toISOString(), ...o });
  const movimientos = [
    m({ tipo: "gasto", monto: 18.5, fecha: fechaRel(0), comercio: "Bodega Don Lucho", medio: "Yape", categoria: "comida", alcance: "compartido", duenio: null, n_operacion: "03847126" }),
    m({ tipo: "gasto", monto: 14.9, fecha: fechaRel(0), comercio: "Taxi por aplicativo", medio: "Tarjeta de crédito", categoria: "transporte", tarjeta_id: visa.id }),
    m({ tipo: "gasto", monto: 85, fecha: fechaRel(0), comercio: "Regalo de cumpleaños", medio: "Yape", categoria: "otros", privado: true }),
    m({ tipo: "ingreso", monto: 650, fecha: fechaRel(1), comercio: "Diseño de logo · Carla R.", medio: "Plin", categoria: "ingreso" }),
    m({ tipo: "gasto", monto: 78.4, fecha: fechaRel(1), comercio: "Recibo de luz", medio: "Transferencia", categoria: "casa", alcance: "compartido", duenio: null, pagado_por: LEO, creado_por: LEO }),
    m({ tipo: "gasto", monto: 12, fecha: fechaRel(1), comercio: "Menú del día", medio: "Efectivo", categoria: "comida", duenio: LEO, pagado_por: LEO, creado_por: LEO }),
    m({ tipo: "gasto", monto: 46, fecha: fechaRel(2), comercio: "Farmacia", medio: "Yape", categoria: "salud", duenio: LEO, pagado_por: LEO, creado_por: LEO }),
    m({ tipo: "gasto", monto: 32, fecha: fechaRel(2), comercio: "Cine", medio: "Tarjeta de crédito", categoria: "ocio", alcance: "compartido", duenio: null, tarjeta_id: visa.id }),
    m({ tipo: "gasto", monto: 186.4, fecha: fechaRel(4), comercio: "Supermercado", medio: "Tarjeta de crédito", categoria: "comida", alcance: "compartido", duenio: null, tarjeta_id: mc.id }),
    m({ tipo: "gasto", monto: 44.9, fecha: fechaRel(5), comercio: "Suscripción de streaming", medio: "Tarjeta de crédito", categoria: "ocio", tarjeta_id: visa.id }),
    m({ tipo: "gasto", monto: 1200, fecha: fechaRel(6), comercio: "Alquiler", medio: "Transferencia", categoria: "casa", alcance: "compartido", duenio: null }),
    m({ tipo: "gasto", monto: 230, fecha: fechaRel(8), comercio: "Mercado semanal", medio: "Efectivo", categoria: "comida", alcance: "compartido", duenio: null, pagado_por: LEO, creado_por: LEO }),
    m({ tipo: "ingreso", monto: 4200, fecha: fechaRel(7), comercio: "Sueldo", medio: "Transferencia", categoria: "ingreso" }),
    m({ tipo: "ingreso", monto: 3200, fecha: fechaRel(7), comercio: "Sueldo", medio: "Transferencia", categoria: "ingreso", duenio: LEO, pagado_por: LEO, creado_por: LEO }),
    m({ tipo: "gasto", monto: 300, fecha: fechaRel(3), comercio: "Aporte a Viaje a Cusco", medio: "Transferencia", categoria: "otros", clase: "aporte_meta", meta_id: viaje.id }),
    m({ tipo: "gasto", monto: 1300, fecha: fechaRel(40), comercio: "Aporte a Viaje a Cusco", medio: "Transferencia", categoria: "otros", clase: "aporte_meta", meta_id: viaje.id }),
    m({ tipo: "gasto", monto: 850, fecha: fechaRel(40), comercio: "Aporte a Viaje a Cusco", medio: "Transferencia", categoria: "otros", clase: "aporte_meta", meta_id: viaje.id, duenio: LEO, pagado_por: LEO, creado_por: LEO }),
    m({ tipo: "gasto", monto: 2000, fecha: fechaRel(45), comercio: "Aporte a Fondo de emergencia", medio: "Transferencia", categoria: "otros", clase: "aporte_meta", meta_id: fondo.id }),
    m({ tipo: "gasto", monto: 1600, fecha: fechaRel(45), comercio: "Aporte a Fondo de emergencia", medio: "Transferencia", categoria: "otros", clase: "aporte_meta", meta_id: fondo.id, duenio: LEO, pagado_por: LEO, creado_por: LEO }),
    m({ tipo: "gasto", monto: 540, fecha: fechaRel(33), comercio: "Supermercado del mes", medio: "Tarjeta de débito", categoria: "comida", alcance: "compartido", duenio: null }),
    m({ tipo: "gasto", monto: 1200, fecha: fechaRel(36), comercio: "Alquiler", medio: "Transferencia", categoria: "casa", alcance: "compartido", duenio: null }),
    m({ tipo: "gasto", monto: 260, fecha: fechaRel(38), comercio: "Salida de aniversario", medio: "Tarjeta de crédito", categoria: "ocio", alcance: "compartido", duenio: null, pagado_por: LEO, creado_por: LEO }),
  ];
  return {
    hogar: h, miembros,
    movimientos, tarjetas: [visa, mc],
    cuotas: [
      { id: uid(), hogar_id: h.id, tarjeta_id: visa.id, descripcion: "Laptop", monto_cuota: 210, total_cuotas: 12, cuotas_pagadas: 6 },
      { id: uid(), hogar_id: h.id, tarjeta_id: mc.id, descripcion: "Refrigeradora", monto_cuota: 145, total_cuotas: 6, cuotas_pagadas: 2 },
    ],
    metas: [viaje, fondo],
    presupuestos: [
      { hogar_id: h.id, categoria: "comida", monto: 600 }, { hogar_id: h.id, categoria: "casa", monto: 1400 }, { hogar_id: h.id, categoria: "ocio", monto: 300 },
    ],
    pagos_fijos: [
      { id: uid(), hogar_id: h.id, nombre: "Alquiler", monto: 1200, dia_vence: 1, responsable: ANA, categoria: "casa", ultimo_pago: fechaRel(6) },
      { id: uid(), hogar_id: h.id, nombre: "Internet", monto: 99, dia_vence: 5, responsable: LEO, categoria: "casa", ultimo_pago: null },
      { id: uid(), hogar_id: h.id, nombre: "Agua", monto: 45, dia_vence: 12, responsable: LEO, categoria: "casa", ultimo_pago: null },
      { id: uid(), hogar_id: h.id, nombre: "Luz", monto: 78.4, dia_vence: 20, responsable: null, categoria: "casa", ultimo_pago: fechaRel(1) },
    ],
    cierres: [{ hogar_id: h.id, mes: new Date().toISOString().slice(0, 8) + "01", user_id: LEO, revisado_en: new Date().toISOString() }],
    sesion: { userId: ANA, email: "ana@ejemplo.pe" },
  };
}
let db = null;
function leer() {
  if (db) return db;
  try { db = JSON.parse(localStorage.getItem(CLAVE)); } catch { db = null; }
  if (!db) { db = semilla(); escribir(); }
  return db;
}
function escribir() { try { localStorage.setItem(CLAVE, JSON.stringify(db)); } catch {} }
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const copia = (x) => JSON.parse(JSON.stringify(x));

const demo = {
  async sesion() { return leer().sesion; },
  async onAuth() {},
  async registrar() { return { confirmar: false }; },
  async entrar() {},
  async salir() { localStorage.removeItem(CLAVE); db = null; location.reload(); },
  async perfil() { const d = leer(); return { hogar: copia(d.hogar), miembros: copia(d.miembros) }; },
  async crearHogar() {}, async unirseHogar() {},
  async cargar() { const d = leer(); const r = {}; TABLAS.forEach((t) => (r[t] = copia(d[t]))); return r; },
  async guardar(tabla, fila) {
    const d = leer();
    if (tabla === "presupuestos") {
      d.presupuestos = d.presupuestos.filter((p) => p.categoria !== fila.categoria).concat([fila]);
    } else if (tabla === "cierres") {
      d.cierres = d.cierres.filter((c) => !(c.mes === fila.mes && c.user_id === fila.user_id)).concat([{ ...fila, revisado_en: new Date().toISOString() }]);
    } else if (fila.id && d[tabla].some((x) => x.id === fila.id)) {
      d[tabla] = d[tabla].map((x) => (x.id === fila.id ? { ...x, ...fila } : x));
    } else {
      if (tabla === "movimientos" && fila.n_operacion && d.movimientos.some((x) => x.n_operacion === fila.n_operacion)) {
        throw new Error("Ya existe un movimiento con ese Nº de operación.");
      }
      fila = { id: uid(), creado_en: new Date().toISOString(), creado_por: ANA, ...fila };
      d[tabla].unshift(fila);
    }
    escribir();
    return copia(fila);
  },
  async borrar(tabla, id) { const d = leer(); d[tabla] = d[tabla].filter((x) => x.id !== id); escribir(); },
  async actualizarHogar(_id, cambios) { const d = leer(); Object.assign(d.hogar, cambios); escribir(); return copia(d.hogar); },
  async actualizarMiembro(_h, userId, cambios) {
    const d = leer(); const m = d.miembros.find((x) => x.user_id === userId); Object.assign(m, cambios); escribir(); return copia(m);
  },
  async subirCaptura(_h, blob) { const p = `demo/${uid()}`; capturasDemo.set(p, URL.createObjectURL(blob)); return p; },
  async urlCaptura(path) { return capturasDemo.get(path) || null; },
  async borrarCaptura(path) { capturasDemo.delete(path); },
  async leerCaptura(_b64, _t, hoy) {
    await espera(1400);
    return {
      legible: true, tipo_documento: "yape",
      aviso: "Modo demo: estos datos son de ejemplo. Con Supabase configurado, Claude lee tu captura de verdad.",
      movimientos: [{
        tipo: "gasto", monto: 18.5, moneda: "PEN", fecha: hoy, hora: "19:42", comercio: "Bodega Don L.", medio: "Yape",
        categoria: "comida", n_operacion: "", ultimos4_tarjeta: "", cuotas: 1,
        confianza: { monto: "alta", fecha: "alta", comercio: "media" },
      }],
    };
  },
};

export const api = DEMO ? demo : nube;
export { ANA as DEMO_YO };
