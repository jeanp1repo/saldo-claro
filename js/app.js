// Saldo Claro · interfaz y navegación
import { api, DEMO } from "./data.js";
import * as C from "./calc.js";
import { leerLocal } from "./ocr.js";

const $app = document.getElementById("app");
const S = {
  sesion: null, hogar: null, miembros: [], yo: null, pareja: null, rep: {},
  d: { movimientos: [], tarjetas: [], cuotas: [], metas: [], presupuestos: [], pagos_fijos: [], cierres: [] },
  ruta: "inicio", mes: C.mesActual(), sel: null, borrador: null, lote: null, leyendo: false,
  filtros: { texto: "", tipo: "todos", cats: new Set(), medios: new Set(), conCaptura: false },
  statsModo: "mio", loginModo: "entrar", error: "", listo: false,
};

/* ---------------- utilidades ---------------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ic = (id, extra = "") => `<svg class="i" ${extra}><use href="#${id}"/></svg>`;
const miembro = (id) => S.miembros.find((m) => m.user_id === id);
const nombre = (id) => miembro(id)?.nombre || "—";
const inicial = (id) => (nombre(id)[0] || "?").toUpperCase();
const av = (id, sm = false) => `<i class="av ${sm ? "sm " : ""}w-${miembro(id)?.color || "esmeralda"}">${esc(inicial(id))}</i>`;
const avDos = (sm = false) => `<i class="av ${sm ? "sm " : ""}w-2">2</i>`;
const cat = (k) => C.CATS[k] || C.CATS.otros;
const visibles = () => S.d.movimientos.filter((m) => !m.privado || m.creado_por === S.yo.user_id);
let toastT;
function toast(msg) {
  document.querySelector(".toast")?.remove();
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; t.setAttribute("role", "status");
  document.body.appendChild(t); clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 2600);
}
function ir(ruta, extra = {}) { Object.assign(S, extra); if (location.hash !== "#" + ruta) location.hash = ruta; else render(); }

/* ---------------- carga ---------------- */
async function iniciar() {
  try {
    S.sesion = await api.sesion();
    api.onAuth(async (s) => { const antes = S.sesion?.userId; S.sesion = s; if ((s?.userId) !== antes) { await cargarPerfil(); render(); } });
    await cargarPerfil();
  } catch (e) { S.error = e.message; }
  S.listo = true;
  S.ruta = location.hash.slice(1) || "inicio";
  render();
}
async function cargarPerfil() {
  S.hogar = null; S.miembros = []; S.yo = null; S.pareja = null;
  if (!S.sesion) return;
  const p = await api.perfil(S.sesion.userId);
  if (!p) return;
  S.hogar = p.hogar; S.miembros = p.miembros;
  S.yo = p.miembros.find((m) => m.user_id === S.sesion.userId);
  S.pareja = p.miembros.find((m) => m.user_id !== S.sesion.userId) || null;
  S.rep = C.reparto(S.hogar, S.miembros);
  S.d = await api.cargar(S.hogar.id);
}
async function recargar() { const p = await api.perfil(S.sesion.userId); S.hogar = p.hogar; S.miembros = p.miembros;
  S.yo = p.miembros.find((m) => m.user_id === S.sesion.userId); S.pareja = p.miembros.find((m) => m.user_id !== S.sesion.userId) || null;
  S.rep = C.reparto(S.hogar, S.miembros); S.d = await api.cargar(S.hogar.id); }

/* ---------------- piezas ---------------- */
const TABS = [["inicio", "i-home", "Inicio"], ["movimientos", "i-list", "Movimientos"], ["adjuntar", "i-plus", "Adjuntar"], ["pareja", "i-users", "Hogar"], ["estadisticas", "i-chart", "Resumen"]];
const TAB_DE = { lote: "inicio", inicio: "inicio", movimientos: "movimientos", detalle: "movimientos", pareja: "pareja", cierre: "pareja", estadisticas: "estadisticas", tarjetas: "inicio", ajustes: "inicio" };
function tabbar() {
  const act = TAB_DE[S.ruta];
  return `<nav class="tabbar" aria-label="Navegación">${TABS.map(([id, i, lb]) => id === "adjuntar"
    ? `<button type="button" data-go="adjuntar" aria-label="Adjuntar captura"><span class="fab">${ic(i)}</span></button>`
    : `<button type="button" data-go="${id}" class="${act === id ? "act" : ""}" ${act === id ? 'aria-current="page"' : ""}>${ic(i)}${lb}</button>`).join("")}</nav>`;
}
const atras = (ruta, label = "Volver") => `<button class="icon-btn" type="button" data-go="${ruta}" aria-label="${label}">${ic("i-back")}</button>`;
const selMes = () => `<div class="month" role="group" aria-label="Mes"><button type="button" data-act="mes" data-d="-1" aria-label="Mes anterior">${ic("i-back", 'style="width:16px;height:16px"')}</button><span>${C.nombreMes(S.mes)}</span><button type="button" data-act="mes" data-d="1" aria-label="Mes siguiente" ${S.mes >= C.mesActual() ? "disabled style=\"opacity:.3\"" : ""}>${ic("i-next", 'style="width:16px;height:16px"')}</button></div>`;

function badgeQuien(m) {
  if (!S.pareja) return "";
  if (m.alcance === "compartido") return `<span class="who w-2" aria-label="De los dos">A+B</span>`.replace("A+B", esc(inicial(S.yo.user_id) + "+" + inicial(S.pareja.user_id)));
  const due = m.duenio || m.pagado_por;
  return `<span class="who w-${miembro(due)?.color || "esmeralda"}" aria-label="De ${esc(nombre(due))}">${esc(inicial(due))}</span>`;
}
function etiquetaClase(m) {
  if (m.clase === "pago_tarjeta") return "Pago de tarjeta";
  if (m.clase === "saldo_pareja") return `Pago entre ustedes`;
  if (m.clase === "aporte_meta") return "Aporte a meta";
  return cat(m.categoria).n;
}
function txRow(m) {
  const k = m.clase === "normal" ? cat(m.categoria) : { i: m.clase === "pago_tarjeta" ? "i-card" : m.clase === "aporte_meta" ? "i-target" : "i-swap", c: "--brand" };
  const tj = m.tarjeta_id ? S.d.tarjetas.find((t) => t.id === m.tarjeta_id) : null;
  const medio = tj ? `${tj.nombre} ••${tj.ultimos4}` : m.medio;
  return `<button class="tx" type="button" data-act="ver" data-id="${m.id}">
    <span class="cat-ic" style="--c:var(${k.c})">${ic(k.i)}${badgeQuien(m)}</span>
    <span class="mid"><b>${esc(m.comercio || etiquetaClase(m))}</b><small>${m.privado ? `<span class="lock">${ic("i-lock")}Solo tú</span> ·` : ""} ${esc(etiquetaClase(m))} · ${esc(medio)}${m.captura_path ? ` <span class="clip" aria-label="con captura">${ic("i-clip")}</span>` : ""}</small></span>
    <span class="amt num ${m.tipo === "ingreso" ? "in" : ""}">${C.soles(m.tipo === "ingreso" ? m.monto : -m.monto, true)}</span></button>`;
}
function listaAgrupada(movs) {
  if (!movs.length) return `<div class="empty">${ic("i-list")}<span>No hay movimientos con estos filtros.</span></div>`;
  const dias = [...new Set(movs.map((m) => m.fecha))];
  return dias.map((d) => { const rows = movs.filter((m) => m.fecha === d);
    const tot = rows.filter((m) => m.clase === "normal").reduce((s, m) => s + (m.tipo === "ingreso" ? +m.monto : -m.monto), 0);
    return `<div class="day"><span>${C.etiquetaDia(d)}</span><span class="num">${C.soles(tot, true)}</span></div>${rows.map(txRow).join("")}`; }).join("");
}

/* ---------------- pantallas ---------------- */
const P = {};

P.login = () => `<div class="screen"><div class="body"><div class="welcome">
  <div class="logo">S/</div>
  <div><h1>Saldo Claro</h1><p>Sube tus capturas de Yape, Plin o transferencias y lleva tus cuentas, solo o en pareja.</p></div>
  <form class="fields" data-form="login" novalidate>
    <div class="field"><label for="l-email">Correo</label><div class="inp"><input id="l-email" name="email" type="email" autocomplete="email" required></div></div>
    <div class="field"><label for="l-pass">Contraseña</label><div class="inp"><input id="l-pass" name="password" type="password" autocomplete="${S.loginModo === "entrar" ? "current-password" : "new-password"}" minlength="6" required></div>
      ${S.loginModo === "crear" ? `<span class="hint">Mínimo 6 caracteres.</span>` : ""}</div>
    ${S.error ? `<p class="err" role="alert">${esc(S.error)}</p>` : ""}
    <button class="primary" type="submit">${S.loginModo === "entrar" ? "Entrar" : "Crear cuenta"}</button>
    <button class="link" type="button" data-act="login-modo" style="justify-self:center">${S.loginModo === "entrar" ? "¿Primera vez? Crea tu cuenta" : "Ya tengo cuenta"}</button>
  </form></div></div></div>`;

P.bienvenida = () => `<div class="screen"><div class="body"><div class="welcome">
  <div class="logo">S/</div>
  <div><h1>Tu hogar</h1><p>Crea tu hogar y luego comparte el código con tu pareja. Si tu pareja ya lo creó, únete con su código.</p></div>
  <form class="fields" data-form="hogar">
    <div class="field"><label for="h-nombre">¿Cómo te llamas?</label><div class="inp"><input id="h-nombre" name="nombre" autocomplete="given-name" required maxlength="30"></div></div>
    <div class="field"><label for="h-codigo">Código de tu pareja <span class="muted" style="font-weight:500">(solo si te unes)</span></label><div class="inp"><input id="h-codigo" name="codigo" maxlength="6" style="text-transform:uppercase" autocapitalize="characters"></div></div>
    ${S.error ? `<p class="err" role="alert">${esc(S.error)}</p>` : ""}
    <button class="primary" type="submit" name="accion" value="crear">Crear mi hogar</button>
    <button class="secondary" type="submit" name="accion" value="unirse">Unirme con el código</button>
    <button class="link" type="button" data-act="salir" style="justify-self:center">Cerrar sesión</button>
  </form></div></div></div>`;

P.inicio = () => {
  const yo = S.yo.user_id, r = C.resumenPersonal(visibles(), yo, S.rep, S.mes);
  const cp = S.pareja ? C.cuentasPareja(visibles(), S.miembros, S.rep, S.mes) : null;
  const pres = Number(S.yo.presupuesto_personal);
  const deudaT = S.d.tarjetas.map((t) => ({ t, ...C.deudaTarjeta(S.d.movimientos, t.id), prox: C.proximaFecha(t.dia_pago) }));
  const totalT = deudaT.reduce((s, x) => s + x.deuda, 0);
  const ult = visibles().slice(0, 5);
  const diasMes = C.diasEnMes(S.mes), diaHoy = Number(C.hoyISO().slice(8, 10)), quedan = S.mes === C.mesActual() ? diasMes - diaHoy + 1 : 0;
  let pareja = "";
  if (!S.pareja) pareja = `<button class="home-mini" type="button" data-go="pareja"><span class="avs">${av(yo)}${avDos()}</span><span class="t"><b>Invita a tu pareja</b><small>Compártele el código ${esc(S.hogar.codigo)}</small></span><span class="link">Ver</span></button>`;
  else if (cp.monto > 0) {
    const yoDebo = cp.deudor === yo;
    pareja = `<button class="home-mini" type="button" data-go="saldar"><span class="avs">${av(cp.deudor)}${av(cp.acreedor)}</span><span class="t"><b>${yoDebo ? `Le debes a ${esc(nombre(cp.acreedor))}` : `${esc(nombre(cp.deudor))} te debe`} ${C.soles(cp.monto)}</b><small>Gastos de la casa de ${C.nombreMes(S.mes, true)}</small></span><span class="link">Saldar</span></button>`;
  } else pareja = `<button class="home-mini" type="button" data-go="pareja"><span class="avs">${av(yo)}${av(S.pareja.user_id)}</span><span class="t"><b>Cuentas al día con ${esc(S.pareja.nombre)}</b><small>Nadie le debe a nadie este mes</small></span><span class="link">Hogar</span></button>`;
  return `<div class="screen"><div class="body">
    <div class="hdr"><div><div class="sub">Hola, ${esc(S.yo.nombre)}</div><h3>Tu mes</h3></div>
      <div style="display:flex;gap:8px;align-items:center">${selMes()}<button class="icon-btn" type="button" data-go="ajustes" aria-label="Ajustes">${ic("i-gear")}</button></div></div>
    <div class="balance"><div><div class="lbl">Saldo del mes</div><div class="big num"><small>S/</small>${C.soles(r.saldo).replace("S/ ", "")}</div></div>
      <div class="split"><div><span>Ingresos</span><b class="num">+ ${C.soles(r.ingresos)}</b></div><div><span>Gastos</span><b class="num">− ${C.soles(r.gastos)}</b></div></div></div>
    ${S.borrador ? `<button class="pending" type="button" data-go="revisar"><span class="ic">${ic("i-scan")}</span><span style="flex:1"><b>Tienes una captura sin guardar</b><small>Revisa los datos y guárdala para que cuente en tu saldo</small></span>${ic("i-next", 'style="color:var(--muted)"')}</button>` : ""}
    ${pareja}
    ${pres > 0 ? `<div class="card budget"><div class="sec-h"><h4>Tu presupuesto de gastos</h4><span class="muted num" style="font-size:13px">${C.solesCorto(r.gastos)} de ${C.solesCorto(pres)}</span></div>
      <div class="bar ${r.gastos > pres ? "warnb" : ""}"><i style="width:${Math.min(100, (r.gastos / pres) * 100)}%"></i></div>
      <small class="muted">${r.gastos > pres ? `Te pasaste por ${C.soles(r.gastos - pres)}` : quedan ? `Te quedan ${C.soles(pres - r.gastos)} para ${quedan} día${quedan === 1 ? "" : "s"} · unos ${C.solesCorto((pres - r.gastos) / quedan)} por día` : `Quedaron ${C.soles(pres - r.gastos)} sin gastar`}</small></div>`
      : `<button class="home-mini" type="button" data-act="perfil">${ic("i-target", 'style="color:var(--brand)"')}<span class="t"><b>Define tu presupuesto mensual</b><small>Te diremos cuánto puedes gastar por día</small></span></button>`}
    <button class="cta" type="button" data-go="adjuntar">${ic("i-scan")} Adjuntar captura</button>
    ${S.d.tarjetas.length ? `<div class="card cc"><div class="sec-h"><h4>Debes en tarjetas</h4><button class="link" type="button" data-go="tarjetas">Ver tarjetas</button></div>
      <div class="cc-total num">${C.soles(totalT)}</div>
      ${deudaT.map((x) => `<button class="cc-row" type="button" data-go="tarjetas"><span class="cc-chip" style="--c1:var(--${x.t.color === "rosado" ? "rose" : "brand"})"></span><span class="mid"><b>${esc(x.t.nombre)} ••${esc(x.t.ultimos4)}</b><small>Pagar hasta el ${C.fechaLarga(x.prox.iso)}</small></span><span class="amt num">${C.soles(x.deuda)}</span></button>`).join("")}
      ${(() => { const p = deudaT.filter((x) => x.deuda > 0).sort((a, b) => a.prox.dias - b.prox.dias)[0]; return p ? `<div class="due">${ic("i-bell")}<span>${p.prox.dias === 0 ? "<b>Hoy</b> vence" : `Faltan <b>${p.prox.dias} día${p.prox.dias === 1 ? "" : "s"}</b> para`} el pago de ${esc(p.t.nombre)}</span></div>` : ""; })()}</div>`
      : `<button class="home-mini" type="button" data-go="tarjetas">${ic("i-card", 'style="color:var(--brand)"')}<span class="t"><b>Agrega tus tarjetas de crédito</b><small>Para saber cuánto debes y cuándo pagar</small></span></button>`}
    <div><div class="sec-h"><h4>Últimos movimientos</h4><button class="link" type="button" data-go="movimientos">Ver todos</button></div>
      ${ult.length ? ult.map(txRow).join("") : `<div class="empty">${ic("i-scan")}<span>Aún no hay movimientos. Adjunta tu primera captura.</span></div>`}</div>
  </div>${tabbar()}</div>`;
};

