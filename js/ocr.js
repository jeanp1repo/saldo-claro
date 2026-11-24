// Lectura gratuita en el propio dispositivo: OCR (tesseract.js) + reglas para comprobantes peruanos.
// Devuelve el mismo formato que la función con Claude, para que la pantalla de revisión no cambie.

let workerP = null;
function worker() {
  if (!workerP) {
    workerP = new Promise((ok, ko) => {
      if (window.Tesseract) return ok();
      const sc = document.createElement("script");
      sc.src = "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js";
      sc.onload = ok; sc.onerror = () => ko(new Error("No se pudo cargar el lector. Revisa tu conexión."));
      document.head.appendChild(sc);
    }).then(() => window.Tesseract.createWorker("spa", 1, { langPath: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/spa/4.0.0_best_int" }))
      .catch((e) => { workerP = null; throw e; });
  }
  return workerP;
}

// Tesseract pierde las letras muy grandes (el monto de Yape/Plin). Si en la primera pasada
// no aparece el monto, se lee otra vez la imagen reducida y en gris, y se juntan los textos.
async function reducida(imagen, k) {
  const bmp = await createImageBitmap(imagen);
  const cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  const cx = cv.getContext("2d"); cx.filter = "grayscale(1) contrast(1.4)"; cx.drawImage(bmp, 0, 0, cv.width, cv.height);
  return new Promise((ok) => cv.toBlob(ok, "image/png"));
}
export async function leerLocal(imagen, hoy) {
  const w = await worker();
  let texto = (await w.recognize(imagen)).data.text || "";
  let r = interpretar(texto, hoy);
  for (const k of [0.5, 0.3]) {
    if (r.legible) break;
    const extra = (await w.recognize(await reducida(imagen, k))).data.text || "";
    texto = texto + "\n" + extra;
    r = interpretar(texto, hoy);
  }
  return r;
}

/* ---------------- reglas ---------------- */
const MESES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, set: 9, sep: 9, oct: 10, nov: 11, dic: 12 };
const CATEGORIAS = [
  ["comida", /bodega|market|mercado|super|plaza vea|tottus|metro|wong|vivanda|mass|tambo|oxxo|restaur|pollo|chifa|cevich|pizza|burger|kfc|bembos|cafe|caf[eé]|panader|rappi|pedidos ya|pedidosya|didi food|men[uú]|polleria|juguer/i],
  ["transporte", /taxi|uber|cabify|indriver|beat|didi|grifo|repsol|primax|pecsa|petroper|combustible|peaje|metropolitano|corredor|pasaje|estacionamiento|parking/i],
  ["casa", /luz del sur|enel|sedapal|agua|alquiler|internet|claro|movistar|entel|bitel|win |calidda|gas |sodimac|promart|maestro|ripley|saga|oechsle|hiraoka|condominio|mantenimiento/i],
  ["salud", /farmacia|inkafarma|mifarma|boticas|botica|cl[ií]nica|hospital|laboratorio|m[eé]dic|dental|seguro|pacifico|rimac|essalud/i],
  ["ocio", /cine|cineplanet|cinemark|netflix|spotify|disney|hbo|max |prime video|youtube|steam|playstation|teleticket|joinnus|bar |discoteca|viaje|hotel|airbnb|latam|sky airline|jetsmart/i],
];

function aNumero(s) {
  s = s.replace(/\s/g, "");
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");   // 1.200,50
  else if (/^\d+,\d{2}$/.test(s)) s = s.replace(",", ".");                               // 18,50
  else s = s.replace(/,/g, "");                                                         // 1,200.50
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}
const pad = (n) => String(n).padStart(2, "0");

function buscarFecha(t, hoy) {
  const anioHoy = Number(hoy.slice(0, 4));
  let m = t.match(/\b(\d{1,2})\s*(?:de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|set|sep|oct|nov|dic)[a-z]*\.?\s*(?:de\s+|del\s+)?(\d{4}|\d{2})?/i);
  if (m) { const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : anioHoy; return { iso: `${y}-${pad(MESES[m[2].toLowerCase()])}-${pad(m[1])}`, conf: m[3] ? "alta" : "media" }; }
  m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return { iso: `${m[1]}-${m[2]}-${m[3]}`, conf: "alta" };
  m = t.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/);
  if (m && +m[2] <= 12 && +m[1] <= 31) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return { iso: `${y}-${pad(m[2])}-${pad(m[1])}`, conf: "alta" }; }
  return { iso: "", conf: "baja" };
}
function buscarHora(t) {
  const m = t.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?/i);
  if (!m) return "";
  let h = +m[1]; const pm = m[3] && /p/i.test(m[3]); const am = m[3] && /a/i.test(m[3]);
  if (pm && h < 12) h += 12; if (am && h === 12) h = 0;
  return h <= 23 ? `${pad(h)}:${m[2]}` : "";
}
function buscarMonto(lineas, tipoDoc) {
  const re = /(?:S\s?\/\s?\.?|S\/\.|PEN|soles?)\s*([\d.,]+\d)/i;
  const cands = [];
  lineas.forEach((l, i) => {
    const m = l.match(re) || (/total|importe|monto|pagaste|yapeaste|enviaste/i.test(l) ? l.match(/([\d]{1,3}(?:[.,]\d{3})*[.,]\d{2})\b/) : null);
    if (m) { const n = aNumero(m[1]); if (n && n > 0 && n < 1e7) cands.push({ n, i, clave: /total|importe|monto|pagar|pagaste|yapeaste|enviaste|te yape/i.test(l + " " + (lineas[i - 1] || "")) }); }
  });
  if (!cands.length) return { monto: 0, conf: "baja" };
  const conClave = cands.filter((c) => c.clave);
  if (tipoDoc === "boleta_o_factura" || tipoDoc === "recibo_servicio") {
    const total = conClave.length ? conClave[conClave.length - 1] : cands.reduce((a, b) => (b.n > a.n ? b : a));
    return { monto: total.n, conf: conClave.length ? "alta" : "media" };
  }
  const elegido = conClave[0] || cands[0];
  return { monto: elegido.n, conf: cands.length === 1 || conClave.length ? "alta" : "media" };
}
function buscarComercio(lineas, tipoDoc) {
  const limpia = (s) => s.replace(/[|_*•]+/g, " ").replace(/\s{2,}/g, " ").trim();
  const util = (s) => s && s.length >= 3 && /[a-záéíóúñ]{3}/i.test(s) && !/S\s?\/|operaci|fecha|hora|\d{2}:\d{2}|yape|plin|compartir|constancia|exitos|realizad|¡|destino|celular/i.test(s);
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    const m = l.match(/^(?:para|destino|enviado a|pagado a|beneficiario|a nombre de|comercio|establecimiento|te yape[oó]|te envi[oó]|de)\s*:?\s*(.*)$/i);
    if (m) { const v = limpia(m[1]); if (util(v)) return { comercio: v, conf: "media" }; const sig = limpia(lineas[i + 1] || ""); if (util(sig)) return { comercio: sig, conf: "media" }; }
  }
  if (tipoDoc === "boleta_o_factura") {
    const r = lineas.find((l) => /S\.?A\.?C|E\.?I\.?R\.?L|S\.?A\.?A?\b|S\.R\.L/i.test(l));
    if (r) return { comercio: limpia(r), conf: "media" };
    const primero = lineas.map(limpia).find(util);
    if (primero) return { comercio: primero, conf: "baja" };
  }
  // Yape/Plin: el nombre suele ir justo después del monto
  const iMonto = lineas.findIndex((l) => /S\s?\/\s?\.?\s*\d/.test(l));
  if (iMonto >= 0) for (const l of lineas.slice(iMonto + 1, iMonto + 4)) { const v = limpia(l); if (util(v)) return { comercio: v, conf: "baja" }; }
  return { comercio: "", conf: "baja" };
}

