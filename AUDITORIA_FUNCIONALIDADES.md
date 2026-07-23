# Auditoría de funcionalidades — `automejora/` (Emociones a Domicilio)

> Documento de auditoría externa. Describe **lo que existe hoy** en el proyecto Lovable (`automejora/`), sin proponer todavía ninguna migración a Shopify. Fecha de corte: 2026-07-20.

Stack detectado: React + Vite + TypeScript + Tailwind + shadcn/ui, con **dos backends de datos en paralelo**:
- **Shopify Storefront API** (catálogo real, carrito, checkout).
- **Supabase** (Postgres + Auth + Edge Functions) como base de datos propia — catálogo espejo, pedidos, borradores de checkout, wishlist, roles, logs de sincronización.

Esta convivencia de dos fuentes de verdad es el hallazgo estructural más importante y aparece repetido a lo largo del documento.

---

## 1. Páginas y flujos existentes

Rutas registradas en `src/App.tsx` (única fuente de verdad de rutas activas):

| Ruta | Página | Descripción |
|---|---|---|
| `/` | `Index` | Home. Hero interactivo (`InteractiveSelector`), `OccasionsSection` (grid de 4 categorías), `ReviewsSection` (reseñas tipo Trustpilot), CTA final, `ArcGalleryHero` (galería en arco + badges de confianza). |
| `/producto/:handle` | `ProductDetail` | Ficha de producto. Combina datos de **Supabase** (`useProductByHandle` de `useCatalog.ts`: título, descripción, imágenes, precio, categoría) con datos de **Shopify** (`useProductByHandle` de `useProducts.ts`: variantId real para poder agregar al carrito). Botón "Pedir por WhatsApp" y botón "Continuar con el pedido" (añade al carrito Shopify y navega a `/carrito`). |
| `/collections/:handle` | `Collection` | Listado por categoría, 100% sobre Supabase (`useCategoryWithProducts`). Filtro por subcategoría vía query param `?sub=`, orden (relevancia/precio/nombre), paginación "ver más" de 12 en 12. Contiene un mapa `LEGACY_REDIRECT` que redirige handles de una taxonomía antigua a la nueva (ver §5). |
| `/sobre-nosotros` | `About` | Página estática ("Somos Caro y Pepe"). Sin lógica ni backend. |
| `/contacto` | `Contact` | Datos de contacto estáticos + formulario de contacto que **no envía nada a ningún backend**: solo muestra un toast de éxito y limpia el formulario (`handleSubmit` no hace `fetch`/`supabase.insert`, es un mock). |
| `/faq` | `FAQ` | Acordeón de preguntas frecuentes, contenido estático hardcodeado (ver §6 sobre inconsistencias de reglas de negocio citadas aquí). |
| `/terminos` | `Terms` | Términos y condiciones, texto legal estático. |
| `/privacidad` | `Privacy` | Aviso de privacidad, texto legal estático. |
| `/carrito` | `Cart` | Carrito completo: lista de items (cantidad, eliminar), carrusel de "Complementos" (upsells), y panel derecho con selector de fecha/horario de entrega, ocasión y dedicatoria con botón de "sugerir mensaje". Botón "Continuar" guarda la personalización en el cart de Shopify y abre el checkout de Shopify en pestaña nueva. |
| `/checkout` | `Checkout` | Paso intermedio **antes** del checkout real de Shopify: captura remitente, destinatario, dedicatoria e instrucciones de entrega; valida reglas; inserta un registro en la tabla `orders` de Supabase (estado `pending_payment`); abre el checkout de Shopify en pestaña nueva; escucha `visibilitychange` para detectar que el usuario volvió y verificar si el carrito de Shopify quedó vacío (señal heurística de pago completado), y en ese caso marca el pedido de Supabase como `paid`. Incluye botón "Cancelar pedido". |
| `/demo` | `Demo` | Página de prueba/showcase de componentes visuales (`ArcGalleryHero`, `CardCarousel`) con imágenes de Unsplash. No forma parte del funnel de compra. |
| `/admin/sync` | `AdminSync` | Panel interno sin control de acceso por rol visible en el componente: botón para disparar la Edge Function `sync-all-products` (requiere pegar un `SYNC_SECRET` a mano), botón para crear un **pedido de prueba real en Shopify** (escenario fijo "Heider → María Camila"), y enlace a la previsualización de emails. Documenta manualmente cómo registrar el webhook de Shopify. |
| `/admin/pedidos` | `AdminOrders` | Tabla de pedidos de Supabase en tiempo real (suscripción `postgres_changes` sobre la tabla `orders`). Permite cambiar el estado del pedido (`pending_payment` / `paid` / `cancelled` / `refunded`) manualmente. |
| `/admin/sync/email-preview` | `EmailPreview` | Herramienta de desarrollo para previsualizar en vivo las plantillas de email (confirmación de compra, factura comercial) editando datos de prueba. |
| `*` | `NotFound` | 404 genérico. |