P.adjuntar = () => {
  if (S.leyendo) return `<div class="screen"><div class="body"><div class="hdr"><h3>Leyendo tu captura</h3></div>
    ${S.leyendo.url ? `<div class="shot"><img src="${S.leyendo.url}" alt="Captura que adjuntaste"></div>` : ""}
    <div class="reading"><div class="spinner" aria-hidden="true"></div><b>${S.leyendo.ia ? "Leyendo con IA…" : "Leyendo monto, fecha y comercio…"}</b><span class="muted" style="font-size:13px">${S.leyendo.ia ? "Suele tardar unos segundos." : "Se lee gratis en tu celular. La primera vez descarga el lector (unos segundos más)."}</span></div></div></div>`;
  const pre = S.preset;
  const titulo = pre?.clase === "pago_tarjeta" ? "Pago de tarjeta" : pre?.clase === "saldo_pareja" ? "Pago entre ustedes" : "Adjuntar captura";
  return `<div class="screen"><div class="body">
    <div class="hdr">${atras(pre?.volver || "inicio")}<h3 style="flex:1">${titulo}</h3></div>
    <label class="drop" data-drop for="f-galeria">
      <div class="big-ic">${ic("i-image")}</div><b>Sube o pega tu captura</b>
      <p>Leemos el monto, la fecha, el comercio y el medio de pago. Tú revisas antes de guardar.</p>
      <p style="font-size:12.5px">En computadora: <span class="kbd">Ctrl</span> + <span class="kbd">V</span> o arrastra la imagen</p>
    </label>
    <div class="src">
      <label for="f-galeria">${ic("i-image")}Galería</label>
      <label for="f-camara">${ic("i-camera")}Cámara</label>
      <button type="button" data-act="manual">${ic("i-pencil")}A mano</button>
    </div>
    <input id="f-galeria" type="file" accept="image/*" hidden data-file>
    <input id="f-camara" type="file" accept="image/*" capture="environment" hidden data-file>
    <div><div class="lbl" style="margin-bottom:8px">Funciona con</div>
      <div class="supported"><span>Yape</span><span>Plin</span><span>Transferencias</span><span>Boletas y facturas</span><span>Recibos de luz y agua</span><span>Vouchers de tarjeta</span><span>Estados de cuenta</span></div></div>
    <div class="read-ok">${ic("i-check")}<span>La lectura es <b>gratis</b> y ocurre en tu celular. Si algo sale mal, puedes probar “Leer mejor con IA”.</span></div>
  </div>${pre ? "" : tabbar()}</div>`;
};

function itemActual() { return S.borrador.items[S.borrador.idx]; }
const confTag = (c) => !c ? "" : c === "alta" ? `<span class="conf alta">${ic("i-check")}Seguro</span>` : `<span class="conf ${c}">${ic("i-alert")}Revisa</span>`;
P.revisar = () => {
  const b = S.borrador; if (!b || S.leyendo) return P.adjuntar();
  const it = itemActual(), yo = S.yo.user_id, pj = S.pareja?.user_id;
  const n = b.items.length, esEdit = !!b.editId, clase = b.preset?.clase || it.clase || "normal";
  const quien = it.alcance === "compartido" ? "ambos" : it.duenio === yo ? "yo" : "pareja";
  const dup = C.buscarDuplicado(S.d.movimientos, it, b.editId);
  const tjs = S.d.tarjetas;
  const especial = clase === "pago_tarjeta" ? `Pago a ${esc((tjs.find((t) => t.id === (b.preset?.tarjeta_id || it.tarjeta_id)) || {}).nombre || "tarjeta")}` : clase === "saldo_pareja" ? `${esc(nombre(it.pagado_por))} le paga a ${esc(nombre(S.miembros.find((m) => m.user_id !== it.pagado_por)?.user_id))}` : clase === "aporte_meta" ? "Aporte a una meta" : "";
  return `<div class="screen"><div class="body">
    <div class="hdr">${atras(esEdit ? "detalle" : "adjuntar")}<h3 style="flex:1">${esEdit ? "Editar movimiento" : "Revisa los datos"}</h3>${n > 1 ? `<span class="muted num" style="font-size:13px">${b.idx + 1} de ${n}</span>` : ""}</div>
    ${b.imagenUrl ? `<div class="shot"><img src="${b.imagenUrl}" alt="Captura adjunta"></div>` : ""}
    ${b.aviso ? `<div class="read-ok ${b.error ? "warn" : ""}">${ic(b.error ? "i-alert" : "i-check")}<span>${esc(b.aviso)}</span></div>` : ""}
    ${b.b64 && !esEdit && !b.conIA ? `<button class="btn-ghost" type="button" data-act="leer-ia">${ic("i-scan")}¿Se leyó mal? Leer mejor con IA</button>` : ""}
    ${especial ? `<div class="read-ok">${ic("i-swap")}<span><b>${especial}</b>. No cuenta como gasto nuevo.</span></div>` : ""}
    <form class="fields" data-form="mov" novalidate>
      ${clase === "normal" ? `<div class="type-toggle" role="group" aria-label="Tipo">
        <button type="button" class="out" aria-pressed="${it.tipo === "gasto"}" data-pick="tipo" data-v="gasto">Gasto</button>
        <button type="button" aria-pressed="${it.tipo === "ingreso"}" data-pick="tipo" data-v="ingreso">Ingreso</button></div>` : ""}
      ${S.pareja && clase === "normal" ? `<div class="field"><span class="flabel">¿De quién es?</span>
        <div class="type-toggle three" role="group" aria-label="De quién es">
          <button type="button" aria-pressed="${quien === "yo"}" data-pick="quien" data-v="yo">Mío</button>
          <button type="button" aria-pressed="${quien === "pareja"}" data-pick="quien" data-v="pareja">De ${esc(S.pareja.nombre)}</button>
          <button type="button" aria-pressed="${quien === "ambos"}" data-pick="quien" data-v="ambos">De los dos</button></div>
        <div data-split></div></div>` : ""}
      <div class="field"><div class="top-l"><label for="f-monto">Monto</label>${confTag(it.conf?.monto)}</div>
        <div class="inp money ${it.conf?.monto && it.conf.monto !== "alta" ? "warn" : ""}"><span class="pre">S/</span><input id="f-monto" name="monto" class="num" inputmode="decimal" value="${it.monto ? C.r2(it.monto).toFixed(2) : ""}" placeholder="0.00" required></div>
        ${it.moneda === "USD" ? `<span class="hint warn">La captura está en dólares. Escribe el monto en soles.</span>` : ""}</div>
      <div class="field"><div class="top-l"><label for="f-com">${it.tipo === "ingreso" ? "De quién lo recibiste" : "Comercio o persona"}</label>${confTag(it.conf?.comercio)}</div>
        <div class="inp ${it.conf?.comercio && it.conf.comercio !== "alta" ? "warn" : ""}"><input id="f-com" name="comercio" value="${esc(it.comercio)}" maxlength="80" placeholder="Ej.: Bodega Don Lucho"></div></div>
      <div class="row2">
        <div class="field"><div class="top-l"><label for="f-fecha">Fecha</label>${confTag(it.conf?.fecha)}</div>
          <div class="inp ${it.conf?.fecha && it.conf.fecha !== "alta" ? "warn" : ""}"><input id="f-fecha" name="fecha" type="date" value="${esc(it.fecha)}" required></div></div>
        <div class="field"><label for="f-medio">Medio</label>
          <div class="inp"><select id="f-medio" name="medio" data-medio>${C.MEDIOS.map((m) => `<option ${m === it.medio ? "selected" : ""}>${m}</option>`).join("")}</select>${ic("i-down", 'style="width:16px;color:var(--muted)"')}</div></div>
      </div>
      <div class="field" data-tarjeta ${it.medio === "Tarjeta de crédito" && clase === "normal" ? "" : "hidden"}><label for="f-tarjeta">Tarjeta</label>
        <div class="inp"><select id="f-tarjeta" name="tarjeta_id"><option value="">Sin tarjeta registrada</option>${tjs.map((t) => `<option value="${t.id}" ${t.id === it.tarjeta_id ? "selected" : ""}>${esc(t.nombre)} ••${esc(t.ultimos4)}</option>`).join("")}</select></div></div>
      ${clase === "normal" ? `<div class="field"><span class="flabel">Categoría</span><div class="chips wrap" role="group" aria-label="Categoría">
        ${(it.tipo === "ingreso" ? ["ingreso", "otros"] : C.CATS_GASTO).map((k) => `<button class="chip" type="button" aria-pressed="${it.categoria === k}" data-pick="categoria" data-v="${k}" style="--c:var(${cat(k).c})"><span class="dot"></span>${cat(k).n}</button>`).join("")}</div></div>` : ""}
      <div class="field"><label for="f-nota">Nota <span class="muted" style="font-weight:500">(opcional)</span></label><div class="inp"><input id="f-nota" name="nota" value="${esc(it.nota)}" maxlength="120" placeholder="Ej.: pan y leche"></div></div>
      <div class="field"><label for="f-op">Nº de operación <span class="muted" style="font-weight:500">(evita duplicados)</span></label><div class="inp"><input id="f-op" name="n_operacion" value="${esc(it.n_operacion)}" maxlength="40" inputmode="numeric"></div></div>
      ${clase === "normal" && quien === "yo" ? `<div class="sw-row">${ic("i-lock")}<span class="t"><b>Solo yo lo veo</b><small>Útil para regalos. No entra en las cuentas del hogar.</small></span><button class="sw" type="button" role="switch" aria-checked="${!!it.privado}" aria-label="Movimiento privado" data-sw="privado"></button></div>` : ""}
      ${dup ? `<div class="dup bad">${ic("i-copy")}<span>Parece repetido: ya guardaste <b>${esc(dup.comercio)}</b> por ${C.soles(dup.monto)} el ${C.fechaLarga(dup.fecha)}. Revísalo antes de guardar.</span></div>` : ""}
      ${S.error ? `<p class="err" role="alert">${esc(S.error)}</p>` : ""}
    </form>
  </div>
  <div class="actions"><button class="secondary" type="button" data-act="descartar">${esEdit ? "Cancelar" : n > 1 ? "Saltar" : "Descartar"}</button>
    <button class="primary" type="button" data-act="guardar-mov">${ic("i-check")}${esEdit ? "Guardar cambios" : "Guardar movimiento"}</button></div></div>`;
};
function pintarReparto() {
  const el = document.querySelector("[data-split]"); if (!el || !S.borrador) return;
  const it = itemActual(); const monto = parseFloat(String(document.getElementById("f-monto")?.value || "0").replace(",", ".")) || 0;
  if (it.alcance !== "compartido") {
    el.innerHTML = it.duenio !== S.yo.user_id ? `<span class="hint">Se registra como gasto de ${esc(S.pareja.nombre)}.</span>` : "";
    return;
  }
  const [a, b] = S.miembros;
  el.innerHTML = `<div class="split-line">${av(a.user_id, true)}${esc(a.nombre)} ${C.soles(monto * S.rep[a.user_id])}<span class="muted">·</span>${av(b.user_id, true)}${esc(b.nombre)} ${C.soles(monto * S.rep[b.user_id])}
    <span class="muted" style="margin-left:auto">${C.pctTexto(S.rep[a.user_id])}/${C.pctTexto(S.rep[b.user_id])}</span></div>
    <div class="split-line" style="margin-top:6px"><span class="muted">Pagó:</span>${S.miembros.map((m) => `<button class="chip" type="button" aria-pressed="${it.pagado_por === m.user_id}" data-pick="pagado_por" data-v="${m.user_id}">${esc(m.user_id === S.yo.user_id ? "Yo" : m.nombre)}</button>`).join("")}</div>`;
}