export function interpretar(texto, hoy) {
  const t = texto.replace(/\r/g, "");
  const lineas = t.split("\n").map((l) => l.trim()).filter(Boolean);
  const tipoDoc = /yape/i.test(t) ? "yape" : /plin/i.test(t) ? "plin"
    : /estado de cuenta|movimientos del|saldo anterior/i.test(t) ? "estado_de_cuenta"
    : /boleta|factura|R\.?U\.?C/i.test(t) ? "boleta_o_factura"
    : /recibo|consumo|suministro|luz del sur|enel|sedapal|calidda/i.test(t) ? "recibo_servicio"
    : /visa|mastercard|amex|voucher|\*{3,}\s?\d{4}/i.test(t) ? "voucher_tarjeta"
    : /transferencia|BCP|interbank|BBVA|scotiabank|banbif|pichincha|cuenta destino/i.test(t) ? "transferencia" : "otro";
  const { monto, conf: cMonto } = buscarMonto(lineas, tipoDoc);
  const { iso: fecha, conf: cFecha } = buscarFecha(t, hoy);
  const { comercio, conf: cCom } = buscarComercio(lineas, tipoDoc);
  const ingreso = /te yape|recibiste|te envi[oó]|te plin|abono|dep[oó]sito recibido|recibido de|transferencia recibida/i.test(t);
  const medio = tipoDoc === "yape" ? "Yape" : tipoDoc === "plin" ? "Plin" : tipoDoc === "transferencia" ? "Transferencia"
    : tipoDoc === "voucher_tarjeta" ? (/d[eé]bito/i.test(t) ? "Tarjeta de débito" : "Tarjeta de crédito") : /efectivo/i.test(t) ? "Efectivo" : "Otro";
  const op = t.match(/(?:(?:nro|n[uú]mero|n[º°o0]?|c[oó]d(?:igo)?)\.?\s*(?:de\s*)?operaci[oó]n|operaci[oó]n\s*n[º°o]?\.?)\s*[:#]?\s*([A-Z0-9-]{4,})/i);
  const u4 = t.match(/(?:\*{2,}|•{2,}|x{3,}|terminada en|termina en)\s*(\d{4})\b/i);
  const textoCat = `${comercio} ${t}`;
  const categoria = ingreso ? "ingreso" : (CATEGORIAS.find(([, re]) => re.test(textoCat))?.[0] || "otros");
  const cuotas = t.match(/(\d{1,2})\s*cuotas?/i);
  const legible = monto > 0;
  const dudas = [cMonto, cFecha, cCom].filter((c) => c !== "alta").length;
  return {
    legible, tipo_documento: tipoDoc,
    aviso: !legible ? "" : tipoDoc === "estado_de_cuenta"
      ? "La lectura gratuita toma solo un monto de los estados de cuenta. Usa “Leer mejor con IA” para separar cada movimiento."
      : dudas ? "Lectura gratuita en tu celular. Revisa los datos marcados en ámbar." : "Lectura gratuita en tu celular. Revisa y guarda.",
    movimientos: legible ? [{
      tipo: ingreso ? "ingreso" : "gasto", monto, moneda: /US\$|\bUSD\b/.test(t) ? "USD" : "PEN", fecha, hora: buscarHora(t), comercio, medio, categoria,
      n_operacion: op ? op[1] : "", ultimos4_tarjeta: u4 ? u4[1] : "", cuotas: cuotas ? +cuotas[1] : 1,
      confianza: { monto: cMonto, fecha: cFecha, comercio: comercio ? cCom : "baja" },
    }] : [],
    texto: t,
  };
}