**Nota de seguridad:** `/admin/sync` y `/admin/pedidos` no están protegidas por ningún guard de autenticación/rol en el código de la página — cualquiera que conozca la URL puede abrirlas (el panel de sync sí exige pegar el `SYNC_SECRET`, pero el listado y cambio de estado de pedidos en `AdminOrders` no pide nada).

### Página existente pero **inalcanzable**
- `src/pages/Auth.tsx` (login/registro por email+contraseña y Google OAuth) **no tiene ruta registrada** en `App.tsx`. No hay ningún `<Route path="/auth">`. Ver §7.

---

## 2. Funcionalidad de personalización

Aquí se detalla cada dato que el sistema le pide al usuario, en qué paso del flujo, y con qué reglas de validación.

### 2.1 En el Carrito (`/carrito`)
| Campo | Reglas | Dónde vive el estado |
|---|---|---|
| Fecha de entrega | Botones rápidos "Hoy" (deshabilitado si no aplica la regla de corte), "Mañana", y selector de calendario "Otra fecha" (bloquea fechas anteriores a la mínima seleccionable). Domingos siempre bloqueados. | `cartStore.deliveryDate` |
| Horario de entrega | Dos franjas: Mañana (9–13h) y Tarde (13–18h). Se deshabilita la franja no disponible según la hora actual (ver §3.1 reglas de `deliveryRules.ts`). | `cartStore.deliveryTime` |
| Ocasión | Select con 7 opciones fijas (cumpleaños, amor, aniversario, agradecimiento, amistad, corporativo, "cualquier ocasión"). | `cartStore.occasion` |
| Dedicatoria/mensaje | Textarea libre, `maxLength=500`. Botón "Sugerir Mensaje" que rota entre 1–2 frases predefinidas por ocasión (hardcoded en el componente, no viene de backend). | `cartStore.dedication` |
| Observaciones por producto | Un textarea por línea de carrito (`maxLength=200`), ej. "sandwiches sin mayonesa". | `cartStore.items[].observations` |
| Complementos (upsell) | Carrusel horizontal de hasta 12 productos que no están ya en el carrito (misma consulta de productos de Shopify, `useProducts(20)`), con botón "Añadir" individual. | vía `addItem` del cart store |

### 2.2 En el Checkout intermedio (`/checkout`)
| Campo | Reglas | Componente |
|---|---|---|
| Nombre del remitente | Obligatorio. `isValidName`: 2–80 caracteres, solo letras/espacios/guiones/apóstrofes (regex unicode). | `SenderBlock` |
| Teléfono del remitente | Obligatorio. `isValidPhoneMX`: 7–14 dígitos (acepta formatos nacionales e internacionales). | `SenderBlock` |
| Nombre del destinatario | Mismas reglas que nombre del remitente. | `RecipientBlock` |
| Teléfono del destinatario | Mismas reglas que teléfono del remitente. | `RecipientBlock` |
| Fecha y horario de entrega | Reutiliza `CartDelivery` (mismo componente/reglas que en el carrito). | `RecipientBlock` → `CartDelivery` |
| Dedicatoria (tarjeta) | Textarea, `maxLength=300` (nota: en el carrito el límite era 500 — inconsistencia menor, ver §6). | `RecipientBlock` |
| Instrucciones de entrega | Textarea opcional, `maxLength=300` (ej. "Dejar en recepción si no responden"). | `RecipientBlock` |
| Observaciones por producto | Textarea por línea de pedido, `maxLength=200`, en el resumen. | `OrderSummary` |
| **Dirección, correo, forma de pago** | **Explícitamente diferidos al checkout de Shopify.** El texto de la página dice literalmente: *"Dirección de entrega, correo y pago los capturas en el siguiente paso, dentro de la pasarela segura."* | — |