P.lote = () => {
  const L = S.lote; if (!L) return P.adjuntar();
  const sel = L.items.filter((x) => x.sel), total = sel.filter((x) => x.clase !== "pago_tarjeta").reduce((s, x) => s + (x.tipo === "ingreso" ? -x.monto : x.monto), 0);
  const tjs = S.d.tarjetas, credito = L.items.some((x) => x.medio === "Tarjeta de crédito");
  const dias = [...new Set(L.items.map((x) => x.fecha))];
  return `<div class="screen"><div class="body">
    <div class="hdr">${atras("adjuntar")}<div style="flex:1"><h3>${L.items.length} movimientos</h3><div class="sub">Marca los que quieres guardar</div></div></div>
    ${L.aviso ? `<div class="read-ok">${ic("i-check")}<span>${esc(L.aviso)}</span></div>` : ""}
    ${!L.conIA && L.b64 ? `<button class="btn-ghost" type="button" data-act="lote-ia">${ic("i-scan")}¿Faltan o salieron mal? Leer mejor con IA</button>` : ""}
    ${S.pareja ? `<div class="field"><span class="flabel">¿De quién son?</span><div class="type-toggle" role="group" aria-label="De quién son">
      <button type="button" aria-pressed="${L.alcance === "propio"}" data-act="lote-alcance" data-v="propio">Míos</button>
      <button type="button" aria-pressed="${L.alcance === "compartido"}" data-act="lote-alcance" data-v="compartido">De los dos</button></div></div>` : ""}
    ${credito ? `<div class="field"><label for="l-tj">Tarjeta</label><div class="inp"><select id="l-tj" data-lote-tj><option value="">Sin tarjeta registrada</option>${tjs.map((t) => `<option value="${t.id}" ${t.id === L.tarjeta_id ? "selected" : ""}>${esc(t.nombre)} ••${esc(t.ultimos4)}</option>`).join("")}</select>${ic("i-down", 'style="width:16px;color:var(--muted)"')}</div></div>` : ""}
    <div class="chips"><button class="chip" type="button" data-act="lote-todos" data-v="1">Marcar todos</button><button class="chip" type="button" data-act="lote-todos" data-v="0">Quitar todos</button>
      <span class="muted num" style="font-size:13px;margin-left:auto;align-self:center;white-space:nowrap">Gastos: ${C.soles(total)}</span></div>
    <div>${dias.map((d) => `<div class="day"><span>${C.etiquetaDia(d)}</span></div>${L.items.filter((x) => x.fecha === d).map((x) => {
      const k = x.clase === "pago_tarjeta" ? { i: "i-card", c: "--brand" } : cat(x.categoria);
      return `<div class="tx lote-row" style="${x.sel ? "" : "opacity:.5"}">
        <button class="sw" type="button" role="switch" aria-checked="${x.sel}" aria-label="Guardar ${esc(x.comercio)}" data-act="lote-sel" data-i="${x.i}" style="width:44px;height:28px"></button>
        <span class="mid"><input class="lote-name" data-lote-nom="${x.i}" value="${esc(x.comercio)}" placeholder="Sin nombre" aria-label="Nombre del movimiento" maxlength="80">
          <small>${x.clase === "pago_tarjeta" ? "Pago de tarjeta" : `<span class="inp" style="min-height:0;padding:0 4px;border-radius:8px;display:inline-flex"><select data-lote-cat="${x.i}" style="font-size:12.5px;padding:2px 0;font-weight:600">${C.CATS_GASTO.map((c) => `<option value="${c}" ${x.categoria === c ? "selected" : ""}>${cat(c).n}</option>`).join("")}${x.tipo === "ingreso" ? `<option value="ingreso" selected>Ingreso</option>` : ""}</select></span>`}
          ${x.dup ? `<span class="pill warn">Ya guardado</span>` : ""}${x.moneda === "USD" ? `<span class="pill warn">En dólares</span>` : ""}</small></span>
        <span class="amt num ${x.tipo === "ingreso" ? "in" : ""}">${x.moneda === "USD" ? "US$ " : "S/ "}${C.r2(x.monto).toFixed(2)}</span></div>`; }).join("")}`).join("")}</div>
    ${L.items.some((x) => x.moneda === "USD") ? `<span class="hint warn">Los movimientos en dólares no se guardan solos: pásalos a soles y agrégalos a mano.</span>` : ""}
    ${S.error ? `<p class="err" role="alert">${esc(S.error)}</p>` : ""}
  </div>
  <div class="actions"><button class="secondary" type="button" data-act="lote-cancelar">Descartar</button>
    <button class="primary" type="button" data-act="lote-guardar" ${sel.length ? "" : "disabled"}>${ic("i-check")}Guardar ${sel.length}</button></div></div>`;
};

P.movimientos = () => {
  const f = S.filtros, q = f.texto.trim().toLowerCase();
  let movs = C.delMes(visibles(), S.mes);
  if (f.tipo !== "todos") movs = movs.filter((m) => m.tipo === (f.tipo === "gastos" ? "gasto" : "ingreso"));
  if (f.cats.size) movs = movs.filter((m) => f.cats.has(m.categoria));
  if (f.medios.size) movs = movs.filter((m) => f.medios.has(m.medio) || (f.medios.has("Tarjeta") && m.tarjeta_id));
  if (f.conCaptura) movs = movs.filter((m) => m.captura_path);
  if (f.quien === "compartido") movs = movs.filter((m) => m.alcance === "compartido");
  if (q) movs = movs.filter((m) => `${m.comercio} ${m.nota} ${m.monto} ${cat(m.categoria).n}`.toLowerCase().includes(q));
  const ing = movs.filter((m) => m.clase === "normal" && m.tipo === "ingreso").reduce((s, m) => s + +m.monto, 0);
  const gas = movs.filter((m) => m.clase === "normal" && m.tipo === "gasto").reduce((s, m) => s + +m.monto, 0);
  const chip = (grupo, v, label, on, extra = "") => `<button class="chip" type="button" aria-pressed="${on}" data-act="filtro" data-g="${grupo}" data-v="${esc(v)}" ${extra}>${label}</button>`;
  return `<div class="screen"><div class="body">
    <div class="hdr"><h3>Movimientos</h3>${selMes()}</div>
    <label class="search">${ic("i-search")}<input id="f-buscar" type="search" placeholder="Buscar comercio, monto o nota" value="${esc(f.texto)}" aria-label="Buscar movimientos" data-buscar></label>
    <div class="chips">${chip("tipo", "todos", "Todos", f.tipo === "todos")}${chip("tipo", "gastos", "Gastos", f.tipo === "gastos")}${chip("tipo", "ingresos", "Ingresos", f.tipo === "ingresos")}
      ${S.pareja ? chip("quien", "compartido", "De los dos", f.quien === "compartido") : ""}${chip("captura", "1", `${ic("i-clip", 'style="width:14px;height:14px"')}Con captura`, f.conCaptura)}</div>
    <div class="chips">${C.CATS_GASTO.map((k) => chip("cat", k, `<span class="dot"></span>${cat(k).n}`, f.cats.has(k), `style="--c:var(${cat(k).c})"`)).join("")}
      ${["Yape", "Plin", "Transferencia", "Tarjeta", "Efectivo"].map((m) => chip("medio", m, m, f.medios.has(m))).join("")}</div>
    <div class="totals"><div><span>Ingresos</span><b class="num" style="color:var(--income)">+ ${C.soles(ing)}</b></div><div><span>Gastos</span><b class="num">− ${C.soles(gas)}</b></div></div>
    <div>${listaAgrupada(movs)}</div>
  </div>${tabbar()}</div>`;
};

P.detalle = () => {
  const m = S.d.movimientos.find((x) => x.id === S.sel);
  if (!m) return P.movimientos();
  const k = m.clase === "normal" ? cat(m.categoria) : { i: "i-swap", c: "--brand" };
  const tj = m.tarjeta_id ? S.d.tarjetas.find((t) => t.id === m.tarjeta_id) : null;
  const puede = !m.privado || m.creado_por === S.yo.user_id;
  return `<div class="screen"><div class="body">
    <div class="hdr">${atras("movimientos")}<h3 style="flex:1;text-align:center">Detalle</h3>${puede ? `<button class="icon-btn" type="button" data-act="editar" aria-label="Editar">${ic("i-edit")}</button>` : `<span style="width:42px"></span>`}</div>
    <div class="det-head"><span class="cat-ic" style="--c:var(${k.c})">${ic(k.i)}</span>
      <div class="muted" style="font-size:14px;font-weight:600">${esc(m.comercio || etiquetaClase(m))}</div>
      <div class="amtbig num" style="${m.tipo === "ingreso" ? "color:var(--income)" : ""}">${C.soles(m.tipo === "ingreso" ? m.monto : -m.monto, true)}</div>
      ${m.captura_path ? `<span class="pill ok">Guardado desde captura</span>` : `<span class="pill wait">Ingresado a mano</span>`}</div>
    <div class="card kv">
      <div><span>Tipo</span><b>${esc(etiquetaClase(m))}</b></div>
      <div><span>Fecha</span><b class="num">${C.fechaLarga(m.fecha)}${m.hora ? " · " + esc(String(m.hora).slice(0, 5)) : ""}</b></div>
      <div><span>Medio de pago</span><b>${esc(tj ? `${tj.nombre} ••${tj.ultimos4}` : m.medio)}</b></div>
      ${S.pareja ? `<div><span>De quién es</span><b>${m.alcance === "compartido" ? "De los dos" : esc(nombre(m.duenio))}</b></div>
        ${m.alcance === "compartido" ? `<div><span>Pagó</span><b>${esc(nombre(m.pagado_por))}</b></div><div><span>Reparto</span><b class="num">${S.miembros.map((x) => `${esc(x.nombre)} ${C.soles(m.monto * S.rep[x.user_id])}`).join(" · ")}</b></div>` : ""}` : ""}
      ${m.n_operacion ? `<div><span>Nº de operación</span><b class="num">${esc(m.n_operacion)}</b></div>` : ""}
      ${m.nota ? `<div><span>Nota</span><b>${esc(m.nota)}</b></div>` : ""}
      ${m.privado ? `<div><span>${ic("i-lock", 'style="width:15px;height:15px"')}Privado</span><b>Solo tú lo ves</b></div>` : ""}
      <div><span>Registró</span><b>${esc(nombre(m.creado_por))}</b></div>
    </div>
    ${m.captura_path ? `<div><div class="sec-h" style="margin-bottom:8px"><h4>Captura original</h4></div><div class="shot big" data-captura="${esc(m.captura_path)}"><span class="muted" style="font-size:13px">Cargando captura…</span></div></div>` : ""}
    ${puede ? `<div class="det-actions">
      <button class="btn-ghost" type="button" data-act="editar">${ic("i-edit")}Editar</button>
      <button class="btn-ghost" type="button" data-act="duplicar">${ic("i-copy")}Duplicar</button></div>
      <div data-del-zone><button class="danger" type="button" data-act="pre-borrar">${ic("i-trash")}Eliminar movimiento</button></div>` : ""}
  </div>${tabbar()}</div>`;
};

