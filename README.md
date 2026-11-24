# Saldo Claro

App web instalable (PWA) de finanzas personales y en pareja. Subes una captura de Yape, Plin, una transferencia, una boleta o un estado de cuenta; Claude lee monto, fecha, comercio y medio; tú revisas y guardas.

- Sin compilación: HTML + CSS + JS (módulos). Se publica tal cual en GitHub Pages.
- Datos en Supabase (plan gratis): cada uno inicia sesión y los dos ven el mismo hogar.
- Sin Supabase configurado abre en **modo demo** (Ana y Leo, datos de ejemplo en el navegador).

## Probar en tu computadora

```powershell
python -m http.server 5178 --directory C:\proyectos\saldo-claro
```

Abre http://localhost:5178. Mientras `js/config.js` esté vacío, verás el modo demo.

## Conectar la nube (una sola vez)

1. **Crea el proyecto** en https://supabase.com (plan Free). Anota la *Project URL* y la *anon public key* (Project Settings → API).
2. **Crea las tablas:** SQL Editor → pega todo `supabase/migrations/20261123000000_esquema_inicial.sql` → Run.
3. **Inicio de sesión:** Authentication → Sign In / Providers → Email activado. Si no quieres confirmar el correo al registrarte, desactiva “Confirm email”.
4. **Clave de Claude:** crea una API key en https://platform.claude.com y guárdala como secreto de Supabase. Nunca la pongas en la app.
   ```powershell
   npx supabase login
   npx supabase link --project-ref TU_PROJECT_REF
   npx supabase secrets set ANTHROPIC_API_KEY=tu_clave
   npx supabase functions deploy leer-captura
   ```
5. **Conecta la app:** pega la URL y la anon key en `js/config.js`.
6. **Publica** en GitHub Pages (Settings → Pages → rama `main`, carpeta raíz) y agrega la URL de Pages en Supabase → Authentication → URL Configuration → Site URL.

Al publicar cambios, sube `VERSION` en `sw.js` para que los celulares descarguen la versión nueva.

## Costo de la lectura

Por defecto la lectura es **gratis**: corre en el celular con OCR (tesseract.js, `js/ocr.js`) y reglas para Yape, Plin, bancos, boletas y recibos. No necesita clave ni internet después de la primera carga.

El botón opcional “Leer mejor con IA” usa Claude (paso 4, `ANTHROPIC_API_KEY`). Si no configuras la clave, ese botón muestra un aviso y todo lo demás funciona igual. Cada lectura con IA es una llamada a Claude Opus 5.5 con una imagen (unos céntimos de sol). La función usa *fallback* del servidor: si el modelo declina una imagen, la API reintenta con otro modelo en la misma llamada. Si la lectura falla, la app deja ingresar los datos a mano.

## Estructura

| Archivo | Qué hace |
|---|---|
| `index.html`, `styles.css` | Estructura e identidad visual (esmeralda + rosado, glass) |
| `js/app.js` | Pantallas, navegación y acciones |
| `js/calc.js` | Cálculos: saldo, reparto en pareja, presupuestos, tarjetas, metas |
| `js/data.js` | Supabase o modo demo |
| `js/config.js` | URL y anon key de Supabase |
| `supabase/migrations/` | Tablas, permisos por hogar (RLS) y bucket privado de capturas |
| `supabase/functions/leer-captura/` | Lee la imagen con Claude y devuelve JSON |
| `sw.js`, `manifest.webmanifest` | Instalación y uso sin conexión |

## Seguridad

- Las reglas RLS solo dejan ver los datos del propio hogar; los movimientos marcados “Solo yo lo veo” solo los ve quien los creó.
- Las capturas van a un bucket privado y se muestran con enlaces temporales.
- La función `leer-captura` exige sesión iniciada, así nadie de fuera gasta tu clave.