El botón "Completar pedido" solo se habilita si: hay ≥1 item en el carrito, nombre y teléfono de remitente y destinatario son válidos, y el horario elegido sigue siendo válido según `isSlotAvailable` (revalidado en el momento del submit, no solo al seleccionarlo).

### 2.3 Personalización "fantasma" (construida pero no conectada al flujo activo)
Estos componentes de personalización **existen en el código pero no se renderizan en ninguna ruta activa** — no aparecen ni en `Cart.tsx`, ni en `Checkout.tsx`, ni en `CartDrawer.tsx`, ni en ninguna página con ruta registrada:

- **`QuickViewModal.tsx`**: wizard modal de 3 pasos (empaque: Kraft/Premium/Rosa → dedicatoria máx. 180 caracteres → fecha y horario) para personalizar un producto antes de añadirlo al carrito. No hay ningún botón "vista rápida" en `ProductCard`/`CatalogCard` que lo invoque.
- **`CartMessage.tsx`**: variante alterna del selector de ocasión + dedicatoria con emojis y chips de sugerencia rápida. No se usa en ningún lado (reemplazada de facto por la lógica inline de `Cart.tsx`).
- **`CartContact.tsx`**: formulario alterno de remitente/destinatario/dirección de una sola columna. No se usa (reemplazado por `SenderBlock`/`RecipientBlock`).
- **`CartProgress.tsx`**: barra de progreso "agrega $X más y desbloqueas un regalo gratis" (umbral $2,000 MXN). No se usa en ningún lado.
- **`PaymentSelector.tsx`**: selector visual de método de pago (PayPal, Mercado Pago, Oxxo/BBVA, Tarjeta) con logos SVG dibujados a mano. No se usa — el pago real ocurre siempre dentro del checkout de Shopify.
- **Wishlist / favoritos** (`wishlistStore.ts`): store completo con sincronización a Supabase (tabla `wishlists`), pero **no existe ningún botón de "corazón/favorito" en `ProductCard`, `CatalogCard` ni `CollectionCard`** que llame a `toggle()`. Solo se hidrata automáticamente si hay sesión de usuario — pero como se ve en §7, el login nunca es alcanzable.

---

## 3. Lógica de negocio específica encontrada en el código

### 3.1 Reglas de entrega (`src/lib/deliveryRules.ts`) — la fuente de verdad real
- Domingos: entrega siempre bloqueada.
- Franjas fijas: **Mañana 9:00–13:00**, **Tarde 13:00–18:00**.
- Pedido para **hoy**: solo si la hora actual es antes de las **10:30 AM** (`SAME_DAY_CUTOFF_MINUTES = 630`), y además debe respetarse un colchón mínimo de **4 horas** (`MIN_LEAD_MINUTES`) entre el momento del pedido y el inicio de la franja elegida.
- Pedido para **mañana**: la franja de la Mañana se bloquea si el pedido se hace después de las **20:00** del día anterior; la franja de la Tarde también se bloquea después de las 20:00 (mismo corte para ambas franjas del día siguiente, según el código actual).
- Fechas 2+ días en el futuro: siempre disponibles (excepto domingo).
- `getMinSelectableDate` busca hasta 14 días hacia adelante la primera fecha con al menos una franja disponible.

### 3.2 Umbral de envío gratis (candidato, no conectado)
- `src/lib/shipping.ts`: calcula costo de envío por prefijo de código postal (CDMX = $99, Edo. Méx. = $119, Nacional = $149), envío gratis si el subtotal ≥ **$1,500 MXN** (`FREE_SHIPPING_THRESHOLD`). El propio comentario del archivo dice *"Stub local — reemplazar por API real más adelante"*. **No se importa en ningún componente activo** (solo se referencia a sí mismo) — el cálculo de envío real ocurre dentro del checkout de Shopify.