P.estadisticas = () => {
  const yo = S.yo.user_id, modo = S.pareja ? S.statsModo : "mio";
  const pc = C.porCategoria(visibles(), S.mes, modo, yo, S.rep);
  const prev = C.porCategoria(visibles(), C.mesAnterior(S.mes), modo, yo, S.rep);
  const prevDe = Object.fromEntries(prev.filas.map((f) => [f.cat, f.monto]));
  const limite = modo === "hogar" ? S.d.presupuestos.reduce((s, p) => s + +p.monto, 0) : Number(S.yo.presupuesto_personal);
  let acc = 0;
  const grad = pc.filas.map((f) => { const a = acc; acc += f.pct * 100; return `var(${cat(f.cat).c}) ${a}% ${acc}%`; }).join(",");
  const dias = C.porDia(visibles(), S.mes, modo, yo, S.rep), mx = Math.max(...dias, 0);
  const imx = dias.indexOf(mx), dm = dias.length;
  return `<div class="screen"><div class="body">
    <div class="hdr"><h3>Resumen</h3>${selMes()}</div>
    ${S.pareja ? `<div class="chips"><button class="chip" type="button" aria-pressed="${modo === "mio"}" data-act="stats" data-v="mio">Mis gastos</button><button class="chip" type="button" aria-pressed="${modo === "hogar"}" data-act="stats" data-v="hogar">Gastos de la casa</button></div>` : ""}
    ${pc.total ? `<div class="card donut-wrap">
      <div class="donut" style="background:conic-gradient(${grad})" role="img" aria-label="Gastos por categoría: ${pc.filas.map((f) => `${cat(f.cat).n} ${Math.round(f.pct * 100)}%`).join(", ")}">
        <div><span><small>Gastado</small><br><b class="num">${C.solesCorto(pc.total)}</b>${limite ? `<br><small>de ${C.solesCorto(limite)}</small>` : ""}</span></div></div>
      <div class="legend">${pc.filas.map((f) => `<div style="--c:var(${cat(f.cat).c})"><i></i><span>${cat(f.cat).n}</span><b class="num">${Math.round(f.pct * 100)}%</b></div>`).join("")}</div></div>
    <div class="card cat-rows"><div class="sec-h"><h4>Por categoría</h4><span class="muted" style="font-size:12.5px">vs. ${C.nombreMes(C.mesAnterior(S.mes), true)}</span></div>
      ${pc.filas.map((f) => { const p = prevDe[f.cat]; const d = p ? Math.round(((f.monto - p) / p) * 100) : null;
        return `<div class="cat-row" style="--c:var(${cat(f.cat).c})"><span class="cat-ic">${ic(cat(f.cat).i)}</span><div><div class="t"><b>${cat(f.cat).n}</b><span class="num">${C.soles(f.monto)}</span></div><div class="bar"><i style="width:${(f.monto / pc.filas[0].monto) * 100}%"></i></div>
          <small>${f.n} movimiento${f.n === 1 ? "" : "s"}${d !== null ? ` · <span class="delta ${d > 0 ? "up" : "down"}">${d > 0 ? "+" : ""}${d}%</span>` : " · nuevo este mes"}</small></div></div>`; }).join("")}</div>
    <div class="card"><div class="sec-h"><h4>Gasto por día</h4><span class="muted num" style="font-size:12.5px">Mayor: ${imx + 1} ${C.nombreMes(S.mes).split(" ")[0].toLowerCase()} · ${C.solesCorto(mx)}</span></div>
      <div class="daily">${dias.map((v, i) => `<i class="${v === mx && mx > 0 ? "max" : ""}" style="height:${mx ? Math.max(2, (v / mx) * 100) : 2}%" title="${i + 1}: ${C.soles(v)}"></i>`).join("")}</div>
      <div class="daily-ax"><span>1</span><span>${Math.round(dm / 3)}</span><span>${Math.round((dm * 2) / 3)}</span><span>${dm}</span></div></div>`
    : `<div class="card empty">${ic("i-chart")}<span>No hay gastos en ${C.nombreMes(S.mes, true)}.</span></div>`}
  </div>${tabbar()}</div>`;
};

P.tarjetas = () => {
  const lista = S.d.tarjetas.map((t) => ({ t, ...C.deudaTarjeta(S.d.movimientos, t.id), prox: C.proximaFecha(t.dia_pago) }));
  const total = lista.reduce((s, x) => s + x.deuda, 0);
  const prox = lista.filter((x) => x.deuda > 0).sort((a, b) => a.prox.dias - b.prox.dias)[0];
  const cuotas = S.d.cuotas;
  const ids = new Set(S.d.tarjetas.map((t) => t.id));
  const movsT = visibles().filter((m) => m.tarjeta_id && ids.has(m.tarjeta_id)).slice(0, 8);
  return `<div class="screen"><div class="body">
    <div class="hdr">${atras("inicio")}<h3 style="flex:1">Tarjetas</h3><button class="icon-btn" type="button" data-act="tarjeta-nueva" aria-label="Agregar tarjeta">${ic("i-plus")}</button></div>
    ${lista.length ? `<div class="card" style="display:grid;gap:4px"><div class="lbl">Deuda total en tarjetas</div><div class="cc-total num" style="font-size:32px">${C.soles(total)}</div>
      ${prox ? `<small class="muted">Próximo pago: ${esc(prox.t.nombre)} ••${esc(prox.t.ultimos4)} · ${C.fechaLarga(prox.prox.iso)} · ${prox.prox.dias === 0 ? "hoy" : `faltan ${prox.prox.dias} días`}</small>` : `<small class="muted">No tienes deuda pendiente.</small>`}</div>
    ${lista.map((x) => `<div class="plastic" style="--c1:var(--${x.t.color === "rosado" ? "rose" : "brand"})">
        <div class="pl-top"><b>${esc(x.t.nombre)} ••${esc(x.t.ultimos4)}</b><button type="button" data-act="tarjeta-editar" data-id="${x.t.id}" aria-label="Editar tarjeta" style="border:0;background:none;color:inherit;padding:4px">${ic("i-edit")}</button></div>
        <div><span>Debes</span><div class="pl-amt num">${C.soles(x.deuda)}</div></div>
        ${x.t.linea > 0 ? `<div class="pl-bar"><i style="width:${Math.min(100, (x.deuda / x.t.linea) * 100)}%"></i></div>` : ""}
        <div class="pl-foot"><span>${x.t.linea > 0 ? `Usas ${Math.round((x.deuda / x.t.linea) * 100)}% de ${C.solesCorto(x.t.linea)}` : "Sin línea registrada"}</span><span>Paga hasta ${C.fechaLarga(x.prox.iso)}</span></div>
        <button class="secondary" type="button" data-act="pagar-tarjeta" data-id="${x.t.id}" style="background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.3);color:#fff;min-height:44px">${ic("i-check")}Registrar pago</button>
      </div>`).join("")}
    <div class="card cat-rows"><div class="sec-h"><h4>Compras en cuotas</h4><button class="link" type="button" data-act="cuota-nueva">Agregar</button></div>
      ${cuotas.length ? cuotas.map((q) => { const t = S.d.tarjetas.find((x) => x.id === q.tarjeta_id); const falta = q.total_cuotas - q.cuotas_pagadas;
        return `<div class="cat-row" style="--c:var(--c-casa)"><span class="cat-ic">${ic("i-card")}</span><div><div class="t"><b>${esc(q.descripcion)}</b><span class="num">${C.soles(q.monto_cuota)}/mes</span></div><div class="bar"><i style="width:${(q.cuotas_pagadas / q.total_cuotas) * 100}%"></i></div>
          <small>Cuota ${q.cuotas_pagadas} de ${q.total_cuotas} · ${esc(t?.nombre || "")} · ${falta > 0 ? `quedan ${C.soles(falta * q.monto_cuota)}` : "pagada"} ${falta > 0 ? `· <button class="link" type="button" data-act="cuota-pagada" data-id="${q.id}">Pagué una</button>` : `· <button class="link" type="button" data-act="cuota-borrar" data-id="${q.id}">Quitar</button>`}</small></div></div>`; }).join("")
      : `<span class="muted" style="font-size:13.5px">Registra compras en cuotas para ver cuántas te faltan.</span>`}</div>
    <div><div class="sec-h"><h4>Últimos movimientos con tarjeta</h4></div>${movsT.length ? movsT.map(txRow).join("") : `<div class="empty"><span>Al guardar un gasto con tarjeta de crédito, aparece aquí.</span></div>`}</div>`
    : `<div class="card empty">${ic("i-card")}<b>Aún no tienes tarjetas</b><span>Agrega tu tarjeta de crédito para ver cuánto debes y cuándo pagar.</span><button class="primary" type="button" data-act="tarjeta-nueva" style="width:auto">Agregar tarjeta</button></div>`}
  </div>${tabbar()}</div>`;
};

P.pareja = () => {
  const yo = S.yo.user_id;
  if (!S.pareja) return `<div class="screen"><div class="body">
    <div class="hdr"><div><div class="sub">${esc(S.hogar.nombre)}</div><h3>Hogar</h3></div></div>
    <div class="card" style="display:grid;gap:12px;text-align:center;justify-items:center">${ic("i-users", 'style="width:32px;height:32px;color:var(--brand)"')}
      <b style="font-size:17px">Invita a tu pareja</b><span class="muted">Que cree su cuenta en Saldo Claro y elija “Unirme con el código”.</span>
      <div class="cc-total num" style="letter-spacing:.2em">${esc(S.hogar.codigo)}</div>
      <button class="btn-ghost" type="button" data-act="copiar" data-v="${esc(S.hogar.codigo)}">${ic("i-copy")}Copiar código</button></div>
    <div class="card steps"><div>Cada uno sube sus capturas desde su celular.</div><div>Marcas si un gasto es tuyo, de tu pareja o de los dos.</div><div>La app calcula quién le debe a quién y cómo van sus metas.</div></div>
  </div>${tabbar()}</div>`;
  const pj = S.pareja.user_id, movs = visibles();
  const mes = C.delMes(movs, S.mes).filter((m) => m.clase === "normal" && m.tipo === "gasto");
  const suma = (f) => C.r2(mes.filter(f).reduce((s, m) => s + +m.monto, 0));
  const cp = C.cuentasPareja(movs, S.miembros, S.rep, S.mes);
  const pres = C.presupuestoHogar(movs, S.d.presupuestos, S.mes);
  const fijos = [...S.d.pagos_fijos].sort((a, b) => C.proximaFecha(a.dia_vence).dias - C.proximaFecha(b.dia_vence).dias);
  const [a, b] = S.miembros;
  return `<div class="screen"><div class="body">
    <div class="hdr"><div><div class="sub">${esc(a.nombre)} y ${esc(b.nombre)}</div><h3>Hogar</h3></div>${selMes()}</div>
    <div class="trio">
      <div><span>${av(yo, true)}Tuyos</span><b class="num">${C.solesCorto(suma((m) => m.alcance === "propio" && m.duenio === yo))}</b></div>
      <div><span>${av(pj, true)}De ${esc(S.pareja.nombre)}</span><b class="num">${C.solesCorto(suma((m) => m.alcance === "propio" && m.duenio === pj))}</b></div>
      <div><span>${avDos(true)}De los dos</span><b class="num">${C.solesCorto(cp.total)}</b></div></div>
    ${cp.monto > 0 ? `<div class="settle"><div class="who-owes">${av(cp.deudor)}${ic("i-swap")}${av(cp.acreedor)}<small style="margin-left:auto">${textoReparto()}</small></div>
        <div><small>${cp.deudor === yo ? `Le debes a ${esc(nombre(cp.acreedor))}` : `${esc(nombre(cp.deudor))} te debe`}</small><div class="big num">${C.soles(cp.monto)}</div></div>
        <button class="primary" type="button" data-go="saldar">Saldar cuentas</button></div>`
      : `<div class="settle even"><div class="who-owes">${av(yo)}${ic("i-check", 'style="color:var(--income)"')}${av(pj)}<small style="margin-left:auto">${textoReparto()}</small></div><b>Cuentas al día en ${C.nombreMes(S.mes, true)}</b><button class="link" type="button" data-go="saldar" style="justify-self:start">Ver detalle</button></div>`}
    <div class="card cat-rows"><div class="sec-h"><h4>Presupuesto de la casa</h4><button class="link" type="button" data-act="presupuestos">Editar</button></div>
      ${pres.length ? pres.map((p) => `<div class="cat-row" style="--c:var(${cat(p.cat).c})"><span class="cat-ic">${ic(cat(p.cat).i)}</span><div><div class="t"><b>${cat(p.cat).n}</b><span class="num">${C.solesCorto(p.gastado)} de ${C.solesCorto(p.limite)}</span></div><div class="bar ${p.pct >= 0.85 ? "warnb" : ""}"><i style="width:${Math.min(100, p.pct * 100)}%"></i></div>
        <small ${p.pct >= 0.85 ? 'style="color:var(--expense);font-weight:600"' : ""}>${Math.round(p.pct * 100)}%${p.pct >= 1 ? " · se pasó del límite" : p.pct >= 0.85 ? " · cerca del límite" : ""}</small></div></div>`).join("")
        : `<span class="muted" style="font-size:13.5px">Define cuánto quieren gastar juntos por categoría.</span>`}</div>
    <div class="card"><div class="sec-h"><h4>Metas juntos</h4><button class="link" type="button" data-act="meta-nueva">Nueva meta</button></div>
      ${S.d.metas.length ? S.d.metas.map((mt) => { const ap = C.aportesMeta(S.d.movimientos, mt.id); const pa = ap.por[a.user_id] || 0, pb = ap.por[b.user_id] || 0;
        return `<div class="goal"><div class="t"><b>${ic("i-target", 'style="width:16px;height:16px;vertical-align:-3px;color:var(--brand)"')} ${esc(mt.nombre)}</b><span class="num">${C.solesCorto(ap.total)} de ${C.solesCorto(mt.objetivo)}</span></div>
          <div class="stack"><i class="a" style="width:${Math.min(100, (pa / mt.objetivo) * 100)}%"></i><i class="b" style="width:${Math.min(100, (pb / mt.objetivo) * 100)}%"></i></div>
          <small><em style="--c:var(--${a.color === "rosado" ? "rose" : "brand"})">${esc(a.nombre)} ${C.solesCorto(pa)}</em><em style="--c:var(--${b.color === "rosado" ? "rose" : "brand"})">${esc(b.nombre)} ${C.solesCorto(pb)}</em>${mt.fecha_meta ? `<span>· ${C.nombreMes(mt.fecha_meta.slice(0, 7)).toLowerCase()}</span>` : ""}
          <button class="link" type="button" data-act="aportar" data-id="${mt.id}" style="margin-left:auto">Aportar</button></small></div>`; }).join("")
        : `<span class="muted" style="font-size:13.5px">Un viaje, un depa o un fondo de emergencia: creen una meta y vean cuánto pone cada uno.</span>`}</div>
    <div class="card"><div class="sec-h"><h4>Pagos fijos</h4><button class="link" type="button" data-act="fijo-nuevo">Agregar</button></div>
      ${fijos.length ? fijos.map((f) => { const pagado = C.pagadoEsteMes(f), pr = C.proximaFecha(f.dia_vence);
        return `<div class="bill">${f.responsable ? av(f.responsable) : avDos()}<span class="mid"><b>${esc(f.nombre)}</b><small>${pagado ? `Pagado el ${C.fechaLarga(f.ultimo_pago)}` : `Vence el ${C.fechaLarga(pr.iso)} · paga ${f.responsable ? esc(f.responsable === yo ? "tú" : nombre(f.responsable)) : "cada uno su parte"}`}</small></span>
          ${pagado ? `<span class="pill ok">Pagado</span>` : `<button class="btn-ghost" type="button" data-act="fijo-pagar" data-id="${f.id}" style="min-height:38px;padding:6px 10px;font-size:13px">${C.solesCorto(f.monto)} · Pagar</button>`}
          <button class="icon-btn" type="button" data-act="fijo-editar" data-id="${f.id}" aria-label="Editar ${esc(f.nombre)}" style="width:34px;height:34px">${ic("i-edit", 'style="width:16px;height:16px"')}</button></div>`; }).join("")
        : `<span class="muted" style="font-size:13.5px">Alquiler, luz, internet: anota quién paga cada uno y cuándo vence.</span>`}</div>
    <button class="home-mini" type="button" data-go="cierre"><span class="cat-ic" style="--c:var(--brand)">${ic("i-calendar")}</span><span class="t"><b>Cierre de ${C.nombreMes(S.mes, true)}</b><small>Unos 10 minutos para revisarlo juntos</small></span><span class="link">Ver</span></button>
  </div>${tabbar()}</div>`;
};
function textoReparto() {
  const h = S.hogar;
  if (S.miembros.length < 2) return "";
  const [a, b] = S.miembros;
  const p = `${C.pctTexto(S.rep[a.user_id])}/${C.pctTexto(S.rep[b.user_id])}`;
  return h.reparto_modo === "mitad" ? "Reparto 50/50" : h.reparto_modo === "ingresos" ? `Reparto ${p} según ingresos` : `Reparto fijo ${p}`;
}

