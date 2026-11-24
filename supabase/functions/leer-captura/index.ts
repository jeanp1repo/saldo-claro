// Saldo Claro · lee una captura (Yape, Plin, transferencia, boleta, recibo o estado de cuenta)
// y devuelve los movimientos que encuentra como JSON.
// Requiere el secreto ANTHROPIC_API_KEY (supabase secrets set ANTHROPIC_API_KEY=...).
// Supabase verifica el JWT del usuario antes de llegar aquí (verify_jwt activo por defecto).
import Anthropic from "npm:@anthropic-ai/sdk@1.6.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TIPOS_IMAGEN = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type TipoImagen = (typeof TIPOS_IMAGEN)[number];

const CONFIANZA = { type: "string", enum: ["alta", "media", "baja"] };

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["legible", "tipo_documento", "movimientos", "aviso"],
  properties: {
    legible: { type: "boolean", description: "false si la imagen no muestra un comprobante o movimiento de dinero legible" },
    tipo_documento: {
      type: "string",
      enum: ["yape", "plin", "transferencia", "boleta_o_factura", "recibo_servicio", "estado_de_cuenta", "voucher_tarjeta", "otro"],
    },
    aviso: { type: "string", description: "Frase corta para el usuario si algo no se leyó bien; vacío si todo está claro" },
    movimientos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "tipo", "monto", "moneda", "fecha", "hora", "comercio", "medio", "categoria",
          "n_operacion", "ultimos4_tarjeta", "cuotas", "confianza",
        ],
        properties: {
          tipo: { type: "string", enum: ["gasto", "ingreso"] },
          monto: { type: "number", description: "Monto positivo, sin signo" },
          moneda: { type: "string", enum: ["PEN", "USD", "otra"] },
          fecha: { type: "string", description: "AAAA-MM-DD, o vacío si no aparece" },
          hora: { type: "string", description: "HH:MM en 24 h, o vacío" },
          comercio: { type: "string", description: "Comercio, empresa o persona; completo si se puede deducir" },
          medio: {
            type: "string",
            enum: ["Yape", "Plin", "Transferencia", "Tarjeta de crédito", "Tarjeta de débito", "Efectivo", "Otro"],
          },
          categoria: { type: "string", enum: ["comida", "casa", "transporte", "salud", "ocio", "otros", "ingreso"] },
          n_operacion: { type: "string", description: "Número de operación o de comprobante; vacío si no hay" },
          ultimos4_tarjeta: { type: "string", description: "Últimos 4 dígitos de la tarjeta si se ven; vacío si no" },
          cuotas: { type: "integer", description: "Número de cuotas si es una compra en cuotas; 1 si no" },
          confianza: {
            type: "object",
            additionalProperties: false,
            required: ["monto", "fecha", "comercio"],
            properties: { monto: CONFIANZA, fecha: CONFIANZA, comercio: CONFIANZA },
          },
        },
      },
    },
  },
};

const SISTEMA = `Lees capturas de pantalla y fotos de comprobantes de pago de Perú para una app de finanzas personales.
Fuentes habituales: Yape, Plin, transferencias de bancos peruanos (BCP, Interbank, BBVA, Scotiabank), boletas y facturas, recibos de luz, agua o internet, vouchers de tarjeta y estados de cuenta.

Reglas:
- Extrae solo lo que se ve. No inventes montos, fechas ni números de operación.
- "gasto" cuando el dueño de la captura paga o envía dinero; "ingreso" cuando lo recibe ("Te yapearon", "Recibiste", abonos, depósitos, sueldo).
- Los montos en soles aparecen como "S/" o "S/."; usa moneda USD solo si se ve "US$" o "$".
- Un estado de cuenta puede tener muchos movimientos: devuelve uno por fila (máximo 40). Una captura de pago es un solo movimiento.
- Categoría: comida (bodegas, mercados, supermercados, restaurantes, delivery), casa (alquiler, luz, agua, gas, internet, muebles, electrodomésticos), transporte (taxi, combustible, peajes, pasajes), salud (farmacia, clínica, seguros), ocio (cine, streaming, salidas, viajes), otros (lo demás). Para ingresos usa "ingreso".
- Confianza "baja" o "media" cuando el texto está cortado, borroso o tapado; en ese caso explícalo en "aviso".
- Si la fecha no trae año, usa el año de la fecha de hoy que se indica.
- Si la imagen no es un comprobante ni un movimiento de dinero, responde legible=false y movimientos vacío.`;

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Usa POST" }, 405);

  let imagen: string, tipo: TipoImagen, hoy: string;
  try {
    const body = await req.json();
    imagen = String(body.imagen_base64 || "");
    tipo = body.media_type;
    hoy = /^\d{4}-\d{2}-\d{2}$/.test(body.hoy) ? body.hoy : new Date().toISOString().slice(0, 10);
  } catch {
    return json({ error: "No se pudo leer la solicitud" }, 400);
  }
  if (!imagen) return json({ error: "Falta la imagen" }, 400);
  if (!TIPOS_IMAGEN.includes(tipo)) return json({ error: "Formato de imagen no soportado. Usa JPG, PNG o WEBP." }, 400);
  if (imagen.length > 7_000_000) return json({ error: "La imagen es muy pesada. Prueba con una captura más pequeña." }, 413);

  try {
    // Fallback del lado del servidor: si el modelo declina por un filtro de seguridad,
    // la API reintenta con otro modelo en la misma llamada.
    const response = await anthropic.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SISTEMA,
      output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMA } },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: tipo, data: imagen } },
          { type: "text", text: `Fecha de hoy: ${hoy}. Extrae los movimientos de esta imagen.` },
        ],
      }],
    });

    if (response.stop_reason === "refusal") {
      return json({ error: "No pudimos leer esta imagen. Ingresa los datos a mano." }, 422);
    }
    if (response.stop_reason === "max_tokens") {
      return json({ error: "La imagen tiene demasiados movimientos. Recórtala en partes." }, 422);
    }
    const texto = response.content.find((b) => b.type === "text");
    if (!texto || texto.type !== "text") return json({ error: "La lectura llegó vacía. Intenta otra vez." }, 502);
    return json(JSON.parse(texto.text));
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return json({ error: "Hay muchas lecturas a la vez. Espera un minuto y vuelve a intentar." }, 429);
    }
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("ANTHROPIC_API_KEY inválida o ausente");
      return json({ error: "El servicio de lectura no está configurado." }, 500);
    }
    if (error instanceof Anthropic.BadRequestError) {
      console.error("Solicitud rechazada:", error.message);
      return json({ error: "No pudimos procesar esa imagen. Prueba con otra captura." }, 400);
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`Error de la API ${error.status}:`, error.message);
      return json({ error: "El servicio de lectura falló. Intenta en unos minutos." }, 502);
    }
    console.error(error);
    return json({ error: "Error inesperado al leer la captura." }, 500);
  }
});