### 3.3 Regalo gratis por monto (candidato, no conectado)
- `CartProgress.tsx`: umbral de **$2,000 MXN** para desbloquear "un regalo gratis". Como se indicó en §2.3, el componente no está montado en ninguna ruta activa.

### 3.4 Cálculo de precios y carrito
- El subtotal se calcula siempre en el cliente sumando `price.amount × quantity` de cada línea (Shopify no se consulta para el total mostrado, solo para crear/actualizar líneas).
- El checkout intermedio muestra "Total estimado" = subtotal (sin impuestos ni envío, que se calculan después dentro de Shopify).
- `toE164MX`: normaliza teléfonos a formato E.164 mexicano (+52) antes de mandarlos a Shopify como `buyerIdentity.phone`.

### 3.5 Personalización → Shopify (cómo se materializa)
`cartStore.savePersonalization()` traduce todo el estado de personalización a:
1. **Cart attributes** de Shopify (pares clave/valor legibles: "Fecha de entrega", "Destinatario - Nombre", "Observaciones — <producto>", etc.).
2. **Cart note** = texto de la dedicatoria.
3. **`cartBuyerIdentityUpdate`**: intenta pre-rellenar email, teléfono y dirección de envío del checkout de Shopify, pero **solo arma la dirección si existen simultáneamente** `recipientName`, `addressStreet`, `addressCity` y `addressPostalCode` — campos que, según §2, **no se capturan en ningún formulario activo actual** (existían en `CartContact.tsx`, que ya no se usa). En la práctica, con el flujo activo actual, la dirección casi nunca llega prellenada a Shopify.

### 3.6 Sincronización de catálogo Shopify → Supabase (Edge Functions)
Ubicadas en `supabase/functions/`, **fuera del bundle de frontend** (no se despliegan con Vite, corren como funciones serverless de Supabase/Deno):
- **`shopify-product-sync`**: escucha webhooks `products/create|update|delete` de Shopify (valida HMAC), y hace upsert en la tabla `products` de Supabase clasificando cada producto en una de 5 categorías (`chocolates-y-dulces`, `regalos-y-cajas`, `desayunos-y-brunch`, `flores-y-globos`, `complementos`) por tag o por keywords en el título. **Esta es la taxonomía vigente**, igual a `src/lib/categoryMapping.ts`.
- **`sync-all-products`**: función de sincronización manual masiva (botón en `/admin/sync`, protegida por un `SYNC_SECRET` pegado a mano en un input). Pagina todo el catálogo de Shopify y hace upsert en Supabase — pero clasifica con una **taxonomía distinta y desactualizada** (`flores-y-arreglos`, `dulces-y-chocolates`, `desayunos-y-boxes`, `detalles-y-complementos`), inconsistente con la que usa el frontend hoy. Ver §6.
- **`push-products-to-shopify`**: utilidad admin para crear productos en Shopify desde Supabase (dirección inversa).
- **`import-csv-catalog`**: importa un catálogo fijo embebido (`products.json` local a la función) a la tabla `products`, ligándolo por slug a `categories`.
- **`shopify-order-webhook`**: escucha el webhook `orders/paid` de Shopify (valida HMAC con `SHOPIFY_WEBHOOK_SECRET`), reconstruye los datos de personalización desde los *note attributes* de la orden, e intenta disparar dos correos transaccionales (confirmación de compra + factura comercial) invocando una función `send-transactional-email` (no incluida en el repo revisado). **El envío de correos está apagado a propósito** (`EMAILS_ENABLED` debe ser `"true"`) hasta verificar el dominio de correo — hoy el webhook solo registra el evento en logs y responde `emailsSkipped: true`.
- **`shopify-create-test-order`**: crea una orden real en Shopify vía Admin API con un escenario de prueba fijo hardcodeado ("Heider Narváez → María Camila Narváez"), usado desde el botón de prueba en `/admin/sync`.