P.saldar = () => {
  if (!S.pareja) return P.pareja();
  const cp = C.cuentasPareja(visibles(), S.miembros, S.rep, S.mes);
  const [a, b] = S.miembros, h = S.hogar;
  return `<div class="screen"><div class="body">
    <div class="hdr">${atras("pareja")}<h3 style="flex:1">Saldar cuentas</h3>${selMes()}</div>
    ${cp.monto > 0 ? `<div class="settle" style="justify-items:center;text-align:center"><div class="who-owes">${av(cp.deudor)}${ic("i-swap")}${av(cp.acreedor)}</div>
      <div><small>${esc(nombre(cp.deudor))} le pasa a ${esc(nombre(cp.acreedor))}</small><div class="big num">${C.soles(cp.monto)}</div></div><small>Gastos de la casa de ${C.nombreMes(S.mes, true)}</small></div>`
      : `<div class="settle even" style="justify-items:center;text-align:center">${ic("i-check", 'style="width:28px;height:28px;color:var(--income)"')}<b>Están al día en ${C.nombreMes(S.mes, true)}</b><small>Nadie le debe a nadie.</small></div>`}
    <div class="field"><span class="flabel">Cómo se reparten</span><div class="chips wrap">
      <button class="chip" type="button" aria-pressed="${h.reparto_modo === "mitad"}" data-act="reparto" data-v="mitad">50 / 50</button>
      <button class="chip" type="button" aria-pressed="${h.reparto_modo === "ingresos"}" data-act="reparto" data-v="ingresos">Según ingresos</button>
      <button class="chip" type="button" aria-pressed="${h.reparto_modo === "fijo"}" data-act="reparto" data-v="fijo">Porcentaje fijo</button></div>
      ${h.reparto_modo === "ingresos" ? `<span class="hint">${esc(a.nombre)} gana ${C.solesCorto(a.ingreso_mensual)} y ${esc(b.nombre)} ${C.solesCorto(b.ingreso_mensual)} al mes. Cambia los ingresos en Ajustes.</span>` : ""}</div>
    <div class="card kv"><div><span>Gastos de los dos</span><b class="num">${C.soles(cp.total)}</b></div>
      ${S.miembros.map((m) => `<div><span>${av(m.user_id, true)} A ${esc(m.nombre)} le toca (${C.pctTexto(S.rep[m.user_id])}%)</span><b class="num">${C.soles(cp.por[m.user_id].toca)}</b></div><div><span>${esc(m.nombre)} pagó</span><b class="num">${C.soles(cp.por[m.user_id].pago)}</b></div>${cp.por[m.user_id].envio ? `<div><span>${esc(m.nombre)} ya transfirió</span><b class="num">${C.soles(cp.por[m.user_id].envio)}</b></div>` : ""}`).join("")}</div>
    ${cp.monto > 0 ? `<div class="card steps"><div>${esc(nombre(cp.deudor))} envía ${C.soles(cp.monto)} por Yape o Plin.</div><div>Cualquiera de los dos sube la captura del pago.</div><div>Las cuentas de ${C.nombreMes(S.mes, true)} quedan en cero.</div></div>` : ""}
    <div><div class="sec-h"><h4>Gastos de los dos</h4><span class="muted" style="font-size:12.5px">${cp.pendientes.length} movimientos</span></div>${cp.pendientes.length ? cp.pendientes.map(txRow).join("") : `<div class="empty"><span>Aún no hay gastos compartidos este mes.</span></div>`}</div>
  </div>
  ${cp.monto > 0 ? `<div class="actions"><button class="secondary" type="button" data-act="saldo-manual">A mano</button><button class="primary" type="button" data-act="saldo-captura">${ic("i-scan")}Subir captura del pago</button></div>` : tabbar()}</div>`;
};

P.cierre = () => {
  const yo = S.yo.user_id;
  if (!S.pareja) return P.pareja();
  const movs = visibles(), ant = C.mesAnterior(S.mes);
  const pc = C.porCategoria(movs, S.mes, "hogar", yo, S.rep), prev = C.porCategoria(movs, ant, "hogar", yo, S.rep);
  const prevDe = Object.fromEntries(prev.filas.map((f) => [f.cat, f.monto]));
  const cp = C.cuentasPareja(movs, S.miembros, S.rep, S.mes);
  const [a, b] = S.miembros;
  const pa = cp.total ? cp.por[a.user_id].pago / cp.total : 0.5;
  const metas = S.d.metas.map((mt) => ({ mt, mes: C.r2(C.delMes(S.d.movimientos, S.mes).filter((m) => m.clase === "aporte_meta" && m.meta_id === mt.id).reduce((s, m) => s + +m.monto, 0)), total: C.aportesMeta(S.d.movimientos, mt.id).total }));
  const excesos = C.presupuestoHogar(movs, S.d.presupuestos, S.mes).filter((p) => p.pct > 1);
  const mesIso = S.mes + "-01";
  const revisaron = S.d.cierres.filter((c) => c.mes === mesIso).map((c) => c.user_id);
  const yoListo = revisaron.includes(yo), pjListo = revisaron.includes(S.pareja.user_id);
  return `<div class="screen"><div class="body">
    <div class="hdr">${atras("pareja")}<div style="flex:1"><h3>Cierre de ${C.nombreMes(S.mes, true)}</h3><div class="sub">Para revisar juntos · unos 10 minutos</div></div></div>
    <div class="card agenda"><h5><span>1</span>En qué se fue el dinero de la casa</h5>
      ${pc.filas.length ? pc.filas.slice(0, 4).map((f) => { const p = prevDe[f.cat]; const d = p ? Math.round(((f.monto - p) / p) * 100) : null;
        return `<div class="cat-row" style="--c:var(${cat(f.cat).c})"><span class="cat-ic">${ic(cat(f.cat).i)}</span><div><div class="t"><b>${cat(f.cat).n}</b><span class="num">${C.solesCorto(f.monto)}</span></div><small>${d === null ? "Sin datos del mes anterior" : `<span class="delta ${d > 0 ? "up" : "down"}">${d > 0 ? "+" : ""}${d}%</span> frente a ${C.nombreMes(ant, true)}`}</small></div></div>`; }).join("") : `<span class="muted">No hubo gastos compartidos.</span>`}</div>
    <div class="card agenda"><h5><span>2</span>Cuánto aportó cada uno</h5>
      <div class="stack" style="height:12px"><i class="a" style="width:${pa * 100}%"></i><i class="b" style="width:${(1 - pa) * 100}%"></i></div>
      <div class="split-line">${av(a.user_id, true)}${esc(a.nombre)} ${C.soles(cp.por[a.user_id].pago)}<span class="muted">(${Math.round(pa * 100)}%)</span><span style="margin-left:auto;display:inline-flex;gap:6px;align-items:center">${av(b.user_id, true)}${esc(b.nombre)} ${C.soles(cp.por[b.user_id].pago)}<span class="muted">(${Math.round((1 - pa) * 100)}%)</span></span></div>
      ${cp.monto > 0 ? `<div class="notice" style="background:var(--rose-soft)">${ic("i-swap", 'style="color:var(--expense)"')}<span>Según el reparto (${textoReparto().replace("Reparto ", "")}), falta que ${esc(nombre(cp.deudor))} pase ${C.soles(cp.monto)}.</span></div>` : `<div class="read-ok">${ic("i-check")}<span>Cuentas saldadas.</span></div>`}</div>
    <div class="card agenda"><h5><span>3</span>Metas</h5>
      ${metas.length ? metas.map((x) => `<div class="split-line">${ic("i-target", 'style="color:var(--brand)"')}${esc(x.mt.nombre)}: <b class="num">+ ${C.solesCorto(x.mes)}</b> este mes<span class="pill ${x.mes > 0 ? "ok" : "warn"}" style="margin-left:auto">${Math.round((x.total / x.mt.objetivo) * 100)}%</span></div>`).join("") : `<span class="muted">Aún no tienen metas.</span>`}</div>
    <div class="card agenda"><h5><span>4</span>Para ${C.nombreMes(C.mesSiguiente(S.mes), true)}</h5>
      ${excesos.length ? excesos.map((p) => { const nuevo = Math.ceil(p.gastado / 50) * 50;
        return `<div class="q-card"><span>${cat(p.cat).n} pasó el presupuesto (${C.solesCorto(p.gastado)} de ${C.solesCorto(p.limite)}). ¿Lo suben a ${C.solesCorto(nuevo)}?</span>
          <div class="row2"><button class="secondary" type="button" data-act="mantener">Mantener</button><button class="primary" type="button" data-act="subir-pres" data-cat="${p.cat}" data-v="${nuevo}">Subir a ${C.solesCorto(nuevo)}</button></div></div>`; }).join("")
        : `<div class="read-ok">${ic("i-check")}<span>Todo quedó dentro del presupuesto. Pueden mantenerlo.</span></div>`}</div>
    <div class="sw-row">${av(S.pareja.user_id)}<span class="t"><b>${esc(S.pareja.nombre)} ${pjListo ? "ya lo revisó" : "aún no lo revisa"}</b><small>${yoListo ? "Tú también lo marcaste" : "Falta que tú lo marques"}</small></span>${pjListo ? ic("i-check", 'style="color:var(--income)"') : ""}</div>
    ${yoListo ? "" : `<button class="primary" type="button" data-act="cierre-ok">${ic("i-check")}Marcar como revisado</button>`}
  </div>${tabbar()}</div>`;
};

P.ajustes = () => `<div class="screen"><div class="body">
  <div class="hdr">${atras("inicio")}<h3 style="flex:1">Ajustes</h3></div>
  <div class="card kv">
    <div><span>${av(S.yo.user_id, true)} Tu nombre</span><b>${esc(S.yo.nombre)}</b></div>
    <div><span>Ingreso mensual</span><b class="num">${C.soles(S.yo.ingreso_mensual)}</b></div>
    <div><span>Presupuesto de gastos</span><b class="num">${C.soles(S.yo.presupuesto_personal)}</b></div>
    <div><span>Cuenta</span><b>${esc(S.sesion.email || "")}</b></div></div>
  <button class="btn-ghost" type="button" data-act="perfil">${ic("i-edit")}Editar mis datos</button>
  <div class="card kv">
    <div><span>Hogar</span><b>${esc(S.hogar.nombre)}</b></div>
    <div><span>Código para tu pareja</span><b class="num" style="letter-spacing:.15em">${esc(S.hogar.codigo)}</b></div>
    <div><span>Reparto</span><b>${S.pareja ? textoReparto() : "—"}</b></div>
    ${S.pareja ? `<div><span>${av(S.pareja.user_id, true)} Pareja</span><b>${esc(S.pareja.nombre)}</b></div>` : ""}</div>
  <button class="btn-ghost" type="button" data-act="copiar" data-v="${esc(S.hogar.codigo)}">${ic("i-copy")}Copiar código</button>
  <div class="card" style="display:grid;gap:8px;font-size:13.5px"><b>Instalar en el celular</b>
    <span class="muted">iPhone: abre esta página en Safari, toca Compartir y elige “Agregar a pantalla de inicio”.</span>
    <span class="muted">Android: en Chrome, menú ⋮ y “Instalar app”.</span></div>
  <button class="danger" type="button" data-act="salir">${DEMO ? "Reiniciar datos de ejemplo" : "Cerrar sesión"}</button>
</div>${tabbar()}</div>`;

