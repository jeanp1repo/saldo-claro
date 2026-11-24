// Cálculos puros: no tocan el DOM ni la red.

export const CATS = {
  comida: { n: "Comida", i: "i-food", c: "--c-comida" },
  casa: { n: "Casa y servicios", i: "i-house", c: "--c-casa" },
  transporte: { n: "Transporte", i: "i-car", c: "--c-transp" },
  salud: { n: "Salud", i: "i-heart", c: "--c-salud" },
  ocio: { n: "Ocio y salidas", i: "i-ticket", c: "--c-ocio" },
  otros: { n: "Otros", i: "i-dots", c: "--c-otros" },
  ingreso: { n: "Ingreso", i: "i-in", c: "--income" },
};
export const CATS_GASTO = ["comida", "casa", "transporte", "salud", "ocio", "otros"];
export const MEDIOS = ["Yape", "Plin", "Transferencia", "Tarjeta de crédito", "Tarjeta de débito", "Efectivo", "Otro"];

export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const soles = (n, signo = false) => {
  const v = r2(n);
  const s = "S/ " + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return signo ? (v < 0 ? "− " : "+ ") + s : (v < 0 ? "− " : "") + s;
};
export const solesCorto = (n) => "S/ " + Math.round(Number(n) || 0).toLocaleString("en-US");