### 3.7 Reglas de negocio citadas solo en texto (no aplicadas en código)
El contenido de `FAQ.tsx` y `Terms.tsx` describe reglas que **no están implementadas** en ningún validador ni componente:
- Política de cancelación: en `Terms.tsx` se dice "48 horas de anticipación, sin reembolso el mismo día"; en `FAQ.tsx` se dice "24 horas de anticipación con cargo del 50%, sin reembolso el mismo día". No hay ningún flujo de cancelación de cliente en el sitio (solo el admin puede cambiar el estado a `cancelled`/`refunded` manualmente).
- Costo de envío "$80 a $280 MXN según zona" (FAQ) — no coincide con los montos fijos de `shipping.ts` ($99/$119/$149), y de todas formas ese archivo no está conectado.
- Ventana de entrega express (<1h) por $120 MXN adicionales (FAQ) — no existe ningún control de UI para esto.
- Franjas de entrega narradas como "9–12, 12–15, 15–18h" en FAQ/Terms vs. las 2 franjas reales del código ("9–13 Mañana" / "13–18 Tarde").

---

## 4. Qué depende de backend propio (Supabase) vs. qué es solo visual/frontend

### 4.1 Depende de Supabase (Postgres + Auth + Edge Functions + Realtime)
| Funcionalidad | Tabla(s) / mecanismo |
|---|---|
| Catálogo mostrado en `/collections/:handle` y en `ProductDetail` (título, descripción, imágenes, precio, categoría) | `products`, `categories` |
| Registro de pedidos del checkout intermedio | `orders` (enum `order_status`: `pending_payment`, `paid`, `cancelled`, `refunded`) |
| Panel `/admin/pedidos` (listado + cambio de estado en vivo) | `orders` + suscripción realtime (`postgres_changes`) |
| Borrador de personalización que persiste entre sesiones/dispositivos ligado al `cartId` de Shopify | `checkout_drafts` + RPCs `get_checkout_draft` / `save_checkout_draft` |
| Wishlist (no conectada a UI, ver §2.3) | `wishlists` |
| Espejo del carrito al iniciar sesión (no alcanzable, ver §7) | `cart_items` |
| Roles de usuario (admin/moderator/user) | `user_roles` + RPC `has_role` (definido pero no se ve invocado desde el frontend en las páginas admin) |
| Perfiles de usuario | `profiles` |
| Registro de sincronizaciones de catálogo | `sync_logs` |
| Autenticación (email/contraseña + Google OAuth) | Supabase Auth (`AuthContext`, `Auth.tsx` — inalcanzable, ver §7) |
| Sincronización Shopify ⇄ Supabase, envío de correos transaccionales, creación de pedidos de prueba | Edge Functions (`shopify-product-sync`, `sync-all-products`, `shopify-order-webhook`, `shopify-create-test-order`, `push-products-to-shopify`, `import-csv-catalog`) |

### 4.2 Depende de Shopify (Storefront API pública, sin backend propio)
- Carrito real (creación, líneas, cantidades) y `checkoutUrl` — vía Storefront API con token público embebido en el cliente (`lib/shopify.ts`).
- Precio/variantes reales para poder comprar (`useProducts`, `useAllProducts`, `useProductByHandle` de `hooks/useProducts.ts`).
- El pago, la dirección de envío final y el correo de confirmación de Shopify ocurren **dentro del checkout hospedado por Shopify**, fuera del control de este código.

### 4.3 Solo visual / frontend puro (sin llamadas a red más allá de assets estáticos)
- Todo el home marketing: `Hero`/`InteractiveSelector`, `OccasionsSection`, `ArcGalleryHero`, `TrustBar`, `BenefitsSection`, `ProcessSection`, `AchievementsSection`, `TestimonialsSection`, `PaymentMethods`, `CTASection` (estos últimos 7 son componentes existentes pero **no montados** en ninguna ruta, ver §5).
- `About`, `FAQ`, `Terms`, `Privacy`: contenido 100% estático en el JSX.
- `Contact`: el formulario no persiste nada, solo un toast de éxito simulado.
- `CoverageWidget`: validación de cobertura por rango de código postal, calculada 100% en el cliente con dos rangos numéricos fijos (CDMX 01000–16999, Edo. Méx. 50000–57999) — no consulta ningún backend. No está montado en ninguna ruta activa.
- `DeliveryCountdown`: cuenta regresiva a las 14:00 hrs del día, calculada con `Date` del navegador. Su cutoff (14:00) **no coincide** con el cutoff real de `deliveryRules.ts` (10:30). No está montado en ninguna ruta activa (existe en `ProductDetail.tsx`, ver nota).
- Reglas de fecha/hora (`deliveryRules.ts`), validadores (`validators.ts`), formateo de precio/imagen (`shopify.ts#formatPrice`, `imageOptimizer.ts`): funciones puras, sin red.
- WhatsApp: todos los enlaces (`whatsapp.ts`, `WhatsAppFAB`, botón "Pedir por WhatsApp") son simplemente URLs `https://wa.me/...` con texto prellenado — no hay integración de API de WhatsApp Business.