/* ---------------- render ---------------- */
function render() {
  if (!S.listo) { $app.innerHTML = `<div class="screen"><div class="body"><div class="reading"><div class="spinner"></div></div></div></div>`; return; }
  let html;
  if (!S.sesion) html = P.login();
  else if (!S.hogar) html = P.bienvenida();
  else html = (P[S.ruta] || P.inicio)();
  $app.innerHTML = (DEMO ? `<div class="demo-band">Modo demo · datos de ejemplo en este navegador</div>` : "") + html;
  if (S.ruta === "revisar" && S.borrador) pintarReparto();
  document.querySelectorAll("[data-captura]").forEach(async (el) => {
    try { const url = await api.urlCaptura(el.dataset.captura);
      el.innerHTML = url ? `<img src="${url}" alt="Captura original del movimiento">` : `<span class="muted" style="font-size:13px">La captura no está disponible${DEMO ? " en el modo demo después de recargar" : ""}.</span>`;
    } catch { el.innerHTML = `<span class="muted" style="font-size:13px">No se pudo cargar la captura.</span>`; }
  });
}
window.addEventListener("hashchange", () => { S.ruta = location.hash.slice(1) || "inicio"; S.error = ""; if (S.ruta !== "adjuntar" && S.ruta !== "revisar") S.preset = null; render(); window.scrollTo(0, 0); });

/* ---------------- imágenes ---------------- */
async function prepararImagen(file) {
  const url = URL.createObjectURL(file);
  const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error("No pudimos abrir esa imagen. Prueba con JPG o PNG.")); i.src = url; });
  const max = 1600, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const cv = document.createElement("canvas"); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
  const cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
  const blob = await new Promise((ok) => cv.toBlob(ok, "image/jpeg", 0.85));
  const b64 = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.readAsDataURL(blob); });
  return { blob, b64, url: URL.createObjectURL(blob) };
}
function itemVacio(extra = {}) {
  const yo = S.yo.user_id;
  return { tipo: "gasto", monto: "", moneda: "PEN", fecha: C.hoyISO(), hora: "", comercio: "", medio: "Yape", categoria: "comida", n_operacion: "", tarjeta_id: "",
    alcance: "propio", duenio: yo, pagado_por: yo, privado: false, nota: "", conf: null, clase: "normal", ...extra };
}
function itemsDesdePreset(base) {
  const p = S.preset; if (!p) return base;
  return { ...base, clase: p.clase, tipo: "gasto", tarjeta_id: p.tarjeta_id || base.tarjeta_id, pagado_por: p.pagado_por || base.pagado_por, duenio: p.pagado_por || base.duenio,
    monto: base.monto || p.monto || "", comercio: base.comercio || p.comercio || "", categoria: "otros", alcance: "propio" };
}
async function procesarArchivo(file) {
  if (!file || !file.type.startsWith("image/")) { toast("Elige una imagen (captura o foto)."); return; }
  let prep;
  try { prep = await prepararImagen(file); } catch (e) { toast(e.message); return; }
  S.leyendo = { url: prep.url }; if (S.ruta !== "adjuntar") ir("adjuntar"); else render();
  let res = null, error = null;
  try { res = await leerLocal(prep.blob, C.hoyISO()); } catch (e) { error = e.message + " Ingresa los datos a mano o usa “Leer mejor con IA”."; }
  S.leyendo = false;
  armarBorrador(res, error, prep);
}
async function leerConIA() {
  const b = S.borrador; if (!b?.b64) return;
  S.leyendo = { url: b.imagenUrl, ia: true }; render();
  let res = null, error = null;
  try { res = await api.leerCaptura(b.b64, "image/jpeg", C.hoyISO()); } catch (e) { error = e.message; }
  S.leyendo = false;
  if (error) { b.aviso = error; b.error = true; S.ruta = "revisar"; render(); return; }
  armarBorrador(res, null, { blob: b.imagenBlob, url: b.imagenUrl, b64: b.b64 }, true);
}
function armarBorrador(res, error, prep, conIA = false) {
  let items = [], aviso = "", hayError = false;
  if (error) { items = [itemVacio()]; aviso = error; hayError = true; }
  else if (!res?.legible || !res.movimientos?.length) { items = [itemVacio()]; aviso = conIA ? "No encontramos un pago en esta imagen. Ingresa los datos a mano." : "No pudimos leer el monto. Ingrésalo a mano o toca “Leer mejor con IA”."; hayError = true; }
  else {
    items = res.movimientos.map((mv) => {
      const tj = mv.ultimos4_tarjeta ? S.d.tarjetas.find((t) => t.ultimos4 === mv.ultimos4_tarjeta) : null;
      return itemVacio({ tipo: mv.tipo, monto: mv.monto, moneda: mv.moneda, fecha: /^\d{4}-\d{2}-\d{2}$/.test(mv.fecha) ? mv.fecha : C.hoyISO(), hora: mv.hora || "",
        comercio: mv.comercio, medio: C.MEDIOS.includes(mv.medio) ? mv.medio : "Otro", categoria: mv.categoria, n_operacion: mv.n_operacion, tarjeta_id: tj?.id || "",
        clase: mv.clase || "normal", conf: { ...mv.confianza, fecha: mv.fecha ? mv.confianza.fecha : "media" } });
    });
    const nRevisar = items.filter((i) => Object.values(i.conf).some((c) => c !== "alta")).length;
    aviso = res.aviso || (items.length > 1 ? `Encontramos ${items.length} movimientos. Revísalos uno por uno.` : nRevisar ? "Revisa los datos marcados en ámbar." : "Leímos todos los datos. Revisa y guarda.");
  }
  if (!hayError && items.length > 1 && !S.preset) {
    const tj = S.d.tarjetas.length === 1 ? S.d.tarjetas[0].id : "";
    S.lote = { aviso, imagenUrl: prep.url, b64: prep.b64, conIA, alcance: "propio", tarjeta_id: tj,
      items: items.map((it, i) => ({ ...it, sel: it.moneda !== "USD" && !C.buscarDuplicado(S.d.movimientos, { ...it, monto: C.r2(it.monto) }), dup: !!C.buscarDuplicado(S.d.movimientos, { ...it, monto: C.r2(it.monto) }), i })) };
    S.borrador = null; ir("lote"); return;
  }
  S.borrador = { imagenBlob: prep.blob, imagenUrl: prep.url, b64: prep.b64, conIA, items: items.map(itemsDesdePreset), idx: 0, aviso, error: hayError, preset: S.preset, capturaPath: null };
  if (S.ruta === "revisar") render(); else ir("revisar");
}

/* ---------------- formularios en hoja ---------------- */
function hoja(titulo, campos, onOk, { boton = "Guardar", extra = "" } = {}) {
  const el = document.createElement("div"); el.className = "sheet";
  el.innerHTML = `<form class="sheet-panel" role="dialog" aria-modal="true" aria-label="${esc(titulo)}"><div class="grab"></div><h3>${esc(titulo)}</h3>${campos}<p class="err" role="alert" hidden></p>
    <div class="row2"><button class="secondary" type="button" data-cerrar>Cancelar</button><button class="primary" type="submit">${esc(boton)}</button></div>${extra}</form>`;
  const cerrar = () => el.remove();
  el.addEventListener("click", (e) => { if (e.target === el || e.target.closest("[data-cerrar]")) cerrar(); });
  el.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const btn = e.target.querySelector("[type=submit]"); btn.disabled = true;
    try { await onOk(f, e.submitter); cerrar(); render(); } catch (err) { const p = el.querySelector(".err"); p.hidden = false; p.textContent = err.message; btn.disabled = false; }
  });
  document.body.appendChild(el); el.querySelector("input,select")?.focus();
  return el;
}
const campo = (id, label, input) => `<div class="field"><label for="${id}">${label}</label><div class="inp">${input}</div></div>`;
const numero = (v) => { const n = parseFloat(String(v ?? "").replace(",", ".")); if (!isFinite(n)) throw new Error("Escribe un número válido."); return C.r2(n); };
const opcionesMiembros = (sel, ambos = true) => (ambos ? `<option value="">Los dos</option>` : "") + S.miembros.map((m) => `<option value="${m.user_id}" ${m.user_id === sel ? "selected" : ""}>${esc(m.user_id === S.yo.user_id ? `${m.nombre} (tú)` : m.nombre)}</option>`).join("");

async function guardarMov(fila) { const r = await api.guardar("movimientos", fila); const i = S.d.movimientos.findIndex((m) => m.id === r.id);
  if (i >= 0) S.d.movimientos[i] = r; else S.d.movimientos.unshift(r); S.d.movimientos.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0)); return r; }