export const hoyISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
export const mesDe = (iso) => String(iso).slice(0, 7);
export const mesActual = () => hoyISO().slice(0, 7);
export function mesAnterior(ym) { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
export function mesSiguiente(ym) { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const MESES_L = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
export const nombreMes = (ym, largo = false) => { const [y, m] = ym.split("-").map(Number); return largo ? MESES_L[m - 1] : `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)} ${y}`; };
export function fechaLarga(iso) { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MESES[m - 1]} ${y}`; }
export function etiquetaDia(iso) {
  const hoy = hoyISO();
  const ayer = new Date(); ayer.setDate(ayer.getDate() - 1); ayer.setMinutes(ayer.getMinutes() - ayer.getTimezoneOffset());
  const [y, m, d] = iso.split("-").map(Number);
  const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const base = `${d} ${MESES[m - 1]}`;
  if (iso === hoy) return `Hoy, ${base}`;
  if (iso === ayer.toISOString().slice(0, 10)) return `Ayer, ${base}`;
  return `${dias[new Date(y, m - 1, d).getDay()]}, ${base}`;
}
export const diasEnMes = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m, 0).getDate(); };

/** Porcentaje (0-1) que le toca pagar a cada miembro de los gastos compartidos. */
export function reparto(hogar, miembros) {
  const out = {};
  if (miembros.length < 2) { miembros.forEach((m) => (out[m.user_id] = 1)); return out; }
  const [a, b] = miembros;
  let pa = 0.5;
  if (hogar.reparto_modo === "ingresos") {
    const t = Number(a.ingreso_mensual) + Number(b.ingreso_mensual);
    pa = t > 0 ? Number(a.ingreso_mensual) / t : 0.5;
  } else if (hogar.reparto_modo === "fijo") {
    pa = Number(hogar.reparto_fijo_pct) / 100;
  }
  out[a.user_id] = pa; out[b.user_id] = 1 - pa;
  return out;
}
export const pctTexto = (p) => `${Math.round(p * 100)}`;

const esNormal = (m) => m.clase === "normal";
export const delMes = (movs, ym) => movs.filter((m) => mesDe(m.fecha) === ym);

/** Cuánto de un movimiento le corresponde a una persona (para su resumen personal). */
export function parteDe(m, userId, rep) {
  if (m.alcance === "compartido") return r2(m.monto * (rep[userId] ?? 0.5));
  return m.duenio === userId ? Number(m.monto) : 0;
}

export function resumenPersonal(movs, userId, rep, ym) {
  let ingresos = 0, gastos = 0;
  for (const m of delMes(movs, ym)) {
    if (!esNormal(m)) continue;
    if (m.tipo === "ingreso") ingresos += parteDe(m, userId, rep);
    else gastos += parteDe(m, userId, rep);
  }
  return { ingresos: r2(ingresos), gastos: r2(gastos), saldo: r2(ingresos - gastos) };
}

/** Gastos por categoría. modo: 'mio' (mi parte) | 'hogar' (compartidos completos). */
export function porCategoria(movs, ym, modo, userId, rep) {
  const t = {}; let total = 0, n = {};
  for (const m of delMes(movs, ym)) {
    if (!esNormal(m) || m.tipo !== "gasto") continue;
    let v;
    if (modo === "hogar") { if (m.alcance !== "compartido") continue; v = Number(m.monto); }
    else v = parteDe(m, userId, rep);
    if (!v) continue;
    t[m.categoria] = (t[m.categoria] || 0) + v; n[m.categoria] = (n[m.categoria] || 0) + 1; total += v;
  }
  const filas = Object.entries(t).map(([cat, monto]) => ({ cat, monto: r2(monto), n: n[cat], pct: total ? monto / total : 0 }))
    .sort((a, b) => b.monto - a.monto);
  return { total: r2(total), filas };
}

export function porDia(movs, ym, modo, userId, rep) {
  const dias = new Array(diasEnMes(ym)).fill(0);
  for (const m of delMes(movs, ym)) {
    if (!esNormal(m) || m.tipo !== "gasto") continue;
    const v = modo === "hogar" ? (m.alcance === "compartido" ? Number(m.monto) : 0) : parteDe(m, userId, rep);
    dias[Number(m.fecha.slice(8, 10)) - 1] += v;
  }
  return dias.map(r2);
}

/** Cuentas de la pareja en un mes: cuánto pagó y cuánto le tocaba a cada uno. */
export function cuentasPareja(movs, miembros, rep, ym) {
  const ids = miembros.map((m) => m.user_id);
  const r = Object.fromEntries(ids.map((id) => [id, { pago: 0, toca: 0, envio: 0, recibio: 0 }]));
  let total = 0; const pendientes = [];
  for (const m of delMes(movs, ym)) {
    if (m.clase === "saldo_pareja" && r[m.pagado_por]) {
      r[m.pagado_por].envio += Number(m.monto);
      const otro = ids.find((id) => id !== m.pagado_por);
      if (otro) r[otro].recibio += Number(m.monto);
      continue;
    }
    if (!esNormal(m) || m.tipo !== "gasto" || m.alcance !== "compartido") continue;
    total += Number(m.monto); pendientes.push(m);
    if (r[m.pagado_por]) r[m.pagado_por].pago += Number(m.monto);
    ids.forEach((id) => (r[id].toca += Number(m.monto) * (rep[id] ?? 0.5)));
  }
  ids.forEach((id) => { const x = r[id]; x.neto = r2(x.pago - x.toca + x.envio - x.recibio); x.pago = r2(x.pago); x.toca = r2(x.toca); });
  let deudor = null, acreedor = null, monto = 0;
  if (ids.length === 2) {
    const [a, b] = ids;
    if (r[a].neto < -0.005) { deudor = a; acreedor = b; monto = -r[a].neto; }
    else if (r[b].neto < -0.005) { deudor = b; acreedor = a; monto = -r[b].neto; }
  }
  return { total: r2(total), por: r, deudor, acreedor, monto: r2(monto), pendientes };
}

export function presupuestoHogar(movs, presupuestos, ym) {
  const gastado = {};
  for (const m of delMes(movs, ym)) {
    if (esNormal(m) && m.tipo === "gasto" && m.alcance === "compartido") gastado[m.categoria] = (gastado[m.categoria] || 0) + Number(m.monto);
  }
  return presupuestos.filter((p) => Number(p.monto) > 0)
    .map((p) => ({ cat: p.categoria, limite: Number(p.monto), gastado: r2(gastado[p.categoria] || 0), pct: (gastado[p.categoria] || 0) / Number(p.monto) }))
    .sort((a, b) => b.pct - a.pct);
}

/** Próxima fecha (ISO) en que cae un día del mes, desde hoy. */
export function proximaFecha(dia) {
  const hoy = new Date(hoyISO() + "T00:00:00");
  let y = hoy.getFullYear(), m = hoy.getMonth();
  const ajustar = (yy, mm) => Math.min(dia, new Date(yy, mm + 1, 0).getDate());
  let f = new Date(y, m, ajustar(y, m));
  if (f < hoy) { m += 1; f = new Date(y, m, ajustar(y, m)); }
  const iso = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
  return { iso, dias: Math.round((f - hoy) / 86400000) };
}

export function deudaTarjeta(movs, tarjetaId) {
  let d = 0; const lista = [];
  for (const m of movs) {
    if (m.tarjeta_id !== tarjetaId) continue;
    if (m.clase === "pago_tarjeta") d -= Number(m.monto);
    else if (m.tipo === "gasto") { d += Number(m.monto); lista.push(m); }
    else if (m.tipo === "ingreso") d -= Number(m.monto); // devoluciones
  }
  return { deuda: r2(Math.max(0, d)), lista };
}

export function aportesMeta(movs, metaId) {
  const por = {}; let total = 0;
  for (const m of movs) {
    if (m.clase !== "aporte_meta" || m.meta_id !== metaId) continue;
    por[m.pagado_por] = (por[m.pagado_por] || 0) + Number(m.monto); total += Number(m.monto);
  }
  return { total: r2(total), por };
}

export function pagadoEsteMes(fijo) { return !!fijo.ultimo_pago && mesDe(fijo.ultimo_pago) === mesActual(); }

/** Posibles duplicados: mismo nº de operación, o mismo monto + fecha + comercio parecido. */
export function buscarDuplicado(movs, borrador, excluirId) {
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return movs.find((m) => m.id !== excluirId && (
    (borrador.n_operacion && m.n_operacion && norm(m.n_operacion) === norm(borrador.n_operacion)) ||
    (r2(m.monto) === r2(borrador.monto) && m.fecha === borrador.fecha && norm(m.comercio).slice(0, 6) === norm(borrador.comercio).slice(0, 6) && norm(m.comercio))
  )) || null;
}