> Corrección sobre `DeliveryCountdown`: sí está importado y renderizado dentro de `ProductDetail.tsx` (entre la descripción y el botón de compra), por lo que **sí es visible al usuario** en la ficha de producto — a diferencia de los demás componentes listados como huérfanos en §5, este uno sí está activo, pero su regla de negocio (cutoff 14:00) es puramente decorativa/inconsistente con la regla real que se aplica al elegir fecha (10:30).

---

## 5. Inventario de código "fantasma" (construido pero no alcanzable desde ninguna ruta activa)

Confirmado por búsqueda de referencias cruzadas: los siguientes componentes/páginas no son importados por ningún archivo activo salvo ellos mismos, o dependen de algo que nunca se monta.

| Archivo | Qué es | Por qué está huérfano |
|---|---|---|
| `pages/Auth.tsx` | Login/registro (email+password, Google OAuth) | Sin `<Route>` registrada en `App.tsx` |
| `contexts/AuthContext.tsx` (`AuthProvider`) | Provider de sesión de Supabase Auth | Nunca se envuelve la app con él (ni en `App.tsx` ni en `main.tsx`) → si algo llamara a `useAuth()` en el árbol real, lanzaría el error `"useAuth must be used within AuthProvider"` |
| `hooks/useAuthDataSync.ts` | Sincroniza wishlist/carrito al iniciar sesión | Nunca se invoca desde ningún componente activo |
| `components/product/QuickViewModal.tsx` | Wizard de personalización rápida (empaque/dedicatoria/entrega) | No hay botón que lo abra |
| `components/cart/CartMessage.tsx` | Selector de ocasión + dedicatoria (variante) | Reemplazado de facto, no importado |
| `components/cart/CartContact.tsx` | Formulario remitente/destinatario/dirección (variante) | Reemplazado de facto, no importado |
| `components/cart/CartProgress.tsx` | Barra "regalo gratis a partir de $2,000" | No importado |
| `components/checkout/PaymentSelector.tsx` | Selector visual de método de pago | No importado |
| `lib/shipping.ts` | Cálculo de envío por CP | No importado fuera de sí mismo |
| `components/home/GiftSearch.tsx` | Buscador grande de home con fallback a WhatsApp | No importado en `Index.tsx` (reemplazado por `SearchPanel` del header) |
| `components/home/CoverageWidget.tsx` | Verificador de cobertura por CP + banner de cupones | No importado en `Index.tsx` |
| `components/home/FilterPills.tsx` | Chips de filtro rápido | No importado en ningún lado |
| `components/home/TestimonialsSection.tsx`, `TrustBar.tsx`, `PaymentMethods.tsx`, `ProcessSection.tsx`, `CTASection.tsx`, `FeaturedProducts.tsx`, `BestSellers.tsx`, `AchievementsSection.tsx`, `BenefitsSection.tsx` | Secciones de home alternativas/antiguas | Ninguna se importa en `Index.tsx` actual |
| `stores/wishlistStore.ts` | Store de favoritos con sync a Supabase | Sin ningún trigger de UI (`toggle()` nunca se llama) |
| `stores/filterStore.ts` | Store de filtros (ocasión/precio/"solo hoy") | `Collection.tsx` implementa su propio ordenamiento local y no usa este store |
| `pages/demo.tsx` (`/demo`) | Playground de componentes con imágenes de Unsplash | Con ruta registrada, pero no forma parte del funnel de compra ni se linkea desde ningún menú |

Esto importa porque, al migrar, hay que decidir explícitamente si estas piezas se descartan, se resucitan, o se ignoran — no se puede asumir que "todo lo que hay en el repo" está en producción.

---