/* ---------------- acciones ---------------- */
const A = {};
A["login-modo"] = () => { S.loginModo = S.loginModo === "entrar" ? "crear" : "entrar"; S.error = ""; render(); };
A.salir = async () => { await api.salir(); S.sesion = null; S.hogar = null; render(); };
A.mes = (el) => { const d = Number(el.dataset.d); const n = d < 0 ? C.mesAnterior(S.mes) : C.mesSiguiente(S.mes); if (n <= C.mesActual()) { S.mes = n; render(); } };
A.ver = (el) => ir("detalle", { sel: el.dataset.id });
A.filtro = (el) => {
  const f = S.filtros, g = el.dataset.g, v = el.dataset.v;
  if (g === "tipo") f.tipo = v;
  else if (g === "cat") f.cats.has(v) ? f.cats.delete(v) : f.cats.add(v);
  else if (g === "medio") f.medios.has(v) ? f.medios.delete(v) : f.medios.add(v);
  else if (g === "captura") f.conCaptura = !f.conCaptura;
  else if (g === "quien") f.quien = f.quien === v ? null : v;
  render();
};
A.stats = (el) => { S.statsModo = el.dataset.v; render(); };
A["leer-ia"] = () => leerConIA();
A["lote-ia"] = async () => {
  const L = S.lote; if (!L?.b64) return;
  S.leyendo = { url: L.imagenUrl, ia: true }; ir("adjuntar");
  let res = null, error = null;
  try { res = await api.leerCaptura(L.b64, "image/jpeg", C.hoyISO()); } catch (e) { error = e.message; }
  S.leyendo = false;
  if (error || !res?.movimientos?.length) { L.aviso = error || "La IA no encontró más movimientos."; L.conIA = true; ir("lote"); return; }
  const items = res.movimientos.map((mv, i) => { const it = itemVacio({ tipo: mv.tipo, monto: mv.monto, moneda: mv.moneda, fecha: /^\d{4}-\d{2}-\d{2}$/.test(mv.fecha) ? mv.fecha : C.hoyISO(), comercio: mv.comercio,
    medio: C.MEDIOS.includes(mv.medio) ? mv.medio : "Otro", categoria: mv.categoria, n_operacion: mv.n_operacion, clase: mv.clase || (/pago|abono/i.test(mv.comercio) && mv.tipo === "ingreso" ? "pago_tarjeta" : "normal") });
    const dup = !!C.buscarDuplicado(S.d.movimientos, { ...it, monto: C.r2(it.monto) }); return { ...it, dup, sel: it.moneda !== "USD" && !dup, i }; });
  Object.assign(L, { items, conIA: true, aviso: `La IA encontró ${items.length} movimientos.` }); ir("lote");
};
A["lote-sel"] = (el) => { const x = S.lote.items[+el.dataset.i]; x.sel = !x.sel; render(); };
A["lote-todos"] = (el) => { S.lote.items.forEach((x) => (x.sel = el.dataset.v === "1" && x.moneda !== "USD")); render(); };
A["lote-alcance"] = (el) => { S.lote.alcance = el.dataset.v; render(); };
A["lote-cancelar"] = () => { S.lote = null; ir("inicio"); };
A["lote-guardar"] = async (el) => {
  const L = S.lote, yo = S.yo.user_id; const elegidos = L.items.filter((x) => x.sel); if (!elegidos.length) return;
  el.disabled = true; S.error = ""; let n = 0;
  try {
    for (const x of elegidos) {
      const pago = x.clase === "pago_tarjeta", credito = x.medio === "Tarjeta de crédito";
      await guardarMov({ hogar_id: S.hogar.id, tipo: x.tipo, monto: C.r2(x.monto), fecha: x.fecha, hora: null, comercio: x.comercio, medio: x.medio, categoria: pago ? "otros" : x.categoria,
        nota: "", n_operacion: x.n_operacion || null, alcance: pago ? "propio" : L.alcance, duenio: pago || L.alcance === "propio" ? yo : null, pagado_por: yo, privado: false,
        clase: pago ? "pago_tarjeta" : "normal", tarjeta_id: (pago || credito) && L.tarjeta_id ? L.tarjeta_id : null, captura_path: null });
      n++;
    }
    S.lote = null; toast(`${n} movimientos guardados`); ir("movimientos");
  } catch (e) { S.error = `Se guardaron ${n} y falló uno: ${e.message}`; elegidos.slice(0, n).forEach((x) => { x.sel = false; x.dup = true; }); el.disabled = false; render(); }
};
A.manual = () => { S.borrador = { items: [itemsDesdePreset(itemVacio())], idx: 0, aviso: "", preset: S.preset, capturaPath: null }; ir("revisar"); };
A.descartar = () => {
  const b = S.borrador;
  if (b?.editId) { const id = b.editId; S.borrador = null; ir("detalle", { sel: id }); return; }
  if (b && b.idx < b.items.length - 1) { b.idx++; S.error = ""; render(); return; }
  const volver = b?.preset?.volver; S.borrador = null; S.preset = null; ir(volver || "inicio");
};
function leerForm() {
  const it = itemActual(); const g = (id) => document.getElementById(id)?.value ?? "";
  Object.assign(it, { monto: g("f-monto"), comercio: g("f-com").trim(), fecha: g("f-fecha"), medio: g("f-medio"), nota: g("f-nota").trim(), n_operacion: g("f-op").trim(),
    tarjeta_id: g("f-medio") === "Tarjeta de crédito" ? g("f-tarjeta") : (it.clase === "pago_tarjeta" || S.borrador.preset?.clase === "pago_tarjeta" ? it.tarjeta_id : "") });
}
A["guardar-mov"] = async (el) => {
  const b = S.borrador; leerForm(); const it = itemActual(); S.error = "";
  let monto; try { monto = numero(it.monto); } catch { S.error = "Escribe el monto, por ejemplo 18.50."; render(); return; }
  if (monto <= 0) { S.error = "El monto debe ser mayor que cero."; render(); return; }
  if (!it.fecha) { S.error = "Elige la fecha."; render(); return; }
  el.disabled = true;
  try {
    if (b.imagenBlob && !b.capturaPath) b.capturaPath = await api.subirCaptura(S.hogar.id, b.imagenBlob);
    const clase = b.preset?.clase || it.clase || "normal";
    const fila = { hogar_id: S.hogar.id, tipo: it.tipo, monto, fecha: it.fecha, hora: it.hora || null, comercio: it.comercio, medio: it.medio,
      categoria: clase === "normal" ? it.categoria : "otros", nota: it.nota, n_operacion: it.n_operacion || null, alcance: it.alcance,
      duenio: it.alcance === "compartido" ? null : it.duenio, pagado_por: it.pagado_por, privado: it.alcance === "propio" && it.duenio === S.yo.user_id ? !!it.privado : false,
      clase, tarjeta_id: it.tarjeta_id || null, meta_id: it.meta_id || null, captura_path: b.capturaPath || it.captura_path || null };
    if (b.editId) fila.id = b.editId;
    const r = await guardarMov(fila);
    toast(b.editId ? "Cambios guardados" : "Movimiento guardado");
    if (!b.editId && b.idx < b.items.length - 1) { b.idx++; render(); return; }
    const volver = b.preset?.volver; S.borrador = null; S.preset = null;
    if (volver) ir(volver); else ir("detalle", { sel: r.id });
  } catch (e) { S.error = e.message; el.disabled = false; render(); }
};
A.editar = () => {
  const m = S.d.movimientos.find((x) => x.id === S.sel); if (!m) return;
  S.borrador = { editId: m.id, items: [{ ...m, monto: m.monto, tarjeta_id: m.tarjeta_id || "", n_operacion: m.n_operacion || "", hora: m.hora || "", conf: null }], idx: 0, aviso: "", capturaPath: m.captura_path, preset: m.clase !== "normal" ? { clase: m.clase, tarjeta_id: m.tarjeta_id } : null };
  ir("revisar");
};
A.duplicar = () => {
  const m = S.d.movimientos.find((x) => x.id === S.sel); if (!m) return;
  S.borrador = { items: [{ ...itemVacio(), ...m, id: undefined, fecha: C.hoyISO(), n_operacion: "", captura_path: null, conf: null, tarjeta_id: m.tarjeta_id || "" }], idx: 0, aviso: "Copia del movimiento. Ajusta la fecha o el monto y guarda.", capturaPath: null, preset: null };
  ir("revisar");
};
A["pre-borrar"] = () => {
  const m = S.d.movimientos.find((x) => x.id === S.sel);
  document.querySelector("[data-del-zone]").innerHTML = `<div class="confirm"><p>¿Eliminar este movimiento de ${C.soles(m.monto)}? Se quita de tus cuentas${m.captura_path ? " y se borra la captura" : ""}. No se puede deshacer.</p>
    <div class="row2"><button class="no" type="button" data-act="no-borrar">Cancelar</button><button class="yes" type="button" data-act="borrar">Eliminar</button></div></div>`;
};
A["no-borrar"] = () => render();
A.borrar = async () => {
  const m = S.d.movimientos.find((x) => x.id === S.sel);
  try { await api.borrar("movimientos", m.id); if (m.captura_path) await api.borrarCaptura(m.captura_path).catch(() => {});
    S.d.movimientos = S.d.movimientos.filter((x) => x.id !== m.id); toast("Movimiento eliminado"); ir("movimientos"); } catch (e) { toast(e.message); }
};
A.copiar = async (el) => { try { await navigator.clipboard.writeText(el.dataset.v); toast("Código copiado"); } catch { toast(`Tu código es ${el.dataset.v}`); } };
A.reparto = async (el) => {
  const v = el.dataset.v;
  const aplicar = async (cambios) => { S.hogar = await api.actualizarHogar(S.hogar.id, cambios); S.rep = C.reparto(S.hogar, S.miembros); };
  if (v === "fijo") {
    const [a] = S.miembros;
    hoja("Porcentaje fijo", campo("r-pct", `¿Qué porcentaje paga ${esc(a.nombre)}?`, `<input id="r-pct" name="pct" inputmode="decimal" value="${S.hogar.reparto_fijo_pct}" required><span class="pre">%</span>`),
      async (f) => { const p = numero(f.pct); if (p < 0 || p > 100) throw new Error("Usa un número entre 0 y 100."); await aplicar({ reparto_modo: "fijo", reparto_fijo_pct: p }); });
    return;
  }
  try { await aplicar({ reparto_modo: v }); render(); } catch (e) { toast(e.message); }
};
A["saldo-captura"] = () => {
  const cp = C.cuentasPareja(visibles(), S.miembros, S.rep, S.mes);
  S.preset = { clase: "saldo_pareja", pagado_por: cp.deudor, monto: cp.monto, comercio: `Pago a ${nombre(cp.acreedor)}`, volver: "saldar" };
  ir("adjuntar");
};
A["saldo-manual"] = () => {
  const cp = C.cuentasPareja(visibles(), S.miembros, S.rep, S.mes);
  hoja("Registrar pago entre ustedes", campo("s-monto", `${esc(nombre(cp.deudor))} le pagó a ${esc(nombre(cp.acreedor))}`, `<span class="pre">S/</span><input id="s-monto" name="monto" inputmode="decimal" value="${cp.monto.toFixed(2)}" required>`)
    + campo("s-medio", "Medio", `<select id="s-medio" name="medio">${["Yape", "Plin", "Transferencia", "Efectivo"].map((m) => `<option>${m}</option>`).join("")}</select>`),
    async (f) => { await guardarMov({ hogar_id: S.hogar.id, tipo: "gasto", monto: numero(f.monto), fecha: C.hoyISO(), comercio: `Pago a ${nombre(cp.acreedor)}`, medio: f.medio, categoria: "otros",
      alcance: "propio", duenio: cp.deudor, pagado_por: cp.deudor, clase: "saldo_pareja" }); toast("Pago registrado"); });
};
A.presupuestos = () => {
  const val = (k) => S.d.presupuestos.find((p) => p.categoria === k)?.monto ?? "";
  hoja("Presupuesto de la casa", `<p class="hint" style="margin:0">Cuánto quieren gastar juntos al mes en cada categoría. Deja vacío para no usar límite.</p>` +
    C.CATS_GASTO.map((k) => campo(`p-${k}`, cat(k).n, `<span class="pre">S/</span><input id="p-${k}" name="${k}" inputmode="decimal" value="${val(k)}">`)).join(""),
    async (f) => { for (const k of C.CATS_GASTO) { const v = f[k] === "" ? 0 : numero(f[k]); const r = await api.guardar("presupuestos", { hogar_id: S.hogar.id, categoria: k, monto: v });
      S.d.presupuestos = S.d.presupuestos.filter((p) => p.categoria !== k).concat([r]); } toast("Presupuesto guardado"); });
};
A["subir-pres"] = async (el) => { const r = await api.guardar("presupuestos", { hogar_id: S.hogar.id, categoria: el.dataset.cat, monto: Number(el.dataset.v) });
  S.d.presupuestos = S.d.presupuestos.filter((p) => p.categoria !== el.dataset.cat).concat([r]); toast(`${cat(el.dataset.cat).n}: nuevo límite ${C.solesCorto(el.dataset.v)}`); render(); };
A.mantener = (el) => { el.closest(".q-card").innerHTML = `<span class="muted">Se mantiene el presupuesto.</span>`; };
A["cierre-ok"] = async () => { const r = await api.guardar("cierres", { hogar_id: S.hogar.id, mes: S.mes + "-01", user_id: S.yo.user_id });
  S.d.cierres = S.d.cierres.filter((c) => !(c.mes === r.mes && c.user_id === r.user_id)).concat([r]); toast("Marcado como revisado"); render(); };
A["meta-nueva"] = () => hoja("Nueva meta", campo("m-n", "Nombre", `<input id="m-n" name="nombre" required maxlength="40" placeholder="Ej.: Viaje a Cusco">`)
  + campo("m-o", "Cuánto quieren juntar", `<span class="pre">S/</span><input id="m-o" name="objetivo" inputmode="decimal" required>`)
  + campo("m-f", "Para cuándo <span class='muted' style='font-weight:500'>(opcional)</span>", `<input id="m-f" name="fecha" type="month">`),
  async (f) => { if (!f.nombre.trim()) throw new Error("Ponle un nombre a la meta."); const r = await api.guardar("metas", { hogar_id: S.hogar.id, nombre: f.nombre.trim(), objetivo: numero(f.objetivo), fecha_meta: f.fecha ? f.fecha + "-01" : null });
    S.d.metas.push(r); toast("Meta creada"); });
A.aportar = (el) => {
  const mt = S.d.metas.find((x) => x.id === el.dataset.id);
  hoja(`Aportar a ${mt.nombre}`, campo("a-m", "Monto", `<span class="pre">S/</span><input id="a-m" name="monto" inputmode="decimal" required>`)
    + campo("a-q", "¿Quién aporta?", `<select id="a-q" name="quien">${opcionesMiembros(S.yo.user_id, false)}</select>`),
    async (f) => { await guardarMov({ hogar_id: S.hogar.id, tipo: "gasto", monto: numero(f.monto), fecha: C.hoyISO(), comercio: `Aporte a ${mt.nombre}`, medio: "Transferencia", categoria: "otros",
      alcance: "propio", duenio: f.quien, pagado_por: f.quien, clase: "aporte_meta", meta_id: mt.id }); toast("Aporte registrado"); },
    { extra: `<button class="link" type="button" data-act="meta-borrar" data-id="${mt.id}" style="justify-self:center;color:var(--expense)">Eliminar meta</button>` });
};
A["meta-borrar"] = async (el) => { await api.borrar("metas", el.dataset.id); S.d.metas = S.d.metas.filter((m) => m.id !== el.dataset.id); document.querySelector(".sheet")?.remove(); toast("Meta eliminada"); render(); };
function hojaFijo(f0) {
  hoja(f0 ? "Editar pago fijo" : "Nuevo pago fijo", campo("x-n", "Nombre", `<input id="x-n" name="nombre" required maxlength="40" value="${esc(f0?.nombre || "")}" placeholder="Ej.: Internet">`)
    + campo("x-m", "Monto", `<span class="pre">S/</span><input id="x-m" name="monto" inputmode="decimal" required value="${f0?.monto ?? ""}">`)
    + `<div class="row2">${campo("x-d", "Día que vence", `<input id="x-d" name="dia" type="number" min="1" max="31" required value="${f0?.dia_vence ?? ""}">`)}
       ${campo("x-r", "Quién paga", `<select id="x-r" name="resp">${opcionesMiembros(f0 ? f0.responsable : S.yo.user_id)}</select>`)}</div>`,
    async (f) => { const dia = parseInt(f.dia, 10); if (!(dia >= 1 && dia <= 31)) throw new Error("El día debe estar entre 1 y 31.");
      const r = await api.guardar("pagos_fijos", { ...(f0 ? { id: f0.id } : {}), hogar_id: S.hogar.id, nombre: f.nombre.trim(), monto: numero(f.monto), dia_vence: dia, responsable: f.resp || null, categoria: "casa" });
      S.d.pagos_fijos = S.d.pagos_fijos.filter((x) => x.id !== r.id).concat([r]); toast("Pago fijo guardado"); },
    { extra: f0 ? `<button class="link" type="button" data-act="fijo-borrar" data-id="${f0.id}" style="justify-self:center;color:var(--expense)">Eliminar pago fijo</button>` : "" });
}
A["fijo-nuevo"] = () => hojaFijo(null);
A["fijo-editar"] = (el) => hojaFijo(S.d.pagos_fijos.find((x) => x.id === el.dataset.id));
A["fijo-borrar"] = async (el) => { await api.borrar("pagos_fijos", el.dataset.id); S.d.pagos_fijos = S.d.pagos_fijos.filter((x) => x.id !== el.dataset.id); document.querySelector(".sheet")?.remove(); toast("Pago fijo eliminado"); render(); };
A["fijo-pagar"] = (el) => {
  const f = S.d.pagos_fijos.find((x) => x.id === el.dataset.id);
  hoja(`Pagar ${f.nombre}`, campo("fp-m", "Monto pagado", `<span class="pre">S/</span><input id="fp-m" name="monto" inputmode="decimal" required value="${f.monto}">`)
    + campo("fp-q", "¿Quién pagó?", `<select id="fp-q" name="quien">${opcionesMiembros(f.responsable || S.yo.user_id, false)}</select>`)
    + campo("fp-x", "Medio", `<select id="fp-x" name="medio">${C.MEDIOS.map((m) => `<option ${m === "Transferencia" ? "selected" : ""}>${m}</option>`).join("")}</select>`),
    async (x) => {
      await guardarMov({ hogar_id: S.hogar.id, tipo: "gasto", monto: numero(x.monto), fecha: C.hoyISO(), comercio: f.nombre, medio: x.medio, categoria: f.categoria || "casa",
        alcance: f.responsable ? "propio" : "compartido", duenio: f.responsable || null, pagado_por: x.quien, clase: "normal" });
      const r = await api.guardar("pagos_fijos", { id: f.id, ultimo_pago: C.hoyISO() }); S.d.pagos_fijos = S.d.pagos_fijos.map((y) => (y.id === f.id ? { ...y, ...r } : y)); toast(`${f.nombre} pagado`);
    }, { boton: "Registrar pago" });
};
function hojaTarjeta(t0) {
  hoja(t0 ? "Editar tarjeta" : "Nueva tarjeta", `<div class="row2">${campo("t-n", "Nombre", `<input id="t-n" name="nombre" required maxlength="24" value="${esc(t0?.nombre || "")}" placeholder="Ej.: Visa BCP">`)}
    ${campo("t-u", "Últimos 4", `<input id="t-u" name="u4" inputmode="numeric" maxlength="4" pattern="\\d{4}" value="${esc(t0?.ultimos4 || "")}" placeholder="4821">`)}</div>`
    + campo("t-l", "Línea de crédito", `<span class="pre">S/</span><input id="t-l" name="linea" inputmode="decimal" value="${t0?.linea ?? ""}" placeholder="5000">`)
    + `<div class="row2">${campo("t-c", "Día de cierre", `<input id="t-c" name="cierre" type="number" min="1" max="31" value="${t0?.dia_cierre ?? 25}" required>`)}
       ${campo("t-p", "Día de pago", `<input id="t-p" name="pago" type="number" min="1" max="31" value="${t0?.dia_pago ?? 10}" required>`)}</div>`
    + campo("t-col", "Color", `<select id="t-col" name="color"><option value="esmeralda" ${t0?.color !== "rosado" ? "selected" : ""}>Esmeralda</option><option value="rosado" ${t0?.color === "rosado" ? "selected" : ""}>Rosado</option></select>`),
    async (f) => { if (f.u4 && !/^\d{4}$/.test(f.u4)) throw new Error("Escribe los últimos 4 dígitos.");
      const r = await api.guardar("tarjetas", { ...(t0 ? { id: t0.id } : { user_id: S.yo.user_id }), hogar_id: S.hogar.id, nombre: f.nombre.trim(), ultimos4: f.u4, linea: f.linea ? numero(f.linea) : 0,
        dia_cierre: parseInt(f.cierre, 10), dia_pago: parseInt(f.pago, 10), color: f.color });
      S.d.tarjetas = S.d.tarjetas.filter((x) => x.id !== r.id).concat([r]); toast("Tarjeta guardada"); },
    { extra: t0 ? `<button class="link" type="button" data-act="tarjeta-borrar" data-id="${t0.id}" style="justify-self:center;color:var(--expense)">Eliminar tarjeta</button>` : "" });
}
A["tarjeta-nueva"] = () => hojaTarjeta(null);
A["tarjeta-editar"] = (el) => hojaTarjeta(S.d.tarjetas.find((t) => t.id === el.dataset.id));
A["tarjeta-borrar"] = async (el) => { await api.borrar("tarjetas", el.dataset.id); S.d.tarjetas = S.d.tarjetas.filter((t) => t.id !== el.dataset.id);
  S.d.cuotas = S.d.cuotas.filter((q) => q.tarjeta_id !== el.dataset.id); document.querySelector(".sheet")?.remove(); toast("Tarjeta eliminada"); render(); };
A["pagar-tarjeta"] = (el) => {
  const t = S.d.tarjetas.find((x) => x.id === el.dataset.id), deuda = C.deudaTarjeta(S.d.movimientos, t.id).deuda;
  hoja(`Pago de ${t.nombre} ••${t.ultimos4}`, campo("pt-m", "Monto pagado", `<span class="pre">S/</span><input id="pt-m" name="monto" inputmode="decimal" required value="${deuda.toFixed(2)}">`),
    async (f) => { await guardarMov({ hogar_id: S.hogar.id, tipo: "gasto", monto: numero(f.monto), fecha: C.hoyISO(), comercio: `Pago ${t.nombre} ••${t.ultimos4}`, medio: "Transferencia", categoria: "otros",
      alcance: "propio", duenio: S.yo.user_id, pagado_por: S.yo.user_id, clase: "pago_tarjeta", tarjeta_id: t.id }); toast("Pago registrado"); },
    { boton: "Registrar", extra: `<button class="link" type="button" data-act="pagar-tarjeta-captura" data-id="${t.id}" style="justify-self:center">Prefiero subir la captura del pago</button>` });
};
A["pagar-tarjeta-captura"] = (el) => { document.querySelector(".sheet")?.remove(); const t = S.d.tarjetas.find((x) => x.id === el.dataset.id);
  S.preset = { clase: "pago_tarjeta", tarjeta_id: t.id, comercio: `Pago ${t.nombre} ••${t.ultimos4}`, volver: "tarjetas" }; ir("adjuntar"); };
A["cuota-nueva"] = () => {
  if (!S.d.tarjetas.length) { toast("Primero agrega una tarjeta."); return; }
  hoja("Compra en cuotas", campo("q-d", "Qué compraste", `<input id="q-d" name="d" required maxlength="40" placeholder="Ej.: Laptop">`)
    + campo("q-t", "Tarjeta", `<select id="q-t" name="t">${S.d.tarjetas.map((t) => `<option value="${t.id}">${esc(t.nombre)} ••${esc(t.ultimos4)}</option>`).join("")}</select>`)
    + campo("q-m", "Monto de cada cuota", `<span class="pre">S/</span><input id="q-m" name="m" inputmode="decimal" required>`)
    + `<div class="row2">${campo("q-n", "Total de cuotas", `<input id="q-n" name="n" type="number" min="1" max="60" required>`)}${campo("q-p", "Ya pagadas", `<input id="q-p" name="p" type="number" min="0" max="60" value="0">`)}</div>`,
    async (f) => { const n = parseInt(f.n, 10), p = parseInt(f.p || "0", 10); if (!(n > 0) || p > n) throw new Error("Revisa el número de cuotas.");
      const r = await api.guardar("cuotas", { hogar_id: S.hogar.id, tarjeta_id: f.t, descripcion: f.d.trim(), monto_cuota: numero(f.m), total_cuotas: n, cuotas_pagadas: p }); S.d.cuotas.push(r); toast("Compra en cuotas agregada"); });
};
A["cuota-pagada"] = async (el) => { const q = S.d.cuotas.find((x) => x.id === el.dataset.id); const r = await api.guardar("cuotas", { id: q.id, cuotas_pagadas: q.cuotas_pagadas + 1 });
  Object.assign(q, r, { cuotas_pagadas: q.cuotas_pagadas + 1 }); render(); };
A["cuota-borrar"] = async (el) => { await api.borrar("cuotas", el.dataset.id); S.d.cuotas = S.d.cuotas.filter((q) => q.id !== el.dataset.id); render(); };
A.perfil = () => hoja("Mis datos", campo("y-n", "Nombre", `<input id="y-n" name="nombre" required maxlength="30" value="${esc(S.yo.nombre)}">`)
  + campo("y-i", "Ingreso mensual", `<span class="pre">S/</span><input id="y-i" name="ingreso" inputmode="decimal" value="${S.yo.ingreso_mensual}">`)
  + `<span class="hint">Se usa para repartir los gastos de la casa según ingresos.</span>`
  + campo("y-p", "Presupuesto mensual de gastos", `<span class="pre">S/</span><input id="y-p" name="pres" inputmode="decimal" value="${S.yo.presupuesto_personal}">`),
  async (f) => { if (!f.nombre.trim()) throw new Error("Escribe tu nombre.");
    const r = await api.actualizarMiembro(S.hogar.id, S.yo.user_id, { nombre: f.nombre.trim(), ingreso_mensual: f.ingreso ? numero(f.ingreso) : 0, presupuesto_personal: f.pres ? numero(f.pres) : 0 });
    S.miembros = S.miembros.map((m) => (m.user_id === r.user_id ? r : m)); S.yo = r; S.rep = C.reparto(S.hogar, S.miembros); toast("Datos guardados"); });

/* ---------------- eventos ---------------- */
document.addEventListener("click", (e) => {
  const t = e.target.closest("button, [data-go]"); if (!t || t.closest(".sheet") && !t.dataset.act) return;
  if (t.dataset.pick) {
    const it = itemActual(); leerForm(); const k = t.dataset.pick, v = t.dataset.v;
    if (k === "quien") {
      const yo = S.yo.user_id, pj = S.pareja?.user_id;
      if (v === "yo") Object.assign(it, { alcance: "propio", duenio: yo, pagado_por: yo });
      else if (v === "pareja") Object.assign(it, { alcance: "propio", duenio: pj, pagado_por: pj, privado: false });
      else Object.assign(it, { alcance: "compartido", duenio: null, pagado_por: it.pagado_por || yo, privado: false });
    } else if (k === "tipo") { it.tipo = v; it.categoria = v === "ingreso" ? "ingreso" : (it.categoria === "ingreso" ? "comida" : it.categoria); }
    else it[k] = v;
    render(); return;
  }
  if (t.dataset.sw) { const it = itemActual(); it[t.dataset.sw] = t.getAttribute("aria-checked") !== "true"; t.setAttribute("aria-checked", String(it[t.dataset.sw])); return; }
  if (t.dataset.act && A[t.dataset.act]) { e.preventDefault(); A[t.dataset.act](t); return; }
  if (t.dataset.go) { if (t.dataset.go === "adjuntar" && !t.closest(".screen")?.querySelector("[data-drop]")) { if (!S.preset || t.closest(".tabbar")) S.preset = null; } ir(t.dataset.go); }
});
document.addEventListener("input", (e) => {
  if (e.target.matches("[data-lote-nom]")) { S.lote.items[+e.target.dataset.loteNom].comercio = e.target.value; return; }
  if (e.target.matches("[data-buscar]")) { S.filtros.texto = e.target.value; const pos = e.target.selectionStart; render(); const i = document.getElementById("f-buscar"); i.focus(); i.setSelectionRange(pos, pos); }
  if (e.target.id === "f-monto") pintarReparto();
});
document.addEventListener("change", (e) => {
  if (e.target.matches("[data-file]")) { procesarArchivo(e.target.files[0]); e.target.value = ""; }
  if (e.target.matches("[data-lote-cat]")) { S.lote.items[+e.target.dataset.loteCat].categoria = e.target.value; }
  if (e.target.matches("[data-lote-tj]")) { S.lote.tarjeta_id = e.target.value; }
  if (e.target.matches("[data-medio]")) { const w = document.querySelector("[data-tarjeta]"); if (w) w.hidden = e.target.value !== "Tarjeta de crédito"; }
});
document.addEventListener("paste", (e) => {
  if (!S.hogar || document.querySelector(".sheet")) return;
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
  if (item) { e.preventDefault(); procesarArchivo(item.getAsFile()); }
});
document.addEventListener("dragover", (e) => { const d = e.target.closest?.("[data-drop]"); if (d) { e.preventDefault(); d.classList.add("over"); } });
document.addEventListener("dragleave", (e) => e.target.closest?.("[data-drop]")?.classList.remove("over"));
document.addEventListener("drop", (e) => { if (e.target.closest?.("[data-drop]")) { e.preventDefault(); procesarArchivo(e.dataTransfer.files[0]); } });
document.addEventListener("submit", async (e) => {
  const f = e.target.dataset.form; if (!f) return; e.preventDefault();
  const datos = Object.fromEntries(new FormData(e.target)); S.error = "";
  const btn = e.submitter; if (btn) btn.disabled = true;
  try {
    if (f === "login") {
      if (!datos.email || !datos.password) throw new Error("Escribe tu correo y contraseña.");
      if (S.loginModo === "crear") { const r = await api.registrar(datos.email.trim(), datos.password); if (r.confirmar) { S.error = "Te enviamos un correo. Confirma tu cuenta con el enlace y luego entra aquí."; S.loginModo = "entrar"; render(); return; } }
      else await api.entrar(datos.email.trim(), datos.password);
      S.sesion = await api.sesion(); await cargarPerfil();
    } else if (f === "hogar") {
      if (!datos.nombre?.trim()) throw new Error("Escribe tu nombre.");
      if (btn?.value === "unirse") { if (!datos.codigo?.trim()) throw new Error("Escribe el código que te pasó tu pareja."); await api.unirseHogar(datos.codigo.trim(), datos.nombre.trim()); }
      else await api.crearHogar(datos.nombre.trim());
      await cargarPerfil(); toast(btn?.value === "unirse" ? "Te uniste al hogar" : "Hogar creado");
    }
  } catch (err) { S.error = err.message; }
  if (btn) btn.disabled = false;
  render();
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
render();
iniciar();