## 6. Inconsistencias detectadas entre código, textos y páginas legales

| Tema | Código (`deliveryRules.ts`) | UI secundaria | Texto (`FAQ.tsx`) | Texto (`Terms.tsx`) |
|---|---|---|---|---|
| Corte para pedido "hoy" | **10:30 AM** | `DeliveryCountdown` cuenta hasta las **14:00** | "antes de las 14:30 hrs (cierre real 10:30)" | "límite de compra 16:00 hrs" |
| Franjas de entrega | 2 franjas: 9–13h (Mañana) / 13–18h (Tarde) | — | "9–12, 12–15, 15–18h" (3 franjas) | "9–12, 12–15, 15–18h" (3 franjas) |
| Política de cancelación | No implementada en código (solo cambio manual de estado por admin) | — | 24h de anticipación, cargo del 50% | 48h de anticipación, sin cargo especificado |
| Límite de caracteres en dedicatoria | Carrito: 500 · Checkout: 300 · `QuickViewModal` (no usado): 180 | — | — | — |
| Costo de envío | No calculado en frontend (se resuelve en Shopify); `shipping.ts` (no conectado) usa $99/$119/$149 fijos | — | "$80 a $280 MXN según zona" | — |

Ningún componente activo lee el contenido de `FAQ.tsx`/`Terms.tsx` de forma dinámica: son bloques de texto redactados a mano que se fueron desalineando de las reglas reales del código con el tiempo.

---

## 7. Autenticación y roles — estado real

- Existe toda la infraestructura para auth con Supabase (contexto, página, tabla `profiles`, tabla `user_roles` con enum `admin`/`moderator`/`user`, función `has_role`), pero **el usuario nunca puede iniciar sesión** en el sitio tal como está desplegado: no hay ruta `/auth`, y `AuthProvider` no envuelve la aplicación.
- Consecuencia directa: la wishlist nunca se sincroniza con Supabase en la práctica (siempre opera en modo invitado/local), y las páginas `/admin/sync` y `/admin/pedidos` no tienen ninguna verificación de rol a nivel de componente — quedan abiertas a quien tenga la URL (mitigado parcialmente en `/admin/sync` por el `SYNC_SECRET` manual, no así en `/admin/pedidos`).

---

## 8. Resumen de assets e imágenes de producto/marca

- Imágenes de marca/hero/categorías viven como archivos locales en `src/assets/` (usadas en header, hero interactivo, footer, `OccasionsSection`) — ya inventariadas y copiadas a `automejora-theme/assets/` en el trabajo previo de este proyecto.
- Las imágenes de **producto** (catálogo) no son archivos locales: vienen de la CDN de Shopify (`cdn.shopify.com`, vía Storefront API) o, para el catálogo espejo de Supabase, de la columna `image_url`/`images` (JSON) de la tabla `products`. `imageOptimizer.ts` sabe transformar únicamente URLs de `cdn.shopify.com` y `images.unsplash.com`; cualquier otra URL se sirve tal cual, sin optimizar.
- Varias secciones "fantasma" (`ArcGalleryHero` en `demo.tsx`, `ProductCard.tsx` como fallback) usan URLs hardcodeadas de `images.unsplash.com` como placeholder cuando no hay imagen real.

---

## 9. Glosario rápido de archivos clave citados

- `src/App.tsx` — enrutamiento (fuente de verdad de páginas activas).
- `src/stores/cartStore.ts` — estado global del carrito y de toda la personalización, persistido en `localStorage`, espejo de Shopify.
- `src/lib/shopify.ts` — todas las queries/mutations GraphQL contra Storefront API.
- `src/lib/deliveryRules.ts` — única fuente real de reglas de fecha/horario.
- `src/lib/validators.ts` — validadores de nombre/teléfono/email/CP compartidos entre carrito y checkout.
- `src/hooks/useCatalog.ts` vs `src/hooks/useProducts.ts` — el primero lee de Supabase (catálogo para mostrar), el segundo de Shopify (catálogo para comprar).
- `src/integrations/supabase/types.ts` — esquema completo de la base de datos (tablas, enums, funciones RPC).
- `supabase/functions/*` — toda la lógica de servidor (fuera del bundle de React).
